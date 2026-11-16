"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseWorkbook, type ParsedPaper, type ParsedWorkbook } from "@/lib/admin/excel";
import { examLabel } from "@/lib/papers";
import { planPapers, type PaperTarget } from "@/lib/admin/papers-plan";
import { diffFields, makeId, resolveTag, rowToQuestion, stateOf, validateQuestion, type AdminQuestion, type Issue, type Tag, type TaxUnit } from "@/lib/admin/model";

interface Analysed {
  rowNo: number;
  q: AdminQuestion;
  issues: Issue[];
  isUpdate: boolean;
  changed: string[];
  state: "new" | "changed" | "unchanged" | "error";
}

interface Props {
  unitsBySubject: Record<string, TaxUnit[]>;
  subjects: { id: string; code: string }[];
  existingPapers: { id: string; total: number; subject: string; year: number; session: string; shift: number; kind: string; language: string }[];
}

export function ImportClient({ unitsBySubject, subjects, existingPapers }: Props) {
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
    const keyOf = (subject: string, year: number, session: string, language: string, shift: number, kind: string): string => `${subject}|${year}|${session}|${language}|${shift}|${kind}`;
    const cycleOf = (subject: string, year: number, session: string, language: string): string => `${subject}|${year}|${session}|${language}`;

    // 1. Final code of every paper (database and sheet together), and a way to trace any typed code to its paper.
    const plan = planPapers(subjects, existingPapers, parsed.papers);
    paperIssues.push(...plan.issues);
    for (const sid of plan.subjectsOnSheet) if ((unitsBySubject[sid] ?? []).length === 0) paperIssues.push(`SYLLABUS:${sid}`);
    const resolve = plan.resolve;
    const sheetByKey = new Map<string, ParsedPaper>(plan.papers.map((p) => [p.id, p]));

    for (const ps of parsed.passages) {
      const t = resolve(ps.paper_id);
      if (t) ps.paper_id = t.code;
    }

    // 4. Questions already saved for the papers this file touches (to tell new from changed).
    const live = new Map<string, AdminQuestion>();
    const passageIds = new Set<string>(parsed.passages.map((x) => x.id));
    const targets = new Map<string, PaperTarget | null>();
    for (const r of parsed.rows) if (!targets.has(r.q.paper_id)) targets.set(r.q.paper_id, resolve(r.q.paper_id));
    const existingIds = Array.from(new Set(Array.from(targets.values()).map((t) => t?.existingId).filter((x): x is string => Boolean(x))));
    for (const pid of existingIds) {
      const { data } = await supabase.from("questions").select("*, question_tags(*), question_keys(*)").eq("paper_id", pid);
      for (const row of data ?? []) live.set(`${pid}|${row.q_no as number}`, rowToQuestion(row));
      const ps = await supabase.from("passages").select("id").eq("paper_id", pid);
      for (const x of ps.data ?? []) passageIds.add(x.id as string);
    }

    // 5. Check every row.
    const seenIds = new Map<string, number>();
    const out: Analysed[] = [];
    for (const r of parsed.rows) {
      const q = r.q;
      const typed = q.paper_id;
      const target = targets.get(typed) ?? null;
      const issues: Issue[] = r.parseIssues.map((m) => ({ level: "error" as const, msg: m }));
      let subject = "";
      let total: number | undefined;
      if (!target || !target.code) {
        issues.push({ level: "error", msg: `Paper "${typed}" is not on the Papers sheet or in the database. Its year, session, shift and exam kind must match a row on the Papers sheet.` });
      } else {
        q.paper_id = target.code;
        q.id = Number.isInteger(q.q_no) ? makeId(target.code, q.q_no) : "";
        subject = target.subject;
        total = target.total;
      }
      const units = unitsBySubject[subject] ?? [];
      if (subject && units.length === 0) {
        issues.push({ level: "error", msg: `The ${subject} syllabus is not set up yet. Add it under Admin > Syllabus.` });
      } else if (subject) {
        const p1 = resolveTag(r.primaryRaw, units);
        if (p1.tag) q.primary = p1.tag;
        else if (r.primaryRaw) issues.push({ level: "error", msg: p1.error ?? "Main topic not recognised." });
        const extra: Tag[] = [];
        for (const raw of r.tagsRaw) {
          const t = resolveTag(raw, units);
          if (t.tag) extra.push(t.tag);
          else issues.push({ level: "error", msg: t.error ?? `Extra tag "${raw}" not recognised.` });
        }
        q.tags = extra.filter((t) => !(t.unit === q.primary.unit && t.topic === q.primary.topic));
        issues.push(...validateQuestion(q, { units, passageIds, paperTotal: total }));
      }
      if (q.id && seenIds.has(q.id)) {
        issues.push({ level: "error", msg: `Duplicate of row ${seenIds.get(q.id)} in this file.` });
        out.push({ rowNo: r.rowNo, q, issues, isUpdate: false, changed: [], state: "error" });
        continue;
      }
      if (q.id) seenIds.set(q.id, r.rowNo);

      const existing = target?.existingId ? live.get(`${target.existingId}|${q.q_no}`) : undefined;
      const changed = existing ? diffFields(q, existing) : [];
      let state: Analysed["state"];
      if (issues.some((i) => i.level === "error")) state = "error";
      else if (existing && changed.length === 0) state = "unchanged";
      else state = stateOf(issues, Boolean(existing));
      out.push({ rowNo: r.rowNo, q, issues, isUpdate: Boolean(existing), changed, state });
    }

    // 6. A plain summary of the papers, so a wrong shift or re-exam is spotted before saving.
    const lines = Array.from(sheetByKey.values()).filter((p) => p.id).map((p) => `${p.id}  =  ${examLabel(p.id)}${p.exam_kind === "reexam" ? " (re-exam)" : ""}`);
    if (lines.length) paperIssues.unshift(`INFO:${lines.join("\n")}`);
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

      const goodPapers = wb.papers.filter((p) => p.id);
      if (goodPapers.length) {
        const { error: e } = await supabase.from("staged_papers").insert(goodPapers.map((p) => ({ batch_id: id, paper_id: p.id, data: p })));
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
      {paperIssues.filter((m) => m.startsWith("SYLLABUS:")).length > 0 && (
        <div className="mt-4 rounded-lg border border-ochre/50 bg-ochre/15 p-3 text-sm">
          <p className="font-semibold">The syllabus for {Array.from(new Set(paperIssues.filter((m) => m.startsWith("SYLLABUS:")).map((m) => m.slice(9)))).join(", ")} is not set up yet.</p>
          <p className="mt-1">Topics in your sheet can't be matched until it is. <Link href="/admin/syllabus" className="font-medium text-primary-ink underline underline-offset-4">Open Admin &gt; Syllabus</Link>, add it once, then upload again.</p>
        </div>
      )}
      {paperIssues.filter((m) => m.startsWith("INFO:")).map((m, i) => (
        <div key={i} className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">
          <p className="font-semibold">Papers in this file</p>
          <ul className="mt-1 space-y-0.5 text-muted">
            {m.slice(5).split("\n").map((l, k) => <li key={k}>{l}</li>)}
          </ul>
        </div>
      ))}
      {paperIssues.filter((m) => !m.startsWith("SYLLABUS:") && !m.startsWith("INFO:")).length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {paperIssues.filter((m) => !m.startsWith("SYLLABUS:") && !m.startsWith("INFO:")).map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}

      {wb && (
        <details className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">How your file was read</summary>
          <p className="mt-2">Sheets found: {wb.info.sheets.length ? wb.info.sheets.join(", ") : "none listed"}</p>
          {Object.entries(wb.info.used).map(([role, name]) => (
            <p key={role} className="mt-1">{role} sheet: <b>{name}</b>{wb.info.unknownHeaders[role]?.length ? `. Columns not recognised (ignored): ${wb.info.unknownHeaders[role].join(", ")}` : ""}</p>
          ))}
        </details>
      )}

      {wb && (wb.rows.length > 0 || wb.papers.length > 0) && (
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
