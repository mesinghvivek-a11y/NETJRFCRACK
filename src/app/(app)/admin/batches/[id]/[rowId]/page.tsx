import { notFound } from "next/navigation";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { loadUnits, requireAdmin } from "@/lib/admin/guard";
import type { AdminQuestion } from "@/lib/admin/model";

export const metadata = { title: "Edit staged question" };

export default async function StagedEditPage({ params }: { params: { id: string; rowId: string } }) {
  const { supabase } = await requireAdmin();
  const { data: row } = await supabase.from("staged_questions").select("*").eq("id", params.rowId).eq("batch_id", params.id).maybeSingle();
  if (!row) notFound();

  const [units, sp, lp, spaper, lpaper] = await Promise.all([
    loadUnits(supabase),
    supabase.from("staged_passages").select("passage_id").eq("batch_id", params.id),
    supabase.from("passages").select("id").eq("paper_id", row.paper_id),
    supabase.from("staged_papers").select("data").eq("batch_id", params.id).eq("paper_id", row.paper_id).maybeSingle(),
    supabase.from("papers").select("total_questions").eq("id", row.paper_id).maybeSingle(),
  ]);
  const passageIds = [...(sp.data ?? []).map((p: any) => p.passage_id as string), ...(lp.data ?? []).map((p: any) => p.id as string)];
  const total: number | undefined = (spaper.data?.data as any)?.total_questions ?? lpaper.data?.total_questions ?? undefined;

  return (
    <QuestionEditor
      initial={row.data as AdminQuestion}
      units={units}
      passageIds={passageIds}
      paperTotal={total}
      mode={{ kind: "staged", rowId: row.id, batchId: params.id, isUpdate: row.is_update }}
    />
  );
}
