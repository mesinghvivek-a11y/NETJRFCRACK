"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PRESETS, type Preset } from "@/lib/syllabus-presets";

export function PresetCards({ existing }: { existing: Record<string, number> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const todo = PRESETS.filter((p) => !(existing[p.id] > 0));
  if (todo.length === 0) return null;

  async function load(p: Preset) {
    setBusy(p.id);
    setMsg(null);
    const supabase = createClient();
    const a = await supabase.rpc("admin_save_subject", {
      p: { id: p.id, name: p.name, nta_code: p.nta_code, id_prefix: p.id_prefix, questions_per_paper: p.questions_per_paper, minutes_per_paper: p.minutes_per_paper },
    });
    if (a.error) { setBusy(null); setMsg({ ok: false, text: a.error.message }); return; }
    const units = p.units.map((u, i) => ({ number: i + 1, name: u.name, topics: u.topics.map((t) => ({ name: t })) }));
    const b = await supabase.rpc("admin_apply_syllabus", { p_subject: p.id, p_units: units, p_remove_missing: false });
    setBusy(null);
    if (b.error) setMsg({ ok: false, text: b.error.message });
    else {
      setMsg({ ok: true, text: `${p.name} syllabus loaded.` });
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary-wash p-4">
      <p className="font-semibold text-primary-ink">Quick start</p>
      <p className="mt-1 text-sm">Load a ready-made syllabus in one tap. You can edit it afterwards.</p>
      <ul className="mt-3 space-y-2">
        {todo.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-3">
            <span>
              <span className="font-medium">{p.name}</span>
              <span className="block text-xs text-muted">{p.units.length} units, {p.units.reduce((n, u) => n + u.topics.length, 0)} topics, NTA code {p.nta_code}</span>
            </span>
            <button type="button" onClick={() => load(p)} disabled={busy !== null} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-ink disabled:opacity-60">
              {busy === p.id && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Load syllabus
            </button>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
