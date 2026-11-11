import { QuestionEditor } from "@/components/admin/QuestionEditor";
import { loadUnits, requireAdmin } from "@/lib/admin/guard";
import { KEYS, type AdminQuestion } from "@/lib/admin/model";

export const metadata = { title: "New question" };

export default async function NewQuestionPage() {
  const { supabase } = await requireAdmin();
  const [units, papers, passages] = await Promise.all([
    loadUnits(supabase),
    supabase.from("papers").select("id").order("year", { ascending: false }),
    supabase.from("passages").select("id"),
  ]);
  const paperIds = (papers.data ?? []).map((p: any) => p.id as string);

  if (paperIds.length === 0) {
    return <p className="text-muted">Add a paper first by importing the workbook (the Papers sheet creates it).</p>;
  }
  const blank: AdminQuestion = {
    id: "",
    paper_id: paperIds[0],
    q_no: 1,
    format: "mcq",
    body: { en: { text: "" } },
    options: KEYS.map((k) => ({ key: k, en: { text: "" } })),
    answer: { correct: [], status: "final" },
    primary: { unit: units[0]?.id ?? "" },
    tags: [],
    review_status: "draft",
  };
  return (
    <QuestionEditor
      initial={blank}
      units={units}
      passageIds={(passages.data ?? []).map((p: any) => p.id as string)}
      paperIds={paperIds}
      mode={{ kind: "live", isNew: true, publishStatus: "draft" }}
    />
  );
}
