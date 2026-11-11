"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { stateOf, validateQuestion, type AdminQuestion, type Issue, type TaxUnit } from "@/lib/admin/model";

interface Row {
  id: string; paper_id: string; q_no: number; question_id: string; state: "new" | "changed" | "error";
  is_update: boolean; changed: string[]; issues: Issue[]; text: string | null; topic: string | null; unit: string | null; review: string | null;
}

const badge: Record<string, string> = {
  new: "bg-good/10 text-good",
  changed: "bg-ochre/15 text-[#7A5410]",
  error: "bg-danger/10 text-danger",
};

export function BatchTable({ batchId, status, summary, units, rows }: { batchId: string; status: string; summary: any; units: TaxUnit[]; rows: Row[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "new" | "changed" | "error">("all");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkUnit, setBulkUnit] = useState("");
  const [bulkTopic, setBulkTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const editable = status === "staged";
  const shown = useMemo(
    () => rows.filter((r) => (filter === "all" || r.state === filter) && (!search || (r.text ?? "").toLowerCase().includes(search.toLowerCase()) || r.question_id.toLowerCase().includes(search.toLowerCase()))),
    [rows, filter, search],
  );
  const n = (s: string): number => rows.filter((r) => r.state === s).length;
  const okCount = n("new") + n("changed");

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulk(kind: "topic" | "verified") {
    if (sel.size === 0) return;
    if (kind === "topic" && !bulkUnit) { setMsg({ ok: false, text: "Pick a unit first." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const ids = Array.from(sel);
      const { data, error } = await supabase.from("staged_questions").select("id, is_update, data").in("id", ids);
      if (error) throw new Error(error.message);
      const ctx = { units };
      for (const row of data ?? []) {
        const d: AdminQuestion = structuredClone(row.data as AdminQuestion);
        if (kind === "topic") d.primary = { unit: bulkUnit, topic: bulkTopic || undefined };
        else d.review_status = "verified";
        const issues = validateQuestion(d, ctx).filter((i) => !i.msg.startsWith("Passage "));
        const { error: e } = await supabase.from("staged_questions").update({ data: d, issues, state: stateOf(issues, row.is_update as boolean) }).eq("id", row.id);
        if (e) throw new Error(e.message);
      }
      setSel(new Set());
      setMsg({ ok: true, text: `Updated ${ids.length} question(s).` });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Update failed." });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!window.confirm(`Publish ${okCount} question(s) now? Students will see them straight away.${n("error") ? ` ${n("error")} row(s) with errors will be skipped.` : ""}`)) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient().rpc("admin_publish_batch", { p_batch: batchId });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: `Published ${(data as any).published} question(s). ${(data as any).skipped_errors} skipped because of errors.` });
      router.refresh();
    }
  }

  async function discard() {
    if (!window.confirm("Discard this whole review list? Nothing will be published.")) return;
    setBusy(true);
    const { error } = await createClient().from("import_batches").update({ status: "discarded" }).eq("id", batchId);
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else router.push("/admin");
  }

  const topicsOfBulk = units.find((u) => u.id === bulkUnit)?.topics ?? [];
  const sel_ = "rounded-lg border border-line bg-surface px-2 py-1.5 text-sm";

  return (
    <div>
      {status !== "staged" && (
        <p className="mb-4 rounded-lg bg-primary-wash px-3 py-2 text-sm text-primary-ink">This list is {status}. {summary?.published !== undefined ? `${summary.published} question(s) were published.` : ""}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "new", "changed", "error"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}
          >
            {f === "all" ? `All ${rows.length}` : `${f === "error" ? "Errors" : f[0].toUpperCase() + f.slice(1)} ${n(f)}`}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search text or id"
          aria-label="Search"
          className="ml-auto w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary sm:w-56"
        />
      </div>

      {editable && sel.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <select className={sel_} value={bulkUnit} onChange={(e) => { setBulkUnit(e.target.value); setBulkTopic(""); }} aria-label="Unit">
            <option value="">Unit</option>
            {units.map((u) => <option key={u.id} value={u.id}>Unit {u.number}</option>)}
          </select>
          <select className={`${sel_} max-w-[14rem]`} value={bulkTopic} onChange={(e) => setBulkTopic(e.target.value)} disabled={!bulkUnit} aria-label="Topic">
            <option value="">No specific topic</option>
            {topicsOfBulk.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={() => bulk("topic")} className="rounded-lg bg-ink px-3 py-1.5 font-medium text-white disabled:opacity-60">Set main topic</button>
          <button type="button" disabled={busy} onClick={() => bulk("verified")} className="rounded-lg border border-line px-3 py-1.5 font-medium">Mark verified</button>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {shown.map((r) => {
          const errs = r.issues.filter((i) => i.level === "error").length;
          const warns = r.issues.length - errs;
          return (
            <li key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
              {editable && (
                <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.question_id}`} className="mt-1 h-5 w-5 shrink-0" />
              )}
              <Link href={`/admin/batches/${batchId}/${r.id}`} className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{r.question_id}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge[r.state]}`}>{r.state === "error" ? "errors" : r.state}</span>
                  {r.review === "verified" && <span className="text-xs text-good">verified</span>}
                  {errs > 0 && <span className="text-xs text-danger">{errs} error(s)</span>}
                  {warns > 0 && <span className="text-xs text-[#7A5410]">{warns} warning(s)</span>}
                  {r.changed.length > 0 && <span className="text-xs text-muted">changed: {r.changed.join(", ")}</span>}
                </span>
                <span className="mt-1 line-clamp-2 block text-[15px]">{r.text || "(no question text)"}</span>
                <span className="mt-1 block text-xs text-muted">{r.topic ?? r.unit ?? "no topic"}</span>
              </Link>
            </li>
          );
        })}
        {shown.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">Nothing matches.</li>}
      </ul>

      {msg && <p role="status" className={`mt-4 text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}

      {editable && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 md:bottom-4">
          <button type="button" onClick={publish} disabled={busy || okCount === 0} className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60">
            Publish {okCount} question(s)
          </button>
          <button type="button" onClick={discard} disabled={busy} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-danger">Discard list</button>
          {n("error") > 0 && <span className="text-sm text-muted">{n("error")} with errors will be skipped</span>}
        </div>
      )}
    </div>
  );
}
