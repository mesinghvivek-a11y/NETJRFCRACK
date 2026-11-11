import { notFound } from "next/navigation";
import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { loadUnits, requireAdmin } from "@/lib/admin/guard";
import { rowToQuestion } from "@/lib/admin/model";

export const metadata = { title: "Edit question" };

export default async function EditQuestionPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: row } = await supabase.from("questions").select("*, question_tags(*), question_keys(*)").eq("id", params.id).maybeSingle();
  if (!row) notFound();

  const [units, ps, paper] = await Promise.all([
    loadUnits(supabase),
    supabase.from("passages").select("id").eq("paper_id", row.paper_id),
    supabase.from("papers").select("total_questions").eq("id", row.paper_id).maybeSingle(),
  ]);

  return (
    <QuestionEditor
      initial={rowToQuestion(row)}
      units={units}
      passageIds={(ps.data ?? []).map((p: any) => p.id as string)}
      paperTotal={paper.data?.total_questions ?? undefined}
      mode={{ kind: "live", isNew: false, publishStatus: row.publish_status }}
    />
  );
}
