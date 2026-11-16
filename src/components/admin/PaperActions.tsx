"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PaperDelete({ paperId, label, questions }: { paperId: string; label: string; questions: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    const ok = window.confirm(`Delete the whole paper ${label} (${paperId})?\n\nThis removes its ${questions} question(s), explanations, saved questions and reports. Students' saved test scores stay, but these questions disappear from their reviews. This cannot be undone.`);
    if (!ok) return;
    setBusy(true);
    setErr(null);
    const { error } = await createClient().rpc("admin_delete_paper", { p_paper: paperId });
    setBusy(false);
    if (error) setErr(error.message);
    else router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={remove} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-danger disabled:opacity-60">{busy ? "Deleting" : "Delete paper"}</button>
      {err && <span role="alert" className="mt-1 text-xs text-danger">{err}</span>}
    </span>
  );
}

export function NormalizeCodes() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient().rpc("admin_normalize_codes", { p_subject: null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    const n = (data as any).renamed as number;
    setMsg({ ok: true, text: n ? `Updated ${n} paper code(s). Their questions were renamed with them.` : "All paper codes are already correct." });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={busy} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium disabled:opacity-60">{busy ? "Working" : "Fix paper codes"}</button>
      {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</span>}
    </div>
  );
}
