import Link from "next/link";
import { SubjectSwitch } from "@/components/filters/SubjectSwitch";
import { createClient } from "@/lib/supabase/server";
import { getSubjects, getTaxonomy, pickSubject } from "@/lib/taxonomy";

export const metadata = { title: "My analysis" };

const MIN = 5; // attempts needed before a topic is called weak or strong

function verdict(attempted: number, correct: number): { label: string; cls: string; pct: number | null } {
  if (attempted < MIN) return { label: `Need ${MIN - attempted} more`, cls: "text-muted", pct: attempted ? Math.round((correct / attempted) * 100) : null };
  const pct = Math.round((correct / attempted) * 100);
  if (pct >= 70) return { label: "Strong", cls: "text-good", pct };
  if (pct < 50) return { label: "Weak", cls: "text-danger", pct };
  return { label: "Improving", cls: "text-[#7A5410]", pct };
}

export default async function AnalysisPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const supabase = createClient();
  const subjects = await getSubjects(supabase);
  const wanted = Array.isArray(searchParams.subject) ? searchParams.subject[0] : searchParams.subject;
  const subject = pickSubject(subjects, wanted);
  const [{ units }, attempts, perf] = await Promise.all([
    getTaxonomy(supabase, subject),
    supabase.from("attempts").select("id, started_at, submitted_at, total_marks, score, correct_count, attempted_count, question_ids").eq("status", "submitted").eq("subject_id", subject).order("submitted_at", { ascending: false }).limit(50),
    supabase.from("my_topic_performance").select("unit_id, topic_id, seen, attempted, correct, time_sec").eq("subject_id", subject),
  ]);
  const list: any[] = attempts.data ?? [];
  const rows: any[] = perf.data ?? [];

  if (list.length === 0) {
    return (
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold md:text-3xl">My analysis</h1>
          <SubjectSwitch subjects={subjects} subject={subject} />
        </div>
        <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="font-medium">No tests yet.</p>
          <p className="mt-1 text-sm text-muted">Your scores, weak topics and strong topics will appear here after your first test.</p>
          <Link href="/test" className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white">Take a test</Link>
        </div>
      </section>
    );
  }

  const scorePcts = list.map((a) => (a.total_marks ? Math.round(((a.score ?? 0) / a.total_marks) * 100) : 0));
  const attemptedAll = list.reduce((n, a) => n + (a.attempted_count ?? 0), 0);
  const correctAll = list.reduce((n, a) => n + (a.correct_count ?? 0), 0);
  const avg = Math.round(scorePcts.reduce((n, x) => n + x, 0) / scorePcts.length);
  const best = Math.max(...scorePcts);
  const accuracy = attemptedAll ? Math.round((correctAll / attemptedAll) * 100) : 0;

  const last = [...list].slice(0, 12).reverse();
  const pts = last.map((a, i) => {
    const p = a.total_marks ? ((a.score ?? 0) / a.total_marks) * 100 : 0;
    const x = last.length === 1 ? 150 : 10 + (i * 280) / (last.length - 1);
    return { x, y: 70 - (p / 100) * 60, p: Math.round(p) };
  });

  const byUnit = units.map((u) => {
    const unitRows = rows.filter((r) => r.unit_id === u.id);
    const attempted = unitRows.reduce((n, r) => n + r.attempted, 0);
    const correct = unitRows.reduce((n, r) => n + r.correct, 0);
    const topics = u.topics
      .map((t) => {
        const r = rows.find((x) => x.topic_id === t.id);
        return r ? { id: t.id, name: t.name, attempted: r.attempted as number, correct: r.correct as number, seen: r.seen as number } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (a.correct / Math.max(1, a.attempted)) - (b.correct / Math.max(1, b.attempted)));
    return { u, attempted, correct, seen: unitRows.reduce((n, r) => n + r.seen, 0), topics };
  }).filter((x) => x.seen > 0);

  const cards = [
    { label: "Tests taken", value: String(list.length) },
    { label: "Average score", value: `${avg}%` },
    { label: "Best score", value: `${best}%` },
    { label: "Accuracy", value: `${accuracy}%` },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold md:text-3xl">My analysis</h1>
        <SubjectSwitch subjects={subjects} subject={subject} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {pts.length > 1 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Score over your last {pts.length} tests</h2>
          <svg viewBox="0 0 300 80" className="mt-3 h-28 w-full" role="img" aria-label={`Scores: ${pts.map((p) => p.p + "%").join(", ")}`}>
            <line x1="10" y1="10" x2="290" y2="10" stroke="#DCE3E1" strokeWidth="1" />
            <line x1="10" y1="40" x2="290" y2="40" stroke="#DCE3E1" strokeWidth="1" />
            <line x1="10" y1="70" x2="290" y2="70" stroke="#DCE3E1" strokeWidth="1" />
            <polyline fill="none" stroke="#0F6E7C" strokeWidth="2" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#0F6E7C" />)}
          </svg>
          <p className="text-xs text-muted">Top line is 100%, bottom is 0%.</p>
        </div>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold">Units and topics</h2>
      <p className="mt-1 text-sm text-muted">Accuracy is correct answers divided by questions you attempted. A topic is called weak or strong only after {MIN} attempts.</p>
      <ul className="mt-3 space-y-2">
        {byUnit.map(({ u, attempted, correct, topics }) => {
          const v = verdict(attempted, correct);
          return (
            <li key={u.id}>
              <details className="rounded-xl border border-line bg-surface">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4">
                  <span className="font-medium">Unit {u.number}: {u.name}</span>
                  <span className="text-sm"><span className={`font-semibold ${v.cls}`}>{v.label}</span><span className="text-muted">{v.pct !== null ? `, ${v.pct}% of ${attempted}` : ""}</span></span>
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {topics.map((t) => {
                    const tv = verdict(t.attempted, t.correct);
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span>{t.name}</span>
                        <span><span className={`font-semibold ${tv.cls}`}>{tv.label}</span><span className="text-muted">{tv.pct !== null ? `, ${tv.pct}% of ${t.attempted}` : ""}</span></span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-8 font-serif text-xl font-bold">Your tests</h2>
      <ul className="mt-3 space-y-2">
        {list.map((a, i) => (
          <li key={a.id}>
            <Link href={`/test/${a.id}/result`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-4 hover:border-primary">
              <span>
                <span className="font-medium">{new Date(a.submitted_at ?? a.started_at).toLocaleDateString()}</span>
                <span className="block text-sm text-muted">{(a.question_ids as string[]).length} questions</span>
              </span>
              <span className="text-right">
                <span className="font-semibold">{a.score ?? 0} / {a.total_marks}</span>
                <span className="block text-sm text-muted">{scorePcts[i]}%</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
