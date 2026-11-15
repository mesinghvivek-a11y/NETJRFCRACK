"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, Trash2, Download, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fingerprint, mergeParsed, newKey, parseSyllabusRows, parseSyllabusText, toCsv, toPayload, type DraftUnit } from "@/lib/admin/syllabus";

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary";

function clone(units: DraftUnit[]): DraftUnit[] {
  return units.map((u) => ({ ...u, topics: u.topics.map((t) => ({ ...t })) }));
}

export function SyllabusEditor({ subjectId, initialUnits }: { subjectId: string; initialUnits: DraftUnit[] }) {
  const router = useRouter();
  const [units, setUnits] = useState<DraftUnit[]>(() => clone(initialUnits));
  const [base, setBase] = useState<string>(() => fingerprint(initialUnits));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});
  const [newUnit, setNewUnit] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setUnits(clone(initialUnits));
    setBase(fingerprint(initialUnits));
  }, [initialUnits]);

  const dirty = useMemo(() => fingerprint(units) !== base, [units, base]);
  const removed = useMemo(() => {
    const now = new Set<string>();
    for (const u of units) { if (u.id) now.add(u.id); for (const t of u.topics) if (t.id) now.add(t.id); }
    let n = 0;
    for (const u of initialUnits) { if (u.id && !now.has(u.id)) n++; for (const t of u.topics) if (t.id && !now.has(t.id)) n++; }
    return n;
  }, [units, initialUnits]);
  const topicCount = units.reduce((n, u) => n + u.topics.length, 0);

  function edit(fn: (d: DraftUnit[]) => void) {
    setUnits((prev) => {
      const d = clone(prev);
      fn(d);
      return d;
    });
    setMsg(null);
  }

  function addTopic(ui: number) {
    const key = units[ui].key;
    const name = (newTopic[key] ?? "").trim();
    if (!name) return;
    edit((d) => { d[ui].topics.push({ key: newKey(), name, is_legacy: false, used: 0 }); });
    setNewTopic((p) => ({ ...p, [key]: "" }));
  }

  function addUnit() {
    const name = newUnit.trim();
    if (!name) return;
    edit((d) => { d.push({ key: newKey(), number: Math.max(0, ...d.map((x) => x.number)) + 1, name, topics: [], used: 0 }); });
    setNewUnit("");
  }

  function applyText() {
    const { units: parsed, errors } = parseSyllabusText(paste);
    if (parsed.length === 0) { setMsg({ ok: false, text: errors[0] ?? "Nothing to add. Start a unit with Unit 1: Name." }); return; }
    const res = mergeParsed(units, parsed);
    setUnits(res.units);
    setPaste("");
    setMsg({ ok: true, text: `Added ${res.addedUnits} unit(s) and ${res.addedTopics} topic(s) below. Check them, then Save.${errors.length ? ` ${errors.length} line(s) ignored.` : ""}` });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const mod: any = await import("read-excel-file");
      const read: any = mod.default ?? mod;
      const rows = await read(file);
      const { units: parsed, errors } = parseSyllabusRows(rows);
      if (parsed.length === 0) { setMsg({ ok: false, text: errors[0] ?? "Nothing found in that file." }); return; }
      const res = mergeParsed(units, parsed);
      setUnits(res.units);
      setMsg({ ok: true, text: `Read ${parsed.length} unit(s): ${res.addedUnits} new unit(s), ${res.addedTopics} new topic(s). Check them, then Save.` });
    } catch {
      setMsg({ ok: false, text: "Could not read that file. Use an .xlsx file." });
    }
    e.target.value = "";
  }

  async function save() {
    for (const u of units) {
      if (!u.name.trim()) { setMsg({ ok: false, text: "Every unit needs a name." }); return; }
      if (u.topics.some((t) => !t.name.trim())) { setMsg({ ok: false, text: `Unit ${u.number} has a topic without a name.` }); return; }
    }
    if (removed > 0 && !window.confirm(`${removed} item(s) will be removed from the syllabus. Continue?`)) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient().rpc("admin_apply_syllabus", { p_subject: subjectId, p_units: toPayload(units), p_remove_missing: true });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    const r = data as any;
    setMsg({ ok: true, text: `Saved. Added ${r.units_added} unit(s) and ${r.topics_added} topic(s); removed ${r.units_removed + r.topics_removed}.` });
    router.refresh();
  }

  function download() {
    const blob = new Blob([toCsv(units)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `syllabus-${subjectId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{units.length} unit(s), {topicCount} topic(s)</p>
        <button type="button" onClick={download} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium">
          <Download size={16} aria-hidden="true" /> Download list (CSV)
        </button>
      </div>

      {units.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No units yet. Add one below, or paste or upload a syllabus.</p>}

      {units.map((u, ui) => {
        const isOpen = open[u.key] ?? false;
        return (
          <section key={u.key} className="rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => setOpen((p) => ({ ...p, [u.key]: !isOpen }))} aria-expanded={isOpen} aria-label={isOpen ? "Collapse unit" : "Expand unit"} className="rounded-lg p-1.5 text-muted hover:text-ink">
                {isOpen ? <ChevronDown size={20} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
              </button>
              <span className="w-14 shrink-0 text-sm font-semibold text-muted">Unit {u.number}</span>
              <input aria-label={`Unit ${u.number} name`} className={inputCls} value={u.name} onChange={(e) => edit((d) => { d[ui].name = e.target.value; })} />
              <span className="hidden shrink-0 text-xs text-muted sm:block">{u.topics.length} topics{u.used ? `, ${u.used} tagged` : ""}</span>
            </div>
            {isOpen && (
              <div className="border-t border-line p-3">
                <ul className="space-y-2">
                  {u.topics.map((t, ti) => (
                    <li key={t.key} className="flex items-center gap-2">
                      <input aria-label="Topic name" className={`${inputCls} ${t.is_legacy ? "text-muted line-through" : ""}`} value={t.name} onChange={(e) => edit((d) => { d[ui].topics[ti].name = e.target.value; })} />
                      {t.used > 0 && <span className="shrink-0 text-xs text-muted" title="Questions tagged with this topic">{t.used}</span>}
                      <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
                        <input type="checkbox" checked={t.is_legacy} onChange={() => edit((d) => { d[ui].topics[ti].is_legacy = !d[ui].topics[ti].is_legacy; })} />
                        Retired
                      </label>
                      <button type="button" aria-label="Move up" disabled={ti === 0} onClick={() => edit((d) => { const a = d[ui].topics; [a[ti - 1], a[ti]] = [a[ti], a[ti - 1]]; })} className="rounded p-1.5 text-muted hover:text-ink disabled:opacity-30"><ArrowUp size={16} aria-hidden="true" /></button>
                      <button type="button" aria-label="Move down" disabled={ti === u.topics.length - 1} onClick={() => edit((d) => { const a = d[ui].topics; [a[ti + 1], a[ti]] = [a[ti], a[ti + 1]]; })} className="rounded p-1.5 text-muted hover:text-ink disabled:opacity-30"><ArrowDown size={16} aria-hidden="true" /></button>
                      <button
                        type="button"
                        aria-label={t.used > 0 ? "Used by questions. Retire it instead." : "Delete topic"}
                        title={t.used > 0 ? "Used by questions. Retire it instead." : "Delete topic"}
                        disabled={t.used > 0}
                        onClick={() => edit((d) => { d[ui].topics.splice(ti, 1); })}
                        className="rounded p-1.5 text-muted hover:text-danger disabled:opacity-30"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="New topic"
                    placeholder="Add a topic"
                    className={inputCls}
                    value={newTopic[u.key] ?? ""}
                    onChange={(e) => setNewTopic((p) => ({ ...p, [u.key]: e.target.value }))}
                    onKeyDown={(e: any) => { if (e.key === "Enter") { e.preventDefault(); addTopic(ui); } }}
                  />
                  <button type="button" onClick={() => addTopic(ui)} className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-medium">Add</button>
                </div>
                {u.topics.length === 0 && u.used === 0 && (
                  <button type="button" onClick={() => edit((d) => { d.splice(ui, 1); })} className="mt-3 text-sm text-danger underline underline-offset-4">Delete this empty unit</button>
                )}
              </div>
            )}
          </section>
        );
      })}

      <div className="flex gap-2">
        <input aria-label="New unit" placeholder="Add a unit (name only, the number follows on)" className={inputCls} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} onKeyDown={(e: any) => { if (e.key === "Enter") { e.preventDefault(); addUnit(); } }} />
        <button type="button" onClick={addUnit} className="shrink-0 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium">Add unit</button>
      </div>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-serif text-lg font-bold">Paste or upload a whole syllabus</h2>
        <p className="mt-1 text-sm text-muted">Start each unit with <span className="font-mono">Unit 1: Name</span>. Every line after it is a topic. Anything already there is kept, only new items are added.</p>
        <textarea rows={6} className={`${inputCls} mt-3 font-mono text-sm`} placeholder={"Unit 1: Geomorphology\nContinental Drift\nPlate Tectonics\nUnit 2: Climatology\nInsolation and Heat Budget"} value={paste} onChange={(e) => setPaste(e.target.value)} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={applyText} disabled={!paste.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add to syllabus</button>
          <label className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm font-medium">
            Upload Excel
            <input type="file" accept=".xlsx" className="sr-only" onChange={onFile} />
          </label>
          <span className="text-xs text-muted">Columns: unit_number, unit_name, topic_name</span>
        </div>
      </section>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm md:bottom-4">
        <button type="button" onClick={save} disabled={busy || !dirty} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Save syllabus
        </button>
        {dirty && <button type="button" onClick={() => { setUnits(clone(initialUnits)); setMsg(null); }} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium">Discard changes</button>}
        {dirty && <span className="text-sm text-[#7A5410]">Unsaved changes{removed ? `, ${removed} removal(s)` : ""}</span>}
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
