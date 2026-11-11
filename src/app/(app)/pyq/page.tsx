import Link from "next/link";
import { Filters } from "@/components/pyq/Filters";
import { QuestionCard } from "@/components/pyq/QuestionCard";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SUBJECT, getTaxonomy } from "@/lib/taxonomy";
import type { BrowseItem } from "@/lib/types";

export const metadata = { title: "Previous-year questions" };

const PAGE_SIZE = 20;
type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PyqPage({ searchParams }: { searchParams: SP }) {
  const supabase = createClient();

  const yearRaw = Number(one(searchParams.year));
  const year = Number.isInteger(yearRaw) && yearRaw > 2000 ? yearRaw : null;
  const unitRaw = one(searchParams.unit) ?? "";
  const unit = /^[a-z0-9]+-u\d{2}$/.test(unitRaw) ? unitRaw : null;
  const topicRaw = one(searchParams.topic) ?? "";
  const topic = /^[a-z0-9]+-u\d{2}-t\d{2}$/.test(topicRaw) ? topicRaw : null;
  const saved = one(searchParams.saved) === "1";
  const page = Math.max(1, parseInt(one(searchParams.page) ?? "1", 10) || 1);
  const filtered = Boolean(year || unit || topic || saved);

  const [{ units, years }, res] = await Promise.all([
    getTaxonomy(supabase),
    supabase.rpc("browse_questions", {
      p_subject: DEFAULT_SUBJECT,
      p_year: year,
      p_unit: unit,
      p_topic: topic,
      p_saved: saved,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  const unitName = new Map(units.map((u) => [u.id, `Unit ${u.number}: ${u.name}`]));
  const topicName = new Map(units.flatMap((u) => u.topics.map((t) => [t.id, t.name] as const)));
  const label = (t: { unit_id: string; topic_id: string | null }) =>
    (t.topic_id && topicName.get(t.topic_id)) || unitName.get(t.unit_id) || t.unit_id;

  const data = res.data as { total: number; items: BrowseItem[] } | null;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (k !== "page" && typeof v === "string") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/pyq?${s}` : "/pyq";
  };

  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Previous-year questions</h1>
      <p className="mt-1 text-muted">Tap an option or Show answer to see the answer and explanation.</p>

      <div className="mt-5">
        <Filters years={years} units={units} />
      </div>

      {res.error ? (
        <p role="alert" className="mt-6 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Couldn't load questions: {res.error.message}. If this says the function doesn't exist, run supabase/migrations/0003_browse.sql.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
          {filtered ? (
            <>
              <p className="font-medium">No questions match these filters.</p>
              <Link href="/pyq" className="mt-2 inline-block text-sm font-medium text-primary-ink underline underline-offset-4">Clear filters</Link>
            </>
          ) : (
            <>
              <p className="font-medium">No questions yet.</p>
              <p className="mt-1 text-sm text-muted">Import your first paper with the import script (see docs/SETUP.md), then reload this page.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted" aria-live="polite">
            {total} {total === 1 ? "question" : "questions"}
            {pages > 1 ? `, page ${page} of ${pages}` : ""}
          </p>
          <div className="mt-3 space-y-4">
            {items.map((it) => (
              <QuestionCard
                key={it.id}
                item={it}
                primaryLabel={label(it.primary)}
                tagLabels={it.tags.map(label)}
              />
            ))}
          </div>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
              {page > 1 ? (
                <Link href={hrefFor(page - 1)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-page">Previous</Link>
              ) : <span />}
              {page < pages ? (
                <Link href={hrefFor(page + 1)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-page">Next</Link>
              ) : <span />}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
