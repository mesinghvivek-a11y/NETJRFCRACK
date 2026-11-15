import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReviewList, type ReviewItem } from "@/components/test/ReviewList";
import { paperLabel } from "@/lib/admin/model";
import { createClient } from "@/lib/supabase/server";
import { getTaxonomy } from "@/lib/taxonomy";

export const metadata = { title: "Test result" };

export default async function ResultPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: attempt } = await supabase.from("attempts").select("*").eq("id", params.id).maybeSingle();
  if (!attempt) notFound();
  if (attempt.status !== "submitted") redirect(`/exam/${params.id}`);

  const [review, taxonomy] = await Promise.all([
    supabase.rpc("attempt_review", { p_attempt_id: params.id }),
    getTaxonomy(supabase, attempt.subject_id),
  ]);
  const rev: any[] = (review.data as any[] | null) ?? [];
  const qs = await supabase
    .from("questions")
    .select("id, q_no, body, options, primary_unit_id, primary_topic_id, papers(year, session, exam_kind, shift)")
    .in("id", attempt.question_ids);
  const byId = new Map<string, any>((qs.data ?? []).map((q: any) => [q.id as string, q]));

  const unitName = new Map(taxonomy.units.map((u) => [u.id, `Unit ${u.number}: ${u.name}`]));
  const topicName = new Map(taxonomy.units.flatMap((u) => u.topics.map((t) => [t.id, t.name] as const)));

  const items: ReviewItem[] = [];
  const perUnit = new Map<string, { total: number; attempted: number; correct: number }>();
  let timeUsed = 0;
  rev.forEach((r: any, position: number) => {
    const q = byId.get(r.question_id);
    if (!q) return;
    const paper = Array.isArray(q.papers) ? q.papers[0] : q.papers;
    items.push({
      id: q.id, position, q_no: q.q_no, when: paper ? paperLabel(paper) : "", body: q.body, options: q.options,
      topic: (q.primary_topic_id && topicName.get(q.primary_topic_id)) || unitName.get(q.primary_unit_id) || "",
      selected: r.selected ?? null, is_correct: r.is_correct ?? null, time: r.time_spent_sec ?? 0, key: r.key ?? null,
    });
    timeUsed += r.time_spent_sec ?? 0;
    const u = perUnit.get(q.primary_unit_id) ?? { total: 0, attempted: 0, correct: 0 };
    u.total++;
    if (r.selected) u.attempted++;
    if (r.is_correct) u.correct++;
    perUnit.set(q.primary_unit_id, u);
  });

  const total = attempt.question_ids.length as number;
  const attempted = (attempt.attempted_count ?? 0) as number;
  const correct = (attempt.correct_count ?? 0) as number;
  const scorePct = attempt.total_marks ? Math.round(((attempt.score ?? 0) / attempt.total_marks) * 100) : 0;
  const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
  const mins = Math.floor(timeUsed / 60);

  const cards = [
    { label: "Score", value: `${attempt.score ?? 0} / ${attempt.total_marks}`, sub: `${scorePct}%` },
    { label: "Accuracy", value: `${accuracy}%`, sub: `${correct} of ${attempted} attempted` },
    { label: "Attempted", value: `${attempted} / ${total}`, sub: `${total - attempted} not attempted` },
    { label: "Time", value: `${mins} min`, sub: attempt.auto_submitted ? "Submitted when time ran out" : "Submitted by you" },
  ];

  return (
    <section>
      <Link href="/test" className="text-sm text-primary-ink underline underline-offset-4">Back to tests</Link>
      <h1 className="mt-2 font-serif text-2xl font-bold md:text-3xl">Test result</h1>
      <p className="mt-1 text-muted">{new Date(attempt.submitted_at ?? attempt.started_at).toLocaleString()}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted">{c.sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">2 marks for each correct answer. No marks are deducted for wrong or unanswered questions.</p>

      {perUnit.size > 1 && (
        <div className="mt-8">
          <h2 className="font-serif text-xl font-bold">By unit</h2>
          <ul className="mt-3 space-y-2">
            {Array.from(perUnit.entries()).map(([uid, v]) => {
              const pct = v.attempted ? Math.round((v.correct / v.attempted) * 100) : 0;
              return (
                <li key={uid} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{unitName.get(uid) ?? uid}</span>
                    <span className="shrink-0 text-muted">{v.correct} of {v.total} correct{v.attempted ? `, ${pct}% accuracy` : ""}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-page" aria-hidden="true">
                    <div className="h-full bg-primary" style={{ width: `${Math.round((v.correct / v.total) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h2 className="mt-10 font-serif text-xl font-bold">Review</h2>
      <div className="mt-3">
        {review.error ? <p role="alert" className="text-sm text-danger">{review.error.message}</p> : <ReviewList items={items} />}
      </div>
    </section>
  );
}
