"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SubjectInit {
  id: string; name: string; nta_code: string; id_prefix: string; questions_per_paper: number; minutes_per_paper: number;
}

const inputCls = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary";
const slug = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

export function SubjectForm({ mode, initial, locked }: { mode: "create" | "edit"; initial?: SubjectInit; locked?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [idTouched, setIdTouched] = useState(mode === "edit");
  const [code, setCode] = useState(initial?.nta_code ?? "");
  const [prefix, setPrefix] = useState(initial?.id_prefix ?? "");
  const [prefixTouched, setPrefixTouched] = useState(mode === "edit");
  const [qpp, setQpp] = useState<number>(initial?.questions_per_paper ?? 100);
  const [mins, setMins] = useState<number>(initial?.minutes_per_paper ?? 120);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onName(v: string) {
    setName(v);
    if (!idTouched) {
      const s = slug(v);
      setId(s);
      if (!prefixTouched) setPrefix(s.replace(/_/g, "").slice(0, 3));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient().rpc("admin_save_subject", {
      p: { id, name, nta_code: code, id_prefix: prefix, questions_per_paper: qpp, minutes_per_paper: mins },
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    if (mode === "create") router.push(`/admin/syllabus/${(data as any).id}`);
    else { setMsg({ ok: true, text: "Saved." }); router.refresh(); }
  }

  async function remove() {
    if (!initial || !window.confirm(`Delete ${initial.name} and its syllabus? This cannot be undone.`)) return;
    const { error } = await createClient().rpc("admin_delete_subject", { p_subject: initial.id });
    if (error) setMsg({ ok: false, text: error.message });
    else router.push("/admin/syllabus");
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium sm:col-span-2">
        Subject name
        <input required className={inputCls} value={name} onChange={(e) => onName(e.target.value)} placeholder="Sociology" />
      </label>
      <label className="block text-sm font-medium">
        Subject id
        <input required className={`${inputCls} ${mode === "edit" ? "bg-page" : ""}`} value={id} readOnly={mode === "edit"} onChange={(e) => { setIdTouched(true); setId(slug(e.target.value)); }} />
        <span className="mt-1 block text-xs font-normal text-muted">Used in the workbook's subject column. Letters, numbers, underscore.</span>
      </label>
      <label className="block text-sm font-medium">
        NTA subject code
        <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="80" />
        <span className="mt-1 block text-xs font-normal text-muted">Starts every question id, like 80-2025-JUN-E-045.</span>
      </label>
      <label className="block text-sm font-medium">
        Id prefix for units and topics
        <input required className={`${inputCls} ${locked ? "bg-page" : ""}`} value={prefix} readOnly={locked} onChange={(e) => { setPrefixTouched(true); setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)); }} placeholder="geo" />
        <span className="mt-1 block text-xs font-normal text-muted">{locked ? "Locked because the syllabus exists." : "2 to 6 letters. Codes look like geo-u01-t03."}</span>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          Questions per paper
          <input type="number" min={1} className={inputCls} value={qpp} onChange={(e) => setQpp(Number(e.target.value))} />
        </label>
        <label className="block text-sm font-medium">
          Minutes
          <input type="number" min={1} className={inputCls} value={mins} onChange={(e) => setMins(Number(e.target.value))} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60">
          {mode === "create" ? "Create subject" : "Save details"}
        </button>
        {mode === "edit" && <button type="button" onClick={remove} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-danger">Delete subject</button>}
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
