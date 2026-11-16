"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { ActiveFilters, ExamChips, SearchField, SelectField, StickyBar } from "@/components/filters/Controls";
import { createClient } from "@/lib/supabase/client";
import type { ExamInfo } from "@/lib/papers";
import type { SubjectInfo } from "@/lib/taxonomy";

interface Perf { attempted: number; correct: number }
export interface BuilderTopic { id: string; name: string; count: number; perf: Perf | null }
export interface BuilderUnit { id: string; number: number; name: string; count: number; perf: Perf | null; topics: BuilderTopic[] }

const pct = (p: Perf | null): string => (p && p.attempted > 0 ? `${Math.round((p.correct / p.attempted) * 100)}% of ${p.attempted}` : "not tried");

function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function span(n: number): string {
  const secs = n * 72;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function TestBuilder({ subjects, subject, units, exams }: { subjects: SubjectInfo[]; subject: string; units: BuilderUnit[]; exams: ExamInfo[] }) {
  const router = useRouter();
  const [selPapers, setSelPapers] = useState<string[]>([]);
  const [selUnits, setSelUnits] = useState<string[]>([]);
  const [selTopics, setSelTopics] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [total, setTotal] = useState<number | null>(null);
  const [asked, setAsked] = useState(100);
  const [mix, setMix] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const n = Math.min(total ?? 0, Math.max(1, asked));
  const none = selUnits.length === 0 && selTopics.length === 0;
  const cleanSearch = search.replace(/[%\\]/g, "").trim();

  const args = (withIds: boolean) => ({
    p_subject: subject,
    p_papers: selPapers.length ? selPapers : null,
    p_units: selUnits.length ? selUnits : null,
    p_topics: selTopics.length ? selTopics : null,
    p_search: cleanSearch || null,
    p_with_ids: withIds,
  });

  // Count the matching questions whenever the selection changes.
  useEffect(() => {
    let live = true;
    setTotal(null);
    const t = window.setTimeout(async () => {
      const { data, error } = await createClient().rpc("test_pool", args(false));
      if (!live) return;
      if (error) { setErr(error.message); setTotal(0); } else { setErr(null); setTotal((data as any).total as number); }
    }, 300);
    return () => { live = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, selPapers, selUnits, selTopics, cleanSearch]);

  function toggleUnit(u: BuilderUnit) {
    setSelTopics((p) => p.filter((t) => !u.topics.some((x) => x.id === t)));
    setSelUnits((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]));
  }

  function toggleTopic(u: BuilderUnit, t: BuilderTopic) {
    if (selUnits.includes(u.id)) {
      setSelUnits((p) => p.filter((x) => x !== u.id));
      setSelTopics((p) => [...p, ...u.topics.filter((x) => x.id !== t.id && x.count > 0).map((x) => x.id)]);
    } else {
      setSelTopics((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]));
    }
  }

  // The two dropdowns at the top are a quick way to pick one unit or one topic.
  const topicUnit = selTopics.length === 1 && selUnits.length === 0 ? units.find((u) => u.topics.some((t) => t.id === selTopics[0])) : undefined;
  const quickUnit = selUnits.length === 1 && selTopics.length === 0 ? selUnits[0] : topicUnit ? topicUnit.id : "";
  const quickTopic = topicUnit ? selTopics[0] : "";
  const mixed = !none && quickUnit === "";
  const quickTopics = units.find((u) => u.id === quickUnit)?.topics ?? [];

  function pickUnit(id: string) {
    setSelTopics([]);
    setSelUnits(id ? [id] : []);
  }
  function pickTopic(id: string) {
    if (id) { setSelUnits([]); setSelTopics([id]); }
    else { setSelTopics([]); setSelUnits(quickUnit ? [quickUnit] : []); }
  }

  async function start() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const pool = await supabase.rpc("test_pool", args(true));
    if (pool.error) { setBusy(false); setErr(pool.error.message); return; }
    const ids = ((pool.data as any).ids as string[]) ?? [];
    const picked = (mix ? shuffle(ids) : ids).slice(0, n);
    const { data, error } = await supabase.rpc("start_attempt", {
      p_subject_id: subject,
      p_question_ids: picked,
      p_scope: { papers: selPapers, units: selUnits, topics: selTopics, search: cleanSearch, count: picked.length },
    });
    if (error) { setBusy(false); setErr(error.message); return; }
    router.push(`/exam/${(data as any).attempt_id}`);
  }

  const chips = useMemo(() => {
    const out: { label: string; onRemove: () => void }[] = [];
    for (const id of selPapers) out.push({ label: exams.find((e) => e.id === id)?.label ?? id, onRemove: () => setSelPapers((p) => p.filter((x) => x !== id)) });
    if (cleanSearch) out.push({ label: `"${cleanSearch}"`, onRemove: () => setSearch("") });
    if (!none) out.push({ label: `${selUnits.length + selTopics.length} unit or topic selected`, onRemove: () => { setSelUnits([]); setSelTopics([]); } });
    return out;
  }, [selPapers, cleanSearch, none, selUnits, selTopics, exams]);

  const sizes = [10, 25, 50, 100];
  const rowCls = "flex items-center gap-3 rounded-lg px-2 py-2";

  return (
    <div className="space-y-6">
      <StickyBar>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
          <SelectField label="Subject" value={subject} onChange={(v) => router.push(`/test?subject=${v}`)} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          <SearchField value={search} onCommit={setSearch} placeholder="Search question text" />
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More filters" className={`rounded-lg border px-3 ${more ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>
            <SlidersHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
        <ExamChips exams={exams} selected={selPapers} onChange={setSelPapers} />
        {more && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="sr-only">Unit</span>
              <select aria-label="Unit" value={quickUnit} onChange={(e) => pickUnit(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary">
                <option value="">{mixed ? "Several selected below" : "All units"}</option>
                {units.map((u) => <option key={u.id} value={u.id}>Unit {u.number}: {u.name}</option>)}
              </select>
            </label>
            <SelectField label="Topic" value={quickTopic} disabled={!quickUnit} onChange={pickTopic} placeholder={quickUnit ? "All topics in this unit" : "Pick a unit first"} options={quickTopics.filter((t) => t.count > 0).map((t) => ({ value: t.id, label: t.name }))} />
          </div>
        )}
        <ActiveFilters chips={chips} onClear={() => { setSelPapers([]); setSelUnits([]); setSelTopics([]); setSearch(""); }} />
      </StickyBar>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Units and topics</h2>
        <p className="mt-1 text-sm text-muted">Tick as many as you like. Leave everything unticked for the whole syllabus. Your score so far is shown on each row.</p>
        <ul className="mt-3 divide-y divide-line">
          {units.map((u) => {
            const isOpen = open[u.id] ?? false;
            const unitOn = selUnits.includes(u.id);
            return (
              <li key={u.id} className="py-1">
                <div className={rowCls}>
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={unitOn} disabled={u.count === 0} onChange={() => toggleUnit(u)} aria-label={`Select Unit ${u.number}`} />
                  <button type="button" onClick={() => setOpen((p) => ({ ...p, [u.id]: !isOpen }))} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">Unit {u.number}: {u.name}</span>
                      <span className="block text-xs text-muted">{u.count} questions, {pct(u.perf)}</span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">{isOpen ? "Hide" : "Topics"}</span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="mb-2 ml-8 space-y-0.5 border-l border-line pl-3">
                    {u.topics.map((t) => (
                      <li key={t.id} className={`${rowCls} ${t.count === 0 ? "opacity-50" : ""}`}>
                        <input type="checkbox" className="h-5 w-5 shrink-0" checked={unitOn || selTopics.includes(t.id)} disabled={t.count === 0} onChange={() => toggleTopic(u, t)} aria-label={t.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px]">{t.name}</span>
                          <span className="block text-xs text-muted">{t.count} questions, {pct(t.perf)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 rounded-xl border border-line bg-surface p-4 shadow-sm md:bottom-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Questions</span>
          {sizes.map((s) => (
            <button key={s} type="button" onClick={() => setAsked(s)} aria-pressed={asked === s} className={`rounded-full border px-3 py-1 text-sm font-medium ${asked === s ? "border-ink bg-ink text-white" : "border-line text-muted"}`}>{s}</button>
          ))}
          <button type="button" onClick={() => setAsked(total ?? 100)} className="rounded-full border border-line px-3 py-1 text-sm font-medium text-muted">All</button>
          <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={mix} onChange={() => setMix((v) => !v)} /> Shuffle</label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={start} disabled={busy || total === null || n === 0} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Start test
          </button>
          <p className="text-sm" aria-live="polite">
            {total === null ? "Counting questions" : total === 0 ? "No questions match this selection." : `${n} question${n === 1 ? "" : "s"}, ${span(n)}, ${n * 2} marks${total > n ? ` (of ${total} available)` : ""}`}
          </p>
        </div>
        {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      </section>
    </div>
  );
}
