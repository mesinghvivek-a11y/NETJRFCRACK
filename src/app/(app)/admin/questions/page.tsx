import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { paperLabel } from "@/lib/admin/model";

export const metadata = { title: "Questions" };

const PAGE = 25;
type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export default async function QuestionsPage({ searchParams }: { searchParams: SP }) {
  const { supabase } = await requireAdmin();
  const paper = one(searchParams.paper);
  const status = one(searchParams.status);
  const review = one(searchParams.review);
  const text = one(searchParams.q).trim();
  const page = Math.max(1, parseInt(one(searchParams.page) || "1", 10) || 1);

  let query = supabase
    .from("questions")
    .select("id, paper_id, q_no, publish_status, review_status, primary_topic_id, primary_unit_id, text:body->en->>text, question_keys(answer_status, explanation_status)", { count: "exact" })
    .order("paper_id", { ascending: false })
    .order("q_no")
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (paper) query = query.eq("paper_id", paper);
  if (status) query = query.eq("publish_status", status);
  if (review) query = query.eq("review_status", review);
  if (text) query = query.ilike("body->en->>text", `%${text.replace(/[%_]/g, "")}%`);

  const [{ data, count, error }, papers] = await Promise.all([
    query,
    supabase.from("papers").select("id, year, session, exam_kind, shift").order("year", { ascending: false }),
  ]);
  const rows: any[] = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const href = (p: number): string => {
    const q = new URLSearchParams();
    if (paper) q.set("paper", paper);
    if (status) q.set("status", status);
    if (review) q.set("review", review);
    if (text) q.set("q", text);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/admin/questions?${s}` : "/admin/questions";
  };
  const field = "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold md:text-3xl">Questions</h1>
        <Link href="/admin/questions/new" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-ink">New question</Link>
      </div>

      <form method="get" className="mt-4 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 md:grid-cols-5">
        <select name="paper" defaultValue={paper} className={field} aria-label="Paper">
          <option value="">All papers</option>
          {(papers.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{paperLabel(p)} ({p.id})</option>)}
        </select>
        <select name="status" defaultValue={status} className={field} aria-label="Publish status">
          <option value="">Draft and published</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select name="review" defaultValue={review} className={field} aria-label="Review status">
          <option value="">Any review status</option>
          <option value="verified">Verified</option>
          <option value="draft">Not verified</option>
        </select>
        <input name="q" defaultValue={text} placeholder="Search question text" className={field} aria-label="Search" />
        <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error.message}</p>}
      <p className="mt-4 text-sm text-muted">{count ?? 0} question(s){pages > 1 ? `, page ${page} of ${pages}` : ""}</p>

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const k: any = Array.isArray(r.question_keys) ? r.question_keys[0] : r.question_keys;
          return (
            <li key={r.id}>
              <Link href={`/admin/questions/${r.id}`} className="block rounded-xl border border-line bg-surface p-3 hover:border-primary">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{r.id}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${r.publish_status === "published" ? "bg-good/10 text-good" : "bg-ochre/15 text-[#7A5410]"}`}>{r.publish_status}</span>
                  {r.review_status === "verified" && <span className="text-xs text-good">verified</span>}
                  {k?.explanation_status === "none" && <span className="text-xs text-muted">no explanation</span>}
                  {k && ["dropped", "disputed", "provisional", "multiple"].includes(k.answer_status) && <span className="text-xs text-[#7A5410]">{k.answer_status}</span>}
                </span>
                <span className="mt-1 line-clamp-2 block text-[15px]">{r.text || "(no text)"}</span>
                <span className="mt-1 block text-xs text-muted">{r.primary_topic_id ?? r.primary_unit_id}</span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && !error && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No questions match.</li>}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
          {page > 1 ? <Link href={href(page - 1)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium">Previous</Link> : <span />}
          {page < pages ? <Link href={href(page + 1)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium">Next</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
