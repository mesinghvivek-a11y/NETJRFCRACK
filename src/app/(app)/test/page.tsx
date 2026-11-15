import Link from "next/link";
import { TestBuilder, type BuilderUnit } from "@/components/test/TestBuilder";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SUBJECT, getTaxonomy } from "@/lib/taxonomy";

export const metadata = { title: "Tests" };

export default async function TestPage() {
  const supabase = createClient();
  const [{ units, years }, counts, perfRows, inprog] = await Promise.all([
    getTaxonomy(supabase),
    supabase.rpc("test_counts", { p_subject: DEFAULT_SUBJECT }),
    supabase.from("my_topic_performance").select("unit_id, topic_id, attempted, correct").eq("subject_id", DEFAULT_SUBJECT),
    supabase.from("attempts").select("id, deadline_at, question_ids").eq("status", "in_progress").order("started_at", { ascending: false }).limit(1),
  ]);

  const unitCount = new Map<string, number>();
  const topicCount = new Map<string, number>();
  for (const r of (counts.data as any[] | null) ?? []) {
    if (r.topic_id) topicCount.set(r.topic_id, r.n);
    else unitCount.set(r.unit_id, r.n);
  }
  const unitPerf = new Map<string, { attempted: number; correct: number }>();
  const topicPerf = new Map<string, { attempted: number; correct: number }>();
  for (const r of perfRows.data ?? []) {
    const u = unitPerf.get(r.unit_id as string) ?? { attempted: 0, correct: 0 };
    u.attempted += r.attempted as number;
    u.correct += r.correct as number;
    unitPerf.set(r.unit_id as string, u);
    if (r.topic_id) topicPerf.set(r.topic_id as string, { attempted: r.attempted as number, correct: r.correct as number });
  }

  const data: BuilderUnit[] = units.map((u) => ({
    id: u.id,
    number: u.number,
    name: u.name,
    count: unitCount.get(u.id) ?? 0,
    perf: unitPerf.get(u.id) ?? null,
    topics: u.topics.map((t) => ({ id: t.id, name: t.name, count: topicCount.get(t.id) ?? 0, perf: topicPerf.get(t.id) ?? null })),
  }));
  const totalQuestions = data.reduce((n, u) => n + u.count, 0);
  const running = inprog.data?.[0];
  const expired = running ? Date.parse(running.deadline_at as string) <= Date.now() : false;

  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Tests</h1>
      <p className="mt-1 max-w-prose text-muted">Pick years, units or topics. Each question gets 72 seconds and 2 marks. Answers and explanations appear after you submit.</p>

      {running && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ochre/50 bg-ochre/15 p-4">
          <p className="text-sm font-medium">{expired ? "A test ran out of time. Open it to submit." : `You have a test in progress (${(running.question_ids as string[]).length} questions).`}</p>
          <Link href={`/exam/${running.id}`} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">{expired ? "Submit" : "Resume"}</Link>
        </div>
      )}

      {counts.error && <p role="alert" className="mt-4 text-sm text-danger">{counts.error.message}. Run supabase/migrations/0007_tests.sql if you haven't.</p>}

      {totalQuestions === 0 && !counts.error ? (
        <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="font-medium">No published questions yet.</p>
          <p className="mt-1 text-sm text-muted">Publish some from Admin, then come back to take a test.</p>
        </div>
      ) : (
        <div className="mt-6">
          <TestBuilder subject={DEFAULT_SUBJECT} units={data} years={years} />
        </div>
      )}
    </section>
  );
}
