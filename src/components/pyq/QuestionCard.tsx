"use client";

import { useState } from "react";
import { Bookmark, Check, Flag, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { BrowseItem, Lang, Reveal } from "@/lib/types";

const mediaUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-media/${path}`;

const STATUS_NOTE: Record<string, string> = {
  dropped: "This question was dropped, so it is not scored in tests.",
  multiple: "More than one option is correct for this question.",
  disputed: "This answer key is disputed. Treat the answer as unconfirmed.",
  provisional: "This is the provisional answer key. The final key may differ.",
};

function Content({ c }: { c: Lang }) {
  return (
    <>
      <span className="block whitespace-pre-line">{c.text}</span>
      {c.table && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {c.table.columns.map((h, i) => (
                  <th key={i} className="border border-line bg-page px-3 py-1.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className="border border-line px-3 py-1.5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {c.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(c.image)} alt="Figure for this question" loading="lazy" className="mt-3 max-h-80 w-auto max-w-full rounded-md border border-line" />
      )}
    </>
  );
}

export function QuestionCard({ item, primaryLabel, tagLabels }: { item: BrowseItem; primaryLabel: string; tagLabels: string[] }) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(item.saved);
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const { paper } = item;
  const when = `${paper.session === "june" ? "June" : "December"} ${paper.year}`;

  async function show(choice?: string) {
    if (open || loading) return;
    if (choice) setChosen(choice);
    if (reveal) { setOpen(true); return; }
    setLoading(true);
    setErr(null);
    const { data, error } = await createClient().rpc("reveal_answer", { p_question_id: item.id });
    setLoading(false);
    if (error || !data) {
      setChosen(null);
      setErr("Couldn't load the answer. Check your connection and try again.");
      return;
    }
    setReveal(data as Reveal);
    setOpen(true);
  }

  function hide() {
    setOpen(false);
    setChosen(null);
  }

  async function toggleSave() {
    const supabase = createClient();
    const next = !saved;
    setSaved(next);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaved(!next); return; }
    const uid = session.user.id;
    const { error } = next
      ? await supabase.from("bookmarks").insert({ user_id: uid, question_id: item.id })
      : await supabase.from("bookmarks").delete().eq("user_id", uid).eq("question_id", item.id);
    if (error) setSaved(!next);
  }

  async function sendReport(e: React.FormEvent) {
    e.preventDefault();
    setReportState("sending");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setReportState("error"); return; }
    const { error } = await supabase.from("error_reports").insert({ user_id: session.user.id, question_id: item.id, message: message.trim() });
    if (error) setReportState("error");
    else { setReportState("sent"); setMessage(""); }
  }

  const correct = reveal?.correct_keys ?? [];
  const exp = reveal?.explanation;
  const gotIt = chosen !== null && correct.includes(chosen);

  return (
    <article className="rounded-xl border border-line bg-surface p-4 md:p-5" aria-label={`${when}, question ${item.q_no}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">{when}</span>
          <span className="text-muted">Q{item.q_no}</span>
          {paper.exam_kind === "reexam" && <span className="rounded bg-ochre/15 px-1.5 py-0.5 text-xs font-medium text-[#7A5410]">Re-exam</span>}
          {paper.shift > 1 && <span className="text-muted">Shift {paper.shift}</span>}
        </div>
        <div className="-mr-2 -mt-1 flex shrink-0">
          <button
            type="button"
            onClick={toggleSave}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save question"}
            className="rounded-lg p-2 text-muted hover:text-ink"
          >
            <Bookmark size={20} aria-hidden="true" fill={saved ? "currentColor" : "none"} className={saved ? "text-primary" : ""} />
          </button>
          <button
            type="button"
            onClick={() => setReporting((v) => !v)}
            aria-expanded={reporting}
            aria-label="Report a problem with this question"
            className="rounded-lg p-2 text-muted hover:text-ink"
          >
            <Flag size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      {item.passage && (
        <details open className="mt-3 rounded-lg bg-page p-3 text-[15px] leading-relaxed">
          <summary className="cursor-pointer font-medium">Passage</summary>
          <div className="mt-2 font-serif"><Content c={item.passage.en} /></div>
        </details>
      )}

      <div className="mt-3 font-serif text-[17px] leading-relaxed">
        <Content c={item.body.en} />
      </div>

      <ul className="mt-4 space-y-2">
        {item.options.map((o) => {
          const isCorrect = open && correct.includes(o.key);
          const isWrongPick = open && chosen === o.key && !correct.includes(o.key);
          const note = open ? exp?.options?.[o.key] : null;
          return (
            <li key={o.key}>
              <button
                type="button"
                disabled={open || loading}
                onClick={() => show(o.key)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left disabled:cursor-default ${
                  isCorrect ? "border-good bg-good/10" : isWrongPick ? "border-danger bg-danger/10" : "border-line hover:border-primary hover:bg-primary-wash/40"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isCorrect ? "border-good bg-good text-white" : isWrongPick ? "border-danger bg-danger text-white" : "border-line text-muted"
                  }`}
                >
                  {isCorrect ? <Check size={14} aria-label="Correct" /> : isWrongPick ? <X size={14} aria-label="Your answer, incorrect" /> : o.key}
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink">
                  <Content c={o.en} />
                  {note && <span className="mt-2 block border-t border-line pt-2 text-sm text-muted">{note}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!open ? (
          <button
            type="button"
            onClick={() => show()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-ink disabled:opacity-70"
          >
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Show answer
          </button>
        ) : (
          <button type="button" onClick={hide} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-page">
            Hide answer
          </button>
        )}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      </div>

      {open && reveal && (
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-[15px]" aria-live="polite">
          {STATUS_NOTE[reveal.answer_status] && (
            <p className="rounded-lg bg-ochre/15 px-3 py-2 text-sm text-[#6B4A0E]">{STATUS_NOTE[reveal.answer_status]}</p>
          )}
          <p className="font-semibold">
            {correct.length === 0
              ? "No correct answer is recorded."
              : chosen
                ? gotIt
                  ? "Correct."
                  : `Not quite. The answer is ${correct.join(" and ")}.`
                : `Answer: ${correct.join(" and ")}`}
          </p>
          {exp?.summary ? <p className="whitespace-pre-line leading-relaxed">{exp.summary}</p> : !exp?.options && <p className="text-muted">The explanation for this question is not written yet.</p>}
          {exp?.references && exp.references.length > 0 && (
            <ul className="text-sm text-muted">
              {exp.references.map((r, i) => (
                <li key={i}>{r.book}{r.page ? `, p. ${r.page}` : ""}{r.note ? `: ${r.note}` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-primary-wash px-2.5 py-1 text-xs font-medium text-primary-ink">{primaryLabel}</span>
        {tagLabels.map((t, i) => (
          <span key={i} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">{t}</span>
        ))}
      </footer>

      {reporting && (
        <form onSubmit={sendReport} className="mt-4 border-t border-line pt-4">
          {reportState === "sent" ? (
            <p role="status" className="text-sm text-good">Report sent. Thank you.</p>
          ) : (
            <>
              <label className="block text-sm font-medium">
                What is wrong with this question?
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-[15px] outline-none focus:border-primary"
                  placeholder="For example: option C is repeated, or the answer should be B."
                />
              </label>
              {reportState === "error" && <p role="alert" className="mt-1 text-sm text-danger">Couldn't send the report. Try again.</p>}
              <button
                type="submit"
                disabled={reportState === "sending"}
                className="mt-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Send report
              </button>
            </>
          )}
        </form>
      )}
    </article>
  );
}
