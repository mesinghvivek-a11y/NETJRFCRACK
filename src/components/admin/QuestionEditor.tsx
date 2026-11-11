"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  FORMATS, KEYS, STATUSES, makeId, parseTable, refLine, stateOf, tableToText, validateQuestion,
  type AdminQuestion, type Key, type TaxUnit,
} from "@/lib/admin/model";

type Mode =
  | { kind: "staged"; rowId: string; batchId: string; isUpdate: boolean }
  | { kind: "live"; isNew: boolean; publishStatus: "draft" | "published" };

interface Props {
  initial: AdminQuestion;
  units: TaxUnit[];
  passageIds: string[];
  paperIds?: string[];
  paperTotal?: number;
  mode: Mode;
}

const inputCls = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 md:p-5">
      <h2 className="font-serif text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function finalize(q: AdminQuestion): AdminQuestion {
  const d: AdminQuestion = structuredClone(q);
  d.id = makeId(d.paper_id, d.q_no);
  d.canonical_id = d.canonical_id?.trim() || undefined;
  d.passage_id = d.passage_id?.trim() || undefined;
  d.source_ref = d.source_ref?.trim() || undefined;
  d.answer.source = d.answer.source?.trim() || undefined;
  d.body.en.text = d.body.en.text.trim();
  d.body.en.image = d.body.en.image?.trim() || undefined;
  if (d.body.hi && !d.body.hi.text.trim()) d.body.hi = undefined;
  d.options = d.options.map((o) => ({ ...o, en: { text: o.en.text.trim() }, hi: o.hi?.text.trim() ? { text: o.hi.text.trim() } : undefined }));
  const ex = d.explanation;
  if (ex) {
    const opts: Partial<Record<Key, string>> = {};
    for (const k of KEYS) {
      const v = ex.options?.[k]?.trim();
      if (v) opts[k] = v;
    }
    const refs = (ex.references ?? []).filter((r) => r.book.trim().length > 0);
    const summary = ex.summary?.trim();
    if (!summary && Object.keys(opts).length === 0 && refs.length === 0) d.explanation = undefined;
    else d.explanation = { summary: summary || undefined, options: Object.keys(opts).length ? opts : undefined, references: refs, status: ex.status ?? "draft" };
  }
  return d;
}

export function QuestionEditor({ initial, units, passageIds, paperIds, paperTotal, mode }: Props) {
  const router = useRouter();
  const [q, setQ] = useState<AdminQuestion>(initial);
  const [tableText, setTableText] = useState<string>(tableToText(initial.body.en.table));
  const [refsText, setRefsText] = useState<string>((initial.explanation?.references ?? []).map(refLine).join("\n"));
  const [hiOpen, setHiOpen] = useState<boolean>(Boolean(initial.body.hi?.text) || initial.options.some((o) => o.hi?.text));
  const [extraUnit, setExtraUnit] = useState("");
  const [extraTopic, setExtraTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const isNew = mode.kind === "live" && mode.isNew;
  const ctx = useMemo(() => ({ units, passageIds: new Set<string>(passageIds), paperTotal }), [units, passageIds, paperTotal]);
  const withId = useMemo<AdminQuestion>(() => ({ ...q, id: q.paper_id && Number.isInteger(q.q_no) ? makeId(q.paper_id, q.q_no) : "" }), [q]);
  const issues = useMemo(() => validateQuestion(withId, ctx), [withId, ctx]);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  function edit(fn: (d: AdminQuestion) => void) {
    setQ((prev) => {
      const d: AdminQuestion = structuredClone(prev);
      fn(d);
      return d;
    });
    setDirty(true);
    setMsg(null);
  }

  function setOptionExp(k: Key, v: string) {
    edit((d) => {
      d.explanation = d.explanation ?? {};
      d.explanation.options = { ...(d.explanation.options ?? {}), [k]: v };
    });
  }

  function toggleCorrect(k: Key) {
    edit((d) => {
      const has = d.answer.correct.includes(k);
      if (d.answer.status === "multiple") d.answer.correct = has ? d.answer.correct.filter((x) => x !== k) : [...d.answer.correct, k];
      else d.answer.correct = has ? [] : [k];
    });
  }

  function addTag() {
    if (!extraUnit) return;
    edit((d) => {
      d.tags = [...d.tags, { unit: extraUnit, topic: extraTopic || undefined }];
    });
    setExtraUnit("");
    setExtraTopic("");
  }

  const tagName = (t: { unit: string; topic?: string }): string => {
    const u = units.find((x) => x.id === t.unit);
    const topic = u?.topics.find((x) => x.id === t.topic);
    return topic?.name ?? (u ? `Unit ${u.number}: ${u.name}` : t.unit);
  };

  async function saveStaged() {
    if (mode.kind !== "staged") return;
    setBusy(true);
    const d = finalize(q);
    const iss = validateQuestion(d, ctx);
    const { error } = await createClient()
      .from("staged_questions")
      .update({ data: d, issues: iss, state: stateOf(iss, mode.isUpdate), question_id: d.id })
      .eq("id", mode.rowId);
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setDirty(false);
      setMsg({ ok: true, text: iss.some((i) => i.level === "error") ? "Saved. Errors remain, so it won't be published yet." : "Saved." });
      router.refresh();
    }
  }

  async function saveLive(status: "draft" | "published") {
    setBusy(true);
    const d = finalize(q);
    const { error } = await createClient().rpc("admin_upsert_question", { p_paper_id: d.paper_id, p_q: d, p_status: status });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setDirty(false);
      setMsg({ ok: true, text: status === "published" ? "Saved and published." : "Saved as draft." });
      if (isNew) router.replace(`/admin/questions/${d.id}`);
      else router.refresh();
    }
  }

  const backHref = mode.kind === "staged" ? `/admin/batches/${mode.batchId}` : "/admin/questions";
  const topicsOf = (unitId: string) => units.find((u) => u.id === unitId)?.topics ?? [];

  return (
    <div className="space-y-4 pb-24">
      <div>
        <Link href={backHref} className="text-sm text-primary-ink underline underline-offset-4">{mode.kind === "staged" ? "Back to review list" : "Back to questions"}</Link>
        <h1 className="mt-2 font-serif text-2xl font-bold">{withId.id || "New question"}</h1>
        <p className="text-sm text-muted">
          {mode.kind === "staged" ? "In the review list, not published yet." : isNew ? "New question." : mode.publishStatus === "published" ? "Published." : "Draft, students can't see it."}
          {dirty ? " Unsaved changes." : ""}
        </p>
      </div>

      {(errors.length > 0 || warns.length > 0) && (
        <div className="rounded-xl border border-line bg-surface p-3 text-sm" role="status">
          {errors.map((i, k) => <p key={`e${k}`} className="text-danger">{i.msg}</p>)}
          {warns.map((i, k) => <p key={`w${k}`} className="text-[#7A5410]">{i.msg}</p>)}
        </div>
      )}

      <Card title="Paper and question">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Paper">
            {isNew && paperIds ? (
              <select className={inputCls} value={q.paper_id} onChange={(e) => edit((d) => { d.paper_id = e.target.value; })}>
                {paperIds.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input className={`${inputCls} bg-page`} value={q.paper_id} readOnly />
            )}
          </Field>
          <Field label="Question number">
            <input type="number" min={1} max={100} className={`${inputCls} ${isNew ? "" : "bg-page"}`} value={Number.isNaN(q.q_no) ? "" : q.q_no} readOnly={!isNew} onChange={(e) => edit((d) => { d.q_no = Number(e.target.value); })} />
          </Field>
          <Field label="Format">
            <select className={inputCls} value={q.format} onChange={(e) => edit((d) => { d.format = e.target.value; })}>
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Question (English)">
          <textarea rows={5} className={`${inputCls} font-serif`} value={q.body.en.text} onChange={(e) => edit((d) => { d.body.en.text = e.target.value; })} />
        </Field>
        <Field label="Table (optional)" hint="Header row first. Separate cells with | and put each row on a new line.">
          <textarea
            rows={4}
            className={`${inputCls} font-mono text-sm`}
            value={tableText}
            onChange={(e) => { setTableText(e.target.value); edit((d) => { d.body.en.table = parseTable(e.target.value); }); }}
          />
        </Field>
        <Field label="Image file (optional)" hint="Path in the image store, like geo-2025-jun-s1/q045.png. Upload it on the Images page.">
          <input className={inputCls} value={q.body.en.image ?? ""} onChange={(e) => edit((d) => { d.body.en.image = e.target.value; })} />
        </Field>
        {q.body.en.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-media/${q.body.en.image}`} alt="Preview" className="max-h-56 rounded-md border border-line" />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Passage id (optional)" hint="For comprehension questions.">
            <input className={inputCls} list="passage-ids" value={q.passage_id ?? ""} onChange={(e) => edit((d) => { d.passage_id = e.target.value; })} />
            <datalist id="passage-ids">{passageIds.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Same question as (optional)" hint="Id of its first appearance, if it repeats.">
            <input className={inputCls} value={q.canonical_id ?? ""} onChange={(e) => edit((d) => { d.canonical_id = e.target.value; })} />
          </Field>
        </div>
      </Card>

      <Card title="Options and answer">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Answer status">
            <select
              className={inputCls}
              value={q.answer.status}
              onChange={(e) => edit((d) => { d.answer.status = e.target.value; if (e.target.value === "dropped") d.answer.correct = []; if (e.target.value !== "multiple" && d.answer.correct.length > 1) d.answer.correct = [d.answer.correct[0]]; })}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Where the key came from (optional)">
            <input className={inputCls} value={q.answer.source ?? ""} onChange={(e) => edit((d) => { d.answer.source = e.target.value; })} />
          </Field>
        </div>
        {q.options.map((o, i) => {
          const k = KEYS[i];
          const correct = q.answer.correct.includes(k);
          return (
            <div key={k} className={`rounded-lg border p-3 ${correct ? "border-good bg-good/10" : "border-line"}`}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">Option {k}</p>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="h-5 w-5" checked={correct} onChange={() => toggleCorrect(k)} disabled={q.answer.status === "dropped"} />
                  Correct
                </label>
              </div>
              <textarea rows={2} aria-label={`Option ${k} text`} className={inputCls} value={o.en.text} onChange={(e) => edit((d) => { d.options[i].en.text = e.target.value; })} />
              <textarea rows={2} aria-label={`Why option ${k}`} placeholder={correct ? "Why this is correct" : "Why this is wrong"} className={`${inputCls} text-sm`} value={q.explanation?.options?.[k] ?? ""} onChange={(e) => setOptionExp(k, e.target.value)} />
            </div>
          );
        })}
      </Card>

      <Card title="Explanation">
        <Field label="Summary">
          <textarea rows={4} className={inputCls} value={q.explanation?.summary ?? ""} onChange={(e) => edit((d) => { d.explanation = d.explanation ?? {}; d.explanation.summary = e.target.value; })} />
        </Field>
        <Field label="References (one per line)" hint="For example: Savindra Singh, Geomorphology, p. 112">
          <textarea
            rows={3}
            className={inputCls}
            value={refsText}
            onChange={(e) => {
              setRefsText(e.target.value);
              edit((d) => { d.explanation = d.explanation ?? {}; d.explanation.references = e.target.value.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).map((book) => ({ book })); });
            }}
          />
        </Field>
      </Card>

      <Card title="Syllabus mapping">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main unit">
            <select className={inputCls} value={q.primary.unit} onChange={(e) => edit((d) => { d.primary = { unit: e.target.value }; })}>
              <option value="">Choose a unit</option>
              {units.map((u) => <option key={u.id} value={u.id}>Unit {u.number}: {u.name}</option>)}
            </select>
          </Field>
          <Field label="Main topic">
            <select className={inputCls} value={q.primary.topic ?? ""} disabled={!q.primary.unit} onChange={(e) => edit((d) => { d.primary.topic = e.target.value || undefined; })}>
              <option value="">No specific topic</option>
              {topicsOf(q.primary.unit).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <p className="text-sm font-medium">Also belongs to</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.tags.length === 0 && <span className="text-sm text-muted">No extra tags.</span>}
            {q.tags.map((t, i) => (
              <span key={i} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                {tagName(t)}
                <button type="button" aria-label={`Remove ${tagName(t)}`} className="text-muted hover:text-danger" onClick={() => edit((d) => { d.tags = d.tags.filter((_, j) => j !== i); })}>x</button>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="rounded-lg border border-line bg-surface px-2 py-2 text-sm" aria-label="Extra unit" value={extraUnit} onChange={(e) => { setExtraUnit(e.target.value); setExtraTopic(""); }}>
              <option value="">Unit</option>
              {units.map((u) => <option key={u.id} value={u.id}>Unit {u.number}</option>)}
            </select>
            <select className="max-w-[16rem] rounded-lg border border-line bg-surface px-2 py-2 text-sm" aria-label="Extra topic" value={extraTopic} disabled={!extraUnit} onChange={(e) => setExtraTopic(e.target.value)}>
              <option value="">Whole unit</option>
              {topicsOf(extraUnit).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" onClick={addTag} disabled={!extraUnit} className="rounded-lg border border-line px-3 py-2 text-sm font-medium disabled:opacity-50">Add</button>
          </div>
        </div>
      </Card>

      <Card title="Review">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Review status">
            <select className={inputCls} value={q.review_status} onChange={(e) => edit((d) => { d.review_status = e.target.value; })}>
              <option value="draft">draft</option>
              <option value="verified">verified</option>
            </select>
          </Field>
          <Field label="Source page (optional)" hint="For example the PDF page, to check against.">
            <input className={inputCls} value={q.source_ref ?? ""} onChange={(e) => edit((d) => { d.source_ref = e.target.value; })} />
          </Field>
        </div>
      </Card>

      <section className="rounded-xl border border-line bg-surface p-4 md:p-5">
        <button type="button" className="font-serif text-lg font-bold" aria-expanded={hiOpen} onClick={() => setHiOpen((v) => !v)}>
          Hindi (optional) {hiOpen ? "-" : "+"}
        </button>
        {hiOpen && (
          <div className="mt-3 space-y-3">
            <Field label="Question (Hindi)">
              <textarea rows={4} className={inputCls} value={q.body.hi?.text ?? ""} onChange={(e) => edit((d) => { d.body.hi = { text: e.target.value }; })} />
            </Field>
            {q.options.map((o, i) => (
              <Field key={o.key} label={`Option ${o.key} (Hindi)`}>
                <textarea rows={2} className={inputCls} value={o.hi?.text ?? ""} onChange={(e) => edit((d) => { d.options[i].hi = { text: e.target.value }; })} />
              </Field>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm md:bottom-4">
        {mode.kind === "staged" ? (
          <button type="button" onClick={saveStaged} disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60">Save</button>
        ) : (
          <>
            <button type="button" onClick={() => saveLive("published")} disabled={busy || errors.length > 0} className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-ink disabled:opacity-60">
              {!isNew && mode.publishStatus === "published" ? "Save changes" : "Publish"}
            </button>
            <button type="button" onClick={() => saveLive("draft")} disabled={busy || errors.length > 0} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {!isNew && mode.publishStatus === "published" ? "Move to draft" : "Save as draft"}
            </button>
          </>
        )}
        {errors.length > 0 && mode.kind === "live" && <span className="text-sm text-danger">Fix the errors above to save.</span>}
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
