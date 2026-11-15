"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Lang } from "@/lib/types";
import { QuestionBody } from "./QuestionBody";

export interface RunQuestion {
  id: string;
  q_no: number;
  body: { en: Lang };
  options: { key: string; en: Lang }[];
  passage: { en: Lang } | null;
}

type PState = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";
interface Resp { selected: string | null; state: PState; time: number }

interface Props {
  attempt: { id: string; deadline_at: string; total_marks: number };
  serverNow: string;
  questions: RunQuestion[];
  initial: { id: string; selected: string | null; state: string; time: number }[];
}

const STATES: PState[] = ["not_visited", "not_answered", "answered", "marked", "answered_marked"];
const isMarked = (s: PState): boolean => s === "marked" || s === "answered_marked";

function fmt(total: number | null): string {
  if (total === null) return "--:--:--";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}

const pillCls: Record<PState, string> = {
  not_visited: "border-line bg-surface text-ink",
  not_answered: "border-danger bg-danger/10 text-danger",
  answered: "border-good bg-good text-white",
  marked: "border-[#6B4FA0] bg-[#6B4FA0] text-white",
  answered_marked: "border-[#6B4FA0] bg-[#6B4FA0] text-white ring-2 ring-good ring-offset-1",
};
const legend: Record<PState, string> = {
  not_visited: "Not visited",
  not_answered: "Not answered",
  answered: "Answered",
  marked: "Marked for review",
  answered_marked: "Answered and marked",
};

export function TestRunner({ attempt, serverNow, questions, initial }: Props) {
  const router = useRouter();
  const lsKey = `net-attempt-${attempt.id}`;
  const deadline = useMemo(() => Date.parse(attempt.deadline_at), [attempt.deadline_at]);
  const skew = useRef<number>(Date.parse(serverNow) - Date.now());

  const [resp, setResp] = useState<Record<string, Resp>>(() => {
    const out: Record<string, Resp> = {};
    for (const q of questions) out[q.id] = { selected: null, state: "not_visited", time: 0 };
    for (const r of initial) {
      if (out[r.id]) out[r.id] = { selected: r.selected, state: (STATES as string[]).includes(r.state) ? (r.state as PState) : "not_visited", time: r.time };
    }
    return out;
  });
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = useRef(false);
  const dirty = useRef(false);
  const busyRef = useRef(false);
  const respRef = useRef(resp);
  respRef.current = resp;

  const q = questions[idx];
  const n = questions.length;

  // Restore anything saved on this device (newer than the server copy), then start saving.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, Resp>;
        setResp((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(saved)) if (next[id]) next[id] = saved[id];
          return next;
        });
      }
    } catch {
      // ignore a corrupt local copy
    }
    ready.current = true;
  }, [lsKey]);

  useEffect(() => {
    if (!ready.current) return;
    dirty.current = true;
    try {
      window.localStorage.setItem(lsKey, JSON.stringify(resp));
    } catch {
      // storage can be full or blocked; the server copy still works
    }
  }, [resp, lsKey]);

  // The visited question is no longer "not visited".
  useEffect(() => {
    if (!q) return;
    setResp((prev) => (prev[q.id].state === "not_visited" ? { ...prev, [q.id]: { ...prev[q.id], state: "not_answered" } } : prev));
  }, [q]);

  // Clock: counts down to the server's deadline, and adds a second to the current question.
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((deadline - (Date.now() + skew.current)) / 1000));
      setRemaining(left);
      const id = questions[idxRef.current]?.id;
      if (id && left > 0) setResp((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], time: prev[id].time + 1 } } : prev));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [deadline, questions]);

  function rows() {
    return Object.entries(respRef.current).map(([question_id, r]) => ({ question_id, selected_key: r.selected, palette_state: r.state, time_spent_sec: r.time }));
  }

  // Save to the server every 15 seconds while there are changes.
  useEffect(() => {
    const t = window.setInterval(async () => {
      if (!dirty.current || busyRef.current) return;
      dirty.current = false;
      const { error } = await createClient().rpc("save_responses", { p_attempt_id: attempt.id, p_responses: rows() });
      if (error) dirty.current = true;
    }, 15000);
    return () => window.clearInterval(t);
  }, [attempt.id]);

  async function submit(auto: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setErr(null);
    const { error } = await createClient().rpc("submit_attempt", { p_attempt_id: attempt.id, p_responses: rows(), p_auto: auto });
    if (error) {
      busyRef.current = false;
      setSubmitting(false);
      setErr(`Could not submit: ${error.message}.${auto ? " Trying again." : ""}`);
      if (auto) window.setTimeout(() => submit(true), 5000);
      return;
    }
    try { window.localStorage.removeItem(lsKey); } catch { /* ignore */ }
    router.replace(`/test/${attempt.id}/result`);
  }

  useEffect(() => {
    if (remaining === 0) submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  function update(fn: (r: Resp) => Resp) {
    if (!q) return;
    setResp((prev) => ({ ...prev, [q.id]: fn(prev[q.id]) }));
  }
  const choose = (key: string) => update((r) => ({ ...r, selected: key, state: isMarked(r.state) ? "answered_marked" : "answered" }));
  const clear = () => update((r) => ({ ...r, selected: null, state: isMarked(r.state) ? "marked" : "not_answered" }));
  const toggleMark = () =>
    update((r) => ({ ...r, state: isMarked(r.state) ? (r.selected ? "answered" : "not_answered") : r.selected ? "answered_marked" : "marked" }));

  const counts = useMemo(() => {
    const c: Record<PState, number> = { not_visited: 0, not_answered: 0, answered: 0, marked: 0, answered_marked: 0 };
    for (const r of Object.values(resp)) c[r.state]++;
    return c;
  }, [resp]);

  if (!q) return <p className="p-6">This test has no questions.</p>;
  const cur = resp[q.id];
  const low = remaining !== null && remaining <= 300;

  const palette = (
    <div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {STATES.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded border text-[11px] font-semibold ${pillCls[s]}`}>{counts[s]}</span>
            {legend[s]}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-5 gap-2" role="list" aria-label="Question palette">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="listitem"
            aria-label={`Question ${i + 1}, ${legend[resp[x.id].state]}`}
            aria-current={i === idx ? "true" : undefined}
            onClick={() => { setIdx(i); setPaletteOpen(false); }}
            className={`h-10 rounded border text-sm font-semibold ${pillCls[resp[x.id].state]} ${i === idx ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="truncate font-semibold">Test</p>
          <p className="text-xs text-muted">Question {idx + 1} of {n}, {attempt.total_marks} marks</p>
        </div>
        <div role="timer" aria-label="Time left" className={`rounded-lg px-3 py-1.5 font-mono text-lg font-semibold ${low ? "bg-danger text-white" : "bg-ink text-white"}`}>{fmt(remaining)}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPaletteOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium md:hidden">Palette</button>
          <button type="button" onClick={() => setConfirming(true)} className="hidden rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-ink md:block">Submit test</button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <main className="flex-1 p-4 pb-28 md:p-8">
          <article className="mx-auto max-w-3xl">
            {q.passage && (
              <details open className="mb-4 rounded-lg bg-surface p-3 text-[15px] leading-relaxed">
                <summary className="cursor-pointer font-medium">Passage</summary>
                <div className="mt-2 font-serif"><QuestionBody c={q.passage.en} /></div>
              </details>
            )}
            <p className="text-sm font-semibold text-muted">Question {idx + 1}</p>
            <div className="mt-2 font-serif text-[18px] leading-relaxed"><QuestionBody c={q.body.en} /></div>
            <ul className="mt-5 space-y-2" role="radiogroup" aria-label="Options">
              {q.options.map((o) => {
                const on = cur.selected === o.key;
                return (
                  <li key={o.key}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(o.key)}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left ${on ? "border-primary bg-primary-wash" : "border-line bg-surface hover:border-primary"}`}
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${on ? "border-primary bg-primary text-white" : "border-line text-muted"}`}>{o.key}</span>
                      <span className="min-w-0 flex-1 text-[16px] leading-relaxed"><QuestionBody c={o.en} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </article>
        </main>
        <aside className="hidden w-80 shrink-0 border-l border-line bg-surface p-4 md:block">{palette}</aside>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pr-[21rem]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium disabled:opacity-40">Previous</button>
          <button type="button" onClick={toggleMark} className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${isMarked(cur.state) ? "border-[#6B4FA0] bg-[#6B4FA0] text-white" : "border-line"}`}>
            {isMarked(cur.state) ? "Unmark review" : "Mark for review"}
          </button>
          <button type="button" onClick={clear} disabled={!cur.selected} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium disabled:opacity-40">Clear</button>
          <button type="button" onClick={() => setIdx((i) => Math.min(n - 1, i + 1))} disabled={idx === n - 1} className="ml-auto rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-ink disabled:opacity-40">Next</button>
        </div>
      </footer>

      {paletteOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-ink/50 md:hidden" onClick={() => setPaletteOpen(false)}>
          <div role="dialog" aria-label="Question palette" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e: any) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Questions</p>
              <button type="button" onClick={() => setPaletteOpen(false)} className="rounded-lg px-3 py-1 text-sm font-medium text-muted">Close</button>
            </div>
            {palette}
            <button type="button" onClick={() => { setPaletteOpen(false); setConfirming(true); }} className="mt-5 w-full rounded-lg bg-primary py-3 font-semibold text-white">Submit test</button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-4">
          <div role="dialog" aria-label="Submit test" className="w-full max-w-sm rounded-2xl bg-surface p-5">
            <h2 className="font-serif text-xl font-bold">Submit the test?</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Answered: <b>{counts.answered + counts.answered_marked}</b></li>
              <li>Not answered: <b>{counts.not_answered + counts.not_visited + counts.marked}</b></li>
              <li>Marked for review: <b>{counts.marked + counts.answered_marked}</b></li>
            </ul>
            <p className="mt-3 text-sm text-muted">You can't change answers after submitting. {remaining !== null ? `${fmt(remaining)} is still left.` : ""}</p>
            {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className="flex-1 rounded-lg border border-line py-2.5 font-medium disabled:opacity-60">Keep going</button>
              <button type="button" onClick={() => submit(false)} disabled={submitting} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-semibold text-white disabled:opacity-60">
                {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {remaining === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4">
          <div role="alertdialog" aria-label="Time is up" className="w-full max-w-sm rounded-2xl bg-surface p-5 text-center">
            <h2 className="font-serif text-xl font-bold">Time is up</h2>
            <p className="mt-2 text-sm text-muted">Your test is being submitted.</p>
            {err && <p role="alert" className="mt-3 text-sm text-danger">{err}</p>}
            <Loader2 className="mx-auto mt-4 animate-spin text-primary" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
