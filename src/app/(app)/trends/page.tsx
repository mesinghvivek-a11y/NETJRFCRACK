import Link from "next/link";
import { SubjectSwitch } from "@/components/filters/SubjectSwitch";
import { compareOldestFirst, examLabel, isReexam } from "@/lib/papers";
import { createClient } from "@/lib/supabase/server";
import { getSubjects, getTaxonomy, pickSubject } from "@/lib/taxonomy";

export const metadata = { title: "Trends" };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  return den === 0 ? 0 : num / den;
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-muted">-</span>;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i * 112) / (values.length - 1) + 4},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 120 32" className="h-8 w-28" role="img" aria-label="Share of each exam's questions over time">
      <polyline fill="none" stroke="#0F6E7C" strokeWidth="2" points={pts} />
    </svg>
  );
}

export default async function TrendsPage({ searchParams }: { searchParams: SP }) {
  const supabase = createClient();
  const subjects = await getSubjects(supabase);
  const subject = pickSubject(subjects, one(searchParams.subject));
  const pctView = one(searchParams.view) === "pct";
  const [{ units }, stats] = await Promise.all([
    getTaxonomy(supabase, subject),
    supabase.from("stats_topic_paper").select("paper_id, unit_id, topic_id, n").eq("subject_id", subject).limit(10000),
  ]);
  const rows: any[] = stats.data ?? [];
  // Every paper is its own column, so three shifts in one year are three columns of about 100 questions each.
  const exams: string[] = Array.from(new Set<string>(rows.map((r) => r.paper_id as string))).sort((a, b) => compareOldestFirst({ id: a }, { id: b }));

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Trends</h1>
      <SubjectSwitch subjects={subjects} subject={subject} />
    </div>
  );

  if (rows.length === 0) {
    return (
      <section>
        {header}
        <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="font-medium">No published questions yet.</p>
          <p className="mt-1 text-sm text-muted">Trends build themselves as papers are published.</p>
        </div>
      </section>
    );
  }

  const examTotal = new Map<string, number>();
  const unitExam = new Map<string, number>();
  const topicExam = new Map<string, number>();
  for (const r of rows) {
    examTotal.set(r.paper_id, (examTotal.get(r.paper_id) ?? 0) + r.n);
    unitExam.set(`${r.unit_id}|${r.paper_id}`, (unitExam.get(`${r.unit_id}|${r.paper_id}`) ?? 0) + r.n);
    if (r.topic_id) topicExam.set(`${r.topic_id}|${r.paper_id}`, (topicExam.get(`${r.topic_id}|${r.paper_id}`) ?? 0) + r.n);
  }
  const grand = Array.from(examTotal.values()).reduce((a, b) => a + b, 0);
  const lastIdx = exams.length - 1;

  const cell = (n: number, paper: string): string => {
    if (!pctView) return n ? String(n) : "-";
    const t = examTotal.get(paper) ?? 0;
    return n && t ? `${Math.round((n / t) * 100)}%` : "-";
  };

  const unitStats = units.map((u) => {
    const counts = exams.map((e) => unitExam.get(`${u.id}|${e}`) ?? 0);
    const shares = exams.map((e, i) => ((examTotal.get(e) ?? 0) ? (counts[i] / (examTotal.get(e) ?? 1)) * 100 : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    const s = slope(shares);
    return {
      u, counts, shares, total,
      weight: grand ? Math.round((total / grand) * 1000) / 10 : 0,
      trend: exams.length < 3 ? "Not enough exams" : s > 0.4 ? "Rising" : s < -0.4 ? "Falling" : "Steady",
      topics: u.topics.map((t) => {
        const c = exams.map((e) => topicExam.get(`${t.id}|${e}`) ?? 0);
        const tot = c.reduce((a, b) => a + b, 0);
        let lastAt = -1;
        c.forEach((n, i) => { if (n > 0) lastAt = i; });
        return { t, c, tot, last: lastAt >= 0 ? examLabel(exams[lastAt]) : null, score: c.reduce((a, n, i) => a + n / (1 + (lastIdx - i)), 0) };
      }),
    };
  });

  const allTopics = unitStats.flatMap((x) => x.topics.map((tp) => ({ ...tp, unit: x.u })));
  const priority = [...allTopics].filter((x) => x.tot > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  const neverAsked = allTopics.filter((x) => x.tot === 0);
  const trendCls: Record<string, string> = { Rising: "text-good", Falling: "text-danger", Steady: "text-muted", "Not enough exams": "text-muted" };
  const base = `/trends?subject=${subject}`;

  const head = exams.map((e) => (
    <th key={e} className="px-2 py-2 text-center font-medium" title={e}>
      <span className="block whitespace-nowrap">{examLabel(e)}</span>
      {isReexam(e) && <span className="block text-[10px] font-semibold uppercase text-[#7A5410]">re-exam</span>}
    </th>
  ));

  return (
    <section>
      {header}
      <p className="mt-1 max-w-prose text-muted">How many questions each unit and topic carried in every exam. Each paper is its own column, and each question is counted once under its main topic.</p>

      <div className="mt-4 flex gap-2">
        <Link href={base} aria-current={!pctView ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm font-medium ${!pctView ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>Counts</Link>
        <Link href={`${base}&view=pct`} aria-current={pctView ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm font-medium ${pctView ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>Share of each exam</Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="min-w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="sticky left-0 bg-surface px-3 py-2 font-medium">Unit</th>
              {head}
              <th className="px-3 py-2 text-center font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Weight</th>
              <th className="px-3 py-2 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {unitStats.map((x) => (
              <tr key={x.u.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 max-w-[14rem] bg-surface px-3 py-2 font-medium"><span className="block truncate" title={x.u.name}>Unit {x.u.number}: {x.u.name}</span></td>
                {x.counts.map((n, i) => <td key={exams[i]} className="px-2 py-2 text-center">{cell(n, exams[i])}</td>)}
                <td className="px-3 py-2 text-center font-semibold">{x.total}</td>
                <td className="px-3 py-2">{x.weight}%</td>
                <td className="px-3 py-2"><span className={`font-medium ${trendCls[x.trend]}`}>{x.trend}</span><Spark values={x.shares} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line text-muted">
            <tr>
              <td className="sticky left-0 bg-surface px-3 py-2 font-medium">All units</td>
              {exams.map((e) => <td key={e} className="px-2 py-2 text-center">{examTotal.get(e)}</td>)}
              <td className="px-3 py-2 text-center font-semibold">{grand}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <h2 className="mt-8 font-serif text-xl font-bold">Study these first</h2>
      <p className="mt-1 text-sm text-muted">Topics ranked by how often they were asked, with recent exams counting more.</p>
      <ol className="mt-3 space-y-2">
        {priority.map((p, i) => (
          <li key={p.t.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-wash text-sm font-semibold text-primary-ink">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{p.t.name}</span>
              <span className="block text-xs text-muted">Unit {p.unit.number}, asked {p.tot} time(s), last in {p.last}</span>
            </span>
          </li>
        ))}
      </ol>

      <h2 className="mt-8 font-serif text-xl font-bold">Topic by topic</h2>
      <ul className="mt-3 space-y-2">
        {unitStats.map((x) => (
          <li key={x.u.id}>
            <details className="rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer p-4 font-medium">Unit {x.u.number}: {x.u.name}</summary>
              <div className="overflow-x-auto border-t border-line">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Topic</th>
                      {head}
                      <th className="px-3 py-2 text-center font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...x.topics].sort((a, b) => b.tot - a.tot).map((tp) => (
                      <tr key={tp.t.id} className="border-t border-line">
                        <td className="max-w-[16rem] px-3 py-2">{tp.t.name}</td>
                        {tp.c.map((n, i) => <td key={exams[i]} className="px-2 py-2 text-center">{cell(n, exams[i])}</td>)}
                        <td className="px-3 py-2 text-center font-semibold">{tp.tot}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">{tp.last ?? "never"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </li>
        ))}
      </ul>

      {neverAsked.length > 0 && (
        <>
          <h2 className="mt-8 font-serif text-xl font-bold">Not asked yet</h2>
          <p className="mt-1 text-sm text-muted">{neverAsked.length} topic(s) have no question in the published papers so far.</p>
          <details className="mt-2 rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer font-medium">Show the list</summary>
            <ul className="mt-3 space-y-1 text-sm">
              {neverAsked.map((x) => <li key={x.t.id}><span className="text-muted">Unit {x.unit.number}:</span> {x.t.name}</li>)}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
