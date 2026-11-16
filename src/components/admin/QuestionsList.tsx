"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TaxUnit } from "@/lib/admin/model";
import { examLabel, isReexam } from "@/lib/papers";

export interface QRow {
  id: string; paper_id: string; q_no: number; publish_status: string; review_status: string;
  primary_unit_id: string; primary_topic_id: string | null; text: string | null; answer_status: string | null; explanation_status: string | null;
}

export function QuestionsList({ rows, units }: { rows: QRow[]; units: TaxUnit[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const topicName = new Map(units.flatMap((u) => u.topics.map((t) => [t.id, t.name] as const)));
  const unitName = new Map(units.map((u) => [u.id, `Unit ${u.number}`]));
  const topics = units.find((u) => u.id === unit)?.topics ?? [];

  function toggle(id: string) {
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function run(action: string, label: string) {
    const ids = Array.from(sel);
    if (ids.length === 0) return;
    if (action === "set_topic" && !unit) { setMsg({ ok: false, text: "Pick a unit first." }); return; }
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("admin_bulk_questions", { p_ids: ids, p_action: action, p_unit: action === "set_topic" ? unit : null, p_topic: action === "set_topic" && topic ? topic : null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `${label}: ${ids.length} question(s).` });
    setSel(new Set());
    router.refresh();
  }

  async function remove() {
    const ids = Array.from(sel);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} question(s) for good? Students' saved test scores stay, but these questions disappear from their reviews.`)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("admin_delete_questions", { p_ids: ids });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `Deleted ${ids.length} question(s).` });
    setSel(new Set());
    router.refresh();
  }

  const btn = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium disabled:opacity-60";

  return (
    <div>
      <label className="flex items-center gap-2 px-1 text-sm text-muted">
        <input type="checkbox" className="h-5 w-5" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} />
        Select all on this page
      </label>

      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className={`flex items-start gap-3 rounded-xl border bg-surface p-3 ${sel.has(r.id) ? "border-primary" : "border-line"}`}>
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.id}`} />
            <Link href={`/admin/questions/${r.id}`} className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{examLabel(r.paper_id)}, Q{r.q_no}</span>
                {isReexam(r.paper_id) && <span className="rounded bg-ochre/20 px-1 text-[10px] font-semibold uppercase text-[#7A5410]">re-exam</span>}
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${r.publish_status === "published" ? "bg-good/10 text-good" : "bg-ochre/15 text-[#7A5410]"}`}>{r.publish_status}</span>
                {r.review_status === "verified" && <span className="text-xs text-good">verified</span>}
                {r.explanation_status === "none" && <span className="text-xs text-muted">no explanation</span>}
                {r.answer_status && ["dropped", "disputed", "provisional", "multiple"].includes(r.answer_status) && <span className="text-xs text-[#7A5410]">{r.answer_status}</span>}
              </span>
              <span className="mt-1 line-clamp-2 block text-[15px]">{r.text || "(no text)"}</span>
              <span className="mt-1 block text-xs text-muted">{r.id}, {(r.primary_topic_id && topicName.get(r.primary_topic_id)) || unitName.get(r.primary_unit_id) || r.primary_unit_id}</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No questions match.</li>}
      </ul>

      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}

      {sel.size > 0 && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 mt-4 space-y-2 rounded-xl border border-line bg-surface p-3 shadow-sm md:bottom-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-2 text-sm font-semibold">{busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{sel.size} selected</span>
            <button type="button" disabled={busy} onClick={() => run("publish", "Published")} className={`${btn} bg-primary text-white`}>Publish</button>
            <button type="button" disabled={busy} onClick={() => run("unpublish", "Moved to draft")} className={btn}>Unpublish</button>
            <button type="button" disabled={busy} onClick={() => run("verify", "Marked verified")} className={btn}>Mark verified</button>
            <button type="button" disabled={busy} onClick={() => run("unverify", "Marked not verified")} className={btn}>Unverify</button>
            <button type="button" disabled={busy} onClick={remove} className={`${btn} text-danger`}>Delete</button>
            <button type="button" onClick={() => setSel(new Set())} className="ml-auto text-sm font-medium text-primary-ink underline underline-offset-4">Clear</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Move to</span>
            <select aria-label="Unit" value={unit} onChange={(e) => { setUnit(e.target.value); setTopic(""); }} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
              <option value="">Unit</option>
              {units.map((u) => <option key={u.id} value={u.id}>Unit {u.number}</option>)}
            </select>
            <select aria-label="Topic" value={topic} disabled={!unit} onChange={(e) => setTopic(e.target.value)} className="max-w-[14rem] rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
              <option value="">No specific topic</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" disabled={busy || !unit} onClick={() => run("set_topic", "Moved")} className={btn}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
