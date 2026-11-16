import Link from "next/link";
import { AdminQBar } from "@/components/admin/AdminQBar";
import { QuestionsList, type QRow } from "@/components/admin/QuestionsList";
import { loadUnitsBySubject, requireAdmin } from "@/lib/admin/guard";
import { compareNewestFirst, examLabel } from "@/lib/papers";

export const metadata = { title: "Questions" };

const PAGE = 30;
type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export default async function QuestionsPage({ searchParams }: { searchParams: SP }) {
  const { supabase } = await requireAdmin();
  const [subjectsRes, unitsBySubject, papersRes] = await Promise.all([
    supabase.from("subjects").select("id, name").order("name"),
    loadUnitsBySubject(supabase),
    supabase.from("papers").select("id, subject_id"),
  ]);
  const subjects: { id: string; name: string }[] = (subjectsRes.data ?? []).map((s: any) => ({ id: s.id as string, name: s.name as string }));
  const wanted = one(searchParams.subject);
  const subject = subjects.some((s) => s.id === wanted) ? wanted : subjects.find((s) => s.id === "geography")?.id ?? subjects[0]?.id ?? "geography";
  const units = unitsBySubject[subject] ?? [];
  const papers = (papersRes.data ?? [])
    .filter((p: any) => p.subject_id === subject)
    .map((p: any) => ({ id: p.id as string }))
    .sort(compareNewestFirst)
    .map((p: { id: string }) => ({ id: p.id, label: `${examLabel(p.id)} (${p.id})` }));

  const paper = one(searchParams.paper);
  const unit = one(searchParams.unit);
  const topic = one(searchParams.topic);
  const status = one(searchParams.status);
  const review = one(searchParams.review);
  const missing = one(searchParams.missing) === "1";
  const text = one(searchParams.q).replace(/[,()%*\\]/g, " ").trim().slice(0, 80);
  const sort = one(searchParams.sort) || "newest";
  const page = Math.max(1, parseInt(one(searchParams.page) || "1", 10) || 1);

  let query = supabase
    .from("admin_questions")
    .select("id, paper_id, q_no, publish_status, review_status, primary_unit_id, primary_topic_id, text, answer_status, explanation_status", { count: "exact" })
    .eq("subject_id", subject);
  if (paper) query = query.eq("paper_id", paper);
  if (unit) query = query.eq("primary_unit_id", unit);
  if (topic) query = query.eq("primary_topic_id", topic);
  if (status) query = query.eq("publish_status", status);
  if (review) query = query.eq("review_status", review);
  if (missing) query = query.eq("explanation_status", "none");
  if (text) query = query.or(`text.ilike.%${text}%,id.ilike.%${text}%`);
  if (sort === "oldest") query = query.order("year", { ascending: true }).order("session", { ascending: false }).order("shift").order("q_no");
  else if (sort === "edited") query = query.order("updated_at", { ascending: false });
  else if (sort === "topic") query = query.order("primary_unit_id").order("primary_topic_id").order("q_no");
  else query = query.order("year", { ascending: false }).order("session", { ascending: true }).order("shift").order("q_no");
  const { data, count, error } = await query.range((page - 1) * PAGE, page * PAGE - 1);
  const rows: QRow[] = (data ?? []) as any[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const href = (p: number): string => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (k !== "page" && typeof v === "string") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/admin/questions?${s}` : "/admin/questions";
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold md:text-3xl">Questions</h1>
        <Link href="/admin/questions/new" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-ink">New question</Link>
      </div>

      <div className="mt-4">
        <AdminQBar subjects={subjects} subject={subject} units={units} papers={papers} />
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{error.message}. Run supabase/migrations/0008_exams.sql if you haven't.</p>}
      <p className="mt-4 text-sm text-muted" aria-live="polite">{count ?? 0} question(s){pages > 1 ? `, page ${page} of ${pages}` : ""}</p>

      <div className="mt-2">
        <QuestionsList rows={rows} units={units} />
      </div>

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
          {page > 1 ? <Link href={href(page - 1)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium">Previous</Link> : <span />}
          {page < pages ? <Link href={href(page + 1)} className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium">Next</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
