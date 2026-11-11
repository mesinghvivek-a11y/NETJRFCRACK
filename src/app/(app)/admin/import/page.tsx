import { ImportClient } from "@/components/admin/ImportClient";
import { loadUnits, requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Import Excel" };

export default async function ImportPage() {
  const { supabase } = await requireAdmin();
  const [units, subjects, papers] = await Promise.all([
    loadUnits(supabase),
    supabase.from("subjects").select("id"),
    supabase.from("papers").select("id, total_questions"),
  ]);
  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Import Excel</h1>
      <p className="mt-1 max-w-prose text-muted">
        Upload your question workbook. Nothing goes live yet: rows are checked and placed in a review list where you can fix and edit them before publishing.
      </p>
      <div className="mt-6">
        <ImportClient
          units={units}
          subjects={(subjects.data ?? []).map((s: any) => ({ id: s.id as string, code: s.code as string }))}
          existingPapers={(papers.data ?? []).map((p: any) => ({ id: p.id as string, total: p.total_questions as number }))}
        />
      </div>
    </section>
  );
}
