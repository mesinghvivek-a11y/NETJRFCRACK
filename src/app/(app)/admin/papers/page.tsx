import Link from "next/link";
import { NormalizeCodes, PaperDelete } from "@/components/admin/PaperActions";
import { requireAdmin } from "@/lib/admin/guard";
import { compareNewestFirst, examLabel, isReexam } from "@/lib/papers";

export const metadata = { title: "Papers" };

export default async function PapersPage() {
  const { supabase } = await requireAdmin();
  const [progress, subjects] = await Promise.all([
    supabase.from("admin_paper_progress").select("*"),
    supabase.from("subjects").select("id, name").order("name"),
  ]);
  const rows: any[] = [...(progress.data ?? [])].map((p: any) => ({ ...p, id: p.paper_id as string })).sort(compareNewestFirst);
  const subjectRows: any[] = subjects.data ?? [];

  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Papers</h1>
      <p className="mt-1 max-w-prose text-muted">
        Every paper is its own exam. A year with several shifts shows each shift separately, and a re-exam is marked as one.
      </p>
      {progress.error && <p role="alert" className="mt-4 text-sm text-danger">{progress.error.message}. Run supabase/migrations/0008_exams.sql if you haven't.</p>}

      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-muted">
          Codes follow one rule: <span className="font-mono">80-2025-JUN-E</span> for a year with one paper; <span className="font-mono">80-2024-JUN-E-S1</span>, <span className="font-mono">-S2</span> when there are several; <span className="font-mono">-R</span> added for a re-exam.
        </p>
        <div className="mt-3"><NormalizeCodes /></div>
      </div>

      {rows.length === 0 && !progress.error && <p className="mt-6 text-muted">No papers yet. Import a workbook to add some.</p>}

      {subjectRows.map((s) => {
        const list = rows.filter((r) => r.subject_id === s.id);
        if (list.length === 0) return null;
        return (
          <div key={s.id} className="mt-8">
            <h2 className="font-serif text-xl font-bold">{s.name}</h2>
            <ul className="mt-3 space-y-2">
              {list.map((p) => {
                const have = p.published + p.drafts;
                return (
                  <li key={p.id} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          {examLabel(p.id)}
                          {isReexam(p.id) && <span className="rounded bg-ochre/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#7A5410]">re-exam</span>}
                        </p>
                        <p className="font-mono text-xs text-muted">{p.id}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/questions?subject=${p.subject_id}&paper=${p.id}`} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium">Questions</Link>
                        <PaperDelete paperId={p.id} label={examLabel(p.id)} questions={have} />
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      <span className={have < p.total_questions ? "font-medium text-[#7A5410]" : ""}>{have} of {p.total_questions} entered</span>, {p.published} published, {p.drafts} draft, {p.verified} verified, {p.no_explanation} without explanation
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
