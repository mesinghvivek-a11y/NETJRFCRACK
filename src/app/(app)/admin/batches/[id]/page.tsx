import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchTable } from "@/components/admin/BatchTable";
import { loadPaperSubjects, loadUnitsBySubject, requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Review list" };

export default async function BatchPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: batch } = await supabase.from("import_batches").select("*").eq("id", params.id).maybeSingle();
  if (!batch) notFound();

  const [unitsBySubject, livePapers, stagedPapers, rows] = await Promise.all([
    loadUnitsBySubject(supabase),
    loadPaperSubjects(supabase),
    supabase.from("staged_papers").select("paper_id, data").eq("batch_id", params.id),
    supabase
      .from("staged_questions")
      .select("id, paper_id, q_no, question_id, state, is_update, changed, issues, text:data->body->en->>text, topic:data->primary->>topic, unit:data->primary->>unit, review:data->>review_status")
      .eq("batch_id", params.id)
      .order("paper_id")
      .order("q_no")
      .limit(1000),
  ]);

  const paperSubjects: Record<string, string> = { ...livePapers };
  for (const p of stagedPapers.data ?? []) paperSubjects[p.paper_id as string] = (p.data as any)?.subject ?? "";

  return (
    <section>
      <Link href="/admin" className="text-sm text-primary-ink underline underline-offset-4">Back to overview</Link>
      <h1 className="mt-2 font-serif text-2xl font-bold md:text-3xl">Review list</h1>
      <p className="mt-1 text-muted">{batch.filename ?? "Upload"} from {new Date(batch.created_at).toLocaleString()}</p>
      <div className="mt-6">
        <BatchTable batchId={batch.id} status={batch.status} summary={batch.summary} unitsBySubject={unitsBySubject} paperSubjects={paperSubjects} rows={(rows.data ?? []) as any[]} />
      </div>
    </section>
  );
}
