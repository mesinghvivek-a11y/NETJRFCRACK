import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SUBJECT, getTaxonomy } from "@/lib/taxonomy";

export const metadata = { title: "Trends" };

type SP = { [key: string]: string | string[] | undefined };

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
    <svg viewBox="0 0 120 32" className="h-8 w-28" role="img" aria-label="Share of each year's questions over time">
      <polyline fill="none" stroke="#0F6E7C" strokeWidth="2" points={pts} />
    </svg>
  );
}

export default async function TrendsPage({ searchParams }: { searchParams: SP }) {
  const supabase = createClient();
  const pctView = (Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view) === "pct";
  const [{ units }, stats] = await Promise.all([
    getTaxonomy(supabase),
    supabase.from("stats_topic_year").select("year, unit_id, topic_id, n").eq("subject_id", DEFAULT_SUBJECT).limit(5000),
  ]);
  const rows: any[] = stats.data ?? [];
  const years = Array.from(new Set<number>(rows.map((r) => r.year as number))).sort((a: number, b: number) => a - b);

  if (rows.length === 0) {
    return (
      <section>
        <h1 className="font-serif text-2xl font-bold md:text-3xl">Trends</h1>
        <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="font-medium">No published questions yet.</p>
          <p className="mt-1 text-sm text-muted">Trends build themselves as papers are published.</p>
        </div>
      </section>
    );
  }

  const yearTotal = new Map<number, number>();
  const unitYear = new Map<string, number>();
  const topicYear = new Map<string, number>();
  for (const r of rows) {
    yearTotal.set(r.year, (yearTotal.get(r.year) ?? 0) + r.n);
    unitYear.set(`${r.unit_id}|${r.year}`, (unitYear.get(`${r.unit_id}|${r.year}`) ?? 0) + r.n);
    if (r.topic_id) topicYear.set(`${r.topic_id}|${r.year}`, (topicYear.get(`${r.topic_id}|${r.year}`) ?? 0) + r.n);
  }
  const grand = Array.from(yearTotal.values()).reduce((a, b) => a + b, 0);
  const lastYear = years[years.length - 1];

  const cell = (n: number, year: number): string => {
    if (!pctView) return n ? String(n) : "-";
    const t = yearTotal.get(year) ?? 0;
    return n && t ? `${Math.round((n / t) * 100)}%` : "-";
  };

  const unitStats = units.map((u) => {
    const counts = years.map((y) => unitYear.get(`${u.id}|${y}`) ?? 0);
    const shares = years.map((y, i) => ((yearTotal.get(y) ?? 0) ? (counts[i] / (yearTotal.get(y) ?? 1)) * 100 : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    const s = slope(shares);
    return {
      u, counts, shares, total,
      weight: grand ? Math.round((total / grand) * 1000) / 10 : 0,
      trend: years.length < 3 ? "Not enough years" : s > 0.4 ? "Rising" : s < -0.4 ? "Falling" : "Steady",
      topics: u.topics.map((t) => {
        const c = years.map((y) => topicYear.get(`${t.id}|${y}`) ?? 0);
        const tot = c.reduce((a, b) => a + b, 0);
        const last = [...years].reverse().find((_, i) => c[years.length - 1 - i] > 0);
        return { t, c, tot, last: last ?? null, score: c.reduce((a, n, i) => a + n / (1 + (lastYear - years[i])), 0) };
      }),
    };
  });

  const allTopics = unitStats.flatMap((x) => x.topics.map((tp) => ({ ...tp, unit: x.u })));
  const priority = [...allTopics].filter((x) => x.tot > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  const neverAsked = allTopics.filter((x) => x.tot === 0);
  const trendCls: Record<string, string> = { Rising: "text-good", Falling: "text-danger", Steady: "text-muted", "Not enough years": "text-muted" };

  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Trends</h1>
      <p className="mt-1 max-w-prose text-muted">How many questions each unit and topic has carried, year by year. Each question is counted once, under its main topic.</p>

      <div className="mt-4 flex gap-2">
        <Link href="/trends" aria-current={!pctView ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm font-medium ${!pctView ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>Counts</Link>
        <Link href="/trends?view=pct" aria-current={pctView ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm font-medium ${pctView ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>Share of each year</Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="min-w-full text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="sticky left-0 bg-surface px-3 py-2 font-medium">Unit</th>
              {years.map((y) => <th key={y} className="px-2 py-2 text-center font-medium">{y}</th>)}
              <th className="px-3 py-2 text-center font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Weight</th>
              <th className="px-3 py-2 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {unitStats.map((x) => (
              <tr key={x.u.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 max-w-[14rem] bg-surface px-3 py-2 font-medium"><span className="block truncate" title={x.u.name}>Unit {x.u.number}: {x.u.name}</span></td>
                {x.counts.map((n, i) => <td key={years[i]} className="px-2 py-2 text-center">{cell(n, years[i])}</td>)}
                <td className="px-3 py-2 text-center font-semibold">{x.total}</td>
                <td className="px-3 py-2">{x.weight}%</td>
                <td className="px-3 py-2"><span className={`font-medium ${trendCls[x.trend]}`}>{x.trend}</span><Spark values={x.shares} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line text-muted">
            <tr>
              <td className="sticky left-0 bg-surface px-3 py-2 font-medium">All units</td>
              {years.map((y) => <td key={y} className="px-2 py-2 text-center">{yearTotal.get(y)}</td>)}
              <td className="px-3 py-2 text-center font-semibold">{grand}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Years with several shifts show more questions in total. Use "Share of each year" to compare fairly.</p>

      <h2 className="mt-8 font-serif text-xl font-bold">Study these first</h2>
      <p className="mt-1 text-sm text-muted">Topics ranked by how often they were asked, with recent years counting more.</p>
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
                      {years.map((y) => <th key={y} className="px-2 py-2 text-center font-medium">{y}</th>)}
                      <th className="px-3 py-2 text-center font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...x.topics].sort((a, b) => b.tot - a.tot).map((tp) => (
                      <tr key={tp.t.id} className="border-t border-line">
                        <td className="max-w-[16rem] px-3 py-2">{tp.t.name}</td>
                        {tp.c.map((n, i) => <td key={years[i]} className="px-2 py-2 text-center">{cell(n, years[i])}</td>)}
                        <td className="px-3 py-2 text-center font-semibold">{tp.tot}</td>
                        <td className="px-3 py-2 text-muted">{tp.last ?? "never"}</td>
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
