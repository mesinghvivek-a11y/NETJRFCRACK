"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseWorkbook, type ParsedWorkbook } from "@/lib/admin/excel";
import { diffFields, rowToQuestion, stateOf, validateQuestion, type AdminQuestion, type Issue, type TaxUnit } from "@/lib/admin/model";

interface Analysed {
  rowNo: number;
  q: AdminQuestion;
  issues: Issue[];
  isUpdate: boolean;
  changed: string[];
  state: "new" | "changed" | "unchanged" | "error";
}

interface Props {
  units: TaxUnit[];
  subjects: { id: string; code: string }[];
  existingPapers: { id: string; total: number }[];
}

export function ImportClient({ units, subjects, existingPapers }: Props) {
  const subjectIds = subjects.map((x) => x.id);
  const codes: Record<string, string> = Object.fromEntries(subjects.map((x) => [x.id, x.code]));
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [wb, setWb] = useState<ParsedWorkbook | null>(null);
  const [rows, setRows] = useState<Analysed[]>([]);
  const [paperIssues, setPaperIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [staging, setStaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setWb(null);
    setRows([]);
    setFileName(file.name);
    try {
      const parsed = await parseWorkbook(file);
      const result = await analyse(parsed);
      setWb(parsed);
      setRows(result.rows);
      setPaperIssues([...parsed.fileIssues, ...result.paperIssues]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  }

  async function analyse(parsed: ParsedWorkbook): Promise<{ rows: Analysed[]; paperIssues: string[] }> {
    const supabase = createClient();
    const paperIssues: string[] = [];
    const totals = new Map<string, number>(existingPapers.map((p) => [p.id, p.total]));
    const seenPapers = new Set<string>();
    for (const p of parsed.papers) {
      if (!p.id) paperIssues.push(`A paper row (${p.subject || "no subject"}, ${p.year || "no year"}) is missing subject, year, session or language, so no paper code could be built.`);
      else if (seenPapers.has(p.id)) paperIssues.push(`Paper ${p.id} appears twice on the Papers sheet.`);
      seenPapers.add(p.id);
      
      const lang = String((p as any).language ?? (p as any).lang ?? "").toUpperCase();
      if (!["E", "H"].includes(lang)) paperIssues.push(`Paper ${p.id}: language must be E or H.`);

      if (!subjectIds.includes(p.subject)) paperIssues.push(`Paper ${p.id}: subject "${p.subject}" is not set up yet.`);
      if (!["june", "december"].includes(p.session)) paperIssues.push(`Paper ${p.id}: session must be june or december.`);
      if (!["regular", "reexam"].includes(p.exam_kind)) paperIssues.push(`Paper ${p.id}: exam_kind must be regular or reexam.`);
      if (!Number.isInteger(p.year) || p.year < 2014) paperIssues.push(`Paper ${p.id}: year is not valid.`);
      if (![50, 75, 100].includes(p.total_questions)) paperIssues.push(`Paper ${p.id}: total_questions must be 50, 75 or 100.`);
      totals.set(p.id, p.total_questions);
    }

    const paperIds = Array.from(new Set(parsed.rows.map((r) => r.q.paper_id).filter((x) => x.length > 0)));
    const live = new Map<string, AdminQuestion>();
    const passageIds = new Set<string>(parsed.passages.map((p) => p.id));
    for (const pid of paperIds) {
      const { data } = await supabase.from("questions").select("*, question_tags(*), question_keys(*)").eq("paper_id", pid);
      for (const row of data ?? []) live.set(row.id as string, rowToQuestion(row));
      const ps = await supabase.from("passages").select("id").eq("paper_id", pid);
      for (const p of ps.data ?? []) passageIds.add(p.id as string);
    }

    const seenIds = new Map<string, number>();
    const out: Analysed[] = [];
    for (const r of parsed.rows) {
      const q = r.q;
      const issues: Issue[] = r.parseIssues.map((m) => ({ level: "error" as const, msg: m }));
      if (!totals.has(q.paper_id)) issues.push({ level: "error", msg: `Paper "${q.paper_id}" is not on the Papers sheet or in the database.` });
      issues.push(...validateQuestion(q, { units, passageIds, paperTotal: totals.get(q.paper_id) }));
      if (q.id && seenIds.has(q.id)) {
        issues.push({ level: "error", msg: `Duplicate of row ${seenIds.get(q.id)} in this file.` });
        out.push({ rowNo: r.rowNo, q, issues, isUpdate: false, changed: [], state: "error" });
        continue;
      }
      if (q.id) seenIds.set(q.id, r.rowNo);

      const existing = live.get(q.id);
      const changed = existing ? diffFields(q, existing) : [];
      let state: Analysed["state"];
      if (issues.some((i) => i.level === "error")) state = "error";
      else if (existing && changed.length === 0) state = "unchanged";
      else state = stateOf(issues, Boolean(existing));
      out.push({ rowNo: r.rowNo, q, issues, isUpdate: Boolean(existing), changed, state });
    }
    return { rows: out, paperIssues };
  }

  const count = (s: Analysed["state"]): number => rows.filter((r) => r.state === s).length;
  const toStage = rows.filter((r) => r.state !== "unchanged" && !(r.state === "error" && r.issues.some((i) => i.msg.startsWith("Duplicate of row"))));

  async function stage() {
    if (!wb) return;
    setStaging(true);
    setError(null);
    try {
      const supabase = createClient();
      const summary = { new: count("new"), changed: count("changed"), unchanged: count("unchanged"), errors: count("error") };
      const { data: batch, error: e1 } = await supabase.from("import_batches").insert({ filename: fileName, summary }).select("id").single();
      if (e1 || !batch) throw new Error(e1?.message ?? "Could not create the batch.");
      const id = batch.id as string;

      if (wb.papers.length) {
        const { error: e } = await supabase.from("staged_papers").insert(wb.papers.map((p) => ({ batch_id: id, paper_id: p.id, data: p })));
        if (e) throw new Error(e.message);
      }
      if (wb.passages.length) {
        const { error: e } = await supabase.from("staged_passages").insert(wb.passages.map((p) => ({ batch_id: id, passage_id: p.id, paper_id: p.paper_id, body: p.body })));
        if (e) throw new Error(e.message);
      }
      const payload = toStage.map((r) => ({
        batch_id: id, paper_id: r.q.paper_id, q_no: r.q.q_no, question_id: r.q.id, data: r.q,
        state: r.state === "unchanged" ? "new" : r.state, is_update: r.isUpdate, changed: r.changed, issues: r.issues,
      }));
      for (let i = 0; i < payload.length; i += 100) {
        const { error: e } = await supabase.from("staged_questions").insert(payload.slice(i, i + 100));
        if (e) throw new Error(e.message);
      }
      router.push(`/admin/batches/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the review list.");
      setStaging(false);
    }
  }

  const problems = rows.filter((r) => r.issues.length > 0 && r.state !== "unchanged");

  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface p-8 text-center hover:border-primary">
        {busy ? <Loader2 className="animate-spin text-primary" aria-hidden="true" /> : <Upload className="text-primary" aria-hidden="true" />}
        <span className="mt-2 font-medium">{busy ? "Reading and checking the workbook" : fileName || "Choose your .xlsx workbook"}</span>
        <span className="mt-1 text-sm text-muted">Sheets used: Papers, Questions, Passages</span>
        <input type="file" accept=".xlsx" className="sr-only" onChange={onFile} disabled={busy || staging} />
      </label>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      {paperIssues.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {paperIssues.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}

      {wb && (
        <div className="mt-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "New", v: count("new"), cls: "text-good" },
              { label: "Changed", v: count("changed"), cls: "text-[#7A5410]" },
              { label: "Unchanged", v: count("unchanged"), cls: "text-muted" },
              { label: "With errors", v: count("error"), cls: "text-danger" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-line bg-surface p-4">
                <p className={`text-2xl font-bold ${c.cls}`}>{c.v}</p>
                <p className="text-sm text-muted">{c.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">{wb.papers.length} paper(s), {wb.passages.length} passage(s) and {rows.length} question row(s) read.</p>

          {problems.length > 0 && (
            <div className="mt-5">
              <h2 className="font-semibold">Things to look at</h2>
              <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-sm">
                {problems.slice(0, 80).map((r) => (
                  <li key={r.rowNo}>
                    <span className="font-medium">Row {r.rowNo}{r.q.id ? `, ${r.q.id}` : ""}</span>
                    {r.issues.slice(0, 4).map((i, k) => (
                      <span key={k} className={`block ${i.level === "error" ? "text-danger" : "text-[#7A5410]"}`}>{i.msg}</span>
                    ))}
                  </li>
                ))}
              </ul>
              {problems.length > 80 && <p className="mt-1 text-xs text-muted">Showing the first 80. All of them appear in the review list.</p>}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={stage}
              disabled={staging || toStage.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60"
            >
              {staging && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Save to review list ({toStage.length})
            </button>
            <p className="text-sm text-muted">Rows with errors are saved too, so you can fix them in the editor. They will not be published until fixed.</p>
          </div>
        </div>
      )}
    </div>
  );
}
