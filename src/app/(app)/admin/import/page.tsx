import { ImportClient } from "@/components/admin/ImportClient";
import { loadUnitsBySubject, requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Import Excel" };

export default async function ImportPage() {
  const { supabase } = await requireAdmin();
  const [unitsBySubject, subjects, papers] = await Promise.all([
    loadUnitsBySubject(supabase),
    supabase.from("subjects").select("id, nta_code"),
    supabase.from("papers").select("id, total_questions, subject_id, year, session, shift, exam_kind, language"),
  ]);
  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Import Excel</h1>
      <p className="mt-1 max-w-prose text-muted">
        Upload your question workbook. Nothing goes live yet: rows are checked and placed in a review list where you can fix and edit them before publishing.
      </p>
      <div className="mt-6">
        <ImportClient
          unitsBySubject={unitsBySubject}
          subjects={(subjects.data ?? []).map((s: any) => ({ id: s.id as string, code: (s.nta_code ?? "") as string }))}
          existingPapers={(papers.data ?? []).map((p: any) => ({ id: p.id as string, total: p.total_questions as number, subject: p.subject_id as string, year: p.year as number, session: p.session as string, shift: p.shift as number, kind: p.exam_kind as string, language: p.language as string }))}
        />
      </div>
    </section>
  );
}
