"use client";

import { useMemo, useState } from "react";
import type { Lang } from "@/lib/types";
import { QuestionBody } from "./QuestionBody";

export interface ReviewItem {
  id: string;
  position: number;
  q_no: number;
  when: string;
  body: { en: Lang };
  options: { key: string; en: Lang }[];
  topic: string;
  selected: string | null;
  is_correct: boolean | null;
  time: number;
  key: {
    correct_keys: string[];
    answer_status: string;
    explanation: { summary?: string | null; options?: Record<string, string> | null; references?: { book: string; page?: string; note?: string }[] } | null;
  } | null;
}

const NOTE: Record<string, string> = {
  dropped: "This question was dropped, so it was not scored.",
  multiple: "More than one option is correct.",
  disputed: "This answer key is disputed.",
  provisional: "This is the provisional answer key.",
};

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const [filter, setFilter] = useState<"all" | "wrong" | "right" | "skipped">("all");
  const shown = useMemo(
    () =>
      items.filter((i) =>
        filter === "all" ? true : filter === "wrong" ? i.selected !== null && i.is_correct === false : filter === "right" ? i.is_correct === true : i.selected === null,
      ),
    [items, filter],
  );
  const count = (f: typeof filter): number =>
    items.filter((i) => (f === "all" ? true : f === "wrong" ? i.selected !== null && i.is_correct === false : f === "right" ? i.is_correct === true : i.selected === null)).length;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(["all", "wrong", "right", "skipped"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}
          >
            {f === "all" ? "All" : f === "wrong" ? "Wrong" : f === "right" ? "Correct" : "Not attempted"} {count(f)}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-4">
        {shown.map((it) => {
          const correct = it.key?.correct_keys ?? [];
          const status = it.selected === null ? "Not attempted" : it.is_correct ? "Correct" : "Wrong";
          const exp = it.key?.explanation;
          return (
            <li key={it.id} className="rounded-xl border border-line bg-surface p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">Question {it.position + 1}</span>
                <span className="text-muted">{it.when}, Q{it.q_no}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${it.selected === null ? "bg-page text-muted" : it.is_correct ? "bg-good/10 text-good" : "bg-danger/10 text-danger"}`}>{status}</span>
                <span className="text-xs text-muted">{it.time}s</span>
              </div>
              <div className="mt-3 font-serif text-[17px] leading-relaxed"><QuestionBody c={it.body.en} /></div>
              <ul className="mt-4 space-y-2">
                {it.options.map((o) => {
                  const isCorrect = correct.includes(o.key);
                  const wrongPick = it.selected === o.key && !isCorrect;
                  const note = exp?.options?.[o.key];
                  return (
                    <li key={o.key} className={`rounded-lg border px-3 py-2.5 ${isCorrect ? "border-good bg-good/10" : wrongPick ? "border-danger bg-danger/10" : "border-line"}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${isCorrect ? "border-good bg-good text-white" : wrongPick ? "border-danger bg-danger text-white" : "border-line text-muted"}`}>{o.key}</span>
                        <span className="min-w-0 flex-1 text-[15px] leading-relaxed">
                          <QuestionBody c={o.en} />
                          {it.selected === o.key && <span className="mt-1 block text-xs font-medium text-muted">Your answer</span>}
                          {note && <span className="mt-2 block border-t border-line pt-2 text-sm text-muted">{note}</span>}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {it.key && NOTE[it.key.answer_status] && <p className="mt-3 rounded-lg bg-ochre/15 px-3 py-2 text-sm text-[#6B4A0E]">{NOTE[it.key.answer_status]}</p>}
              {exp?.summary && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{exp.summary}</p>}
              {exp?.references && exp.references.length > 0 && (
                <ul className="mt-2 text-sm text-muted">
                  {exp.references.map((r, i) => <li key={i}>{r.book}{r.page ? `, p. ${r.page}` : ""}{r.note ? `: ${r.note}` : ""}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted">{it.topic}</p>
            </li>
          );
        })}
        {shown.length === 0 && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">Nothing in this group.</li>}
      </ul>
    </div>
  );
}
