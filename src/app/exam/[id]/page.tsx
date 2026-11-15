import { notFound, redirect } from "next/navigation";
import { TestRunner, type RunQuestion } from "@/components/test/TestRunner";
import { createClient } from "@/lib/supabase/server";

export default async function ExamPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: attempt } = await supabase.from("attempts").select("*").eq("id", params.id).maybeSingle();
  if (!attempt) notFound();
  if (attempt.status === "submitted") redirect(`/test/${params.id}/result`);

  const ids: string[] = attempt.question_ids;
  const [qs, resp] = await Promise.all([
    supabase.from("questions").select("id, q_no, body, options, passage_id").in("id", ids),
    supabase.from("attempt_responses").select("question_id, position, selected_key, palette_state, time_spent_sec").eq("attempt_id", params.id).order("position"),
  ]);
  const passageIds = Array.from(new Set((qs.data ?? []).map((q: any) => q.passage_id).filter((x: any) => Boolean(x)))) as string[];
  const passages = passageIds.length ? await supabase.from("passages").select("id, body").in("id", passageIds) : { data: [] as any[] };
  const pmap = new Map<string, any>((passages.data ?? []).map((p: any) => [p.id as string, p.body]));
  const byId = new Map<string, any>((qs.data ?? []).map((q: any) => [q.id as string, q]));

  const questions: RunQuestion[] = ids
    .map((id) => byId.get(id))
    .filter((q: any) => Boolean(q))
    .map((q: any) => ({ id: q.id, q_no: q.q_no, body: q.body, options: q.options, passage: q.passage_id ? pmap.get(q.passage_id) ?? null : null }));

  return (
    <TestRunner
      attempt={{ id: attempt.id, deadline_at: attempt.deadline_at, total_marks: attempt.total_marks }}
      serverNow={new Date().toISOString()}
      questions={questions}
      initial={(resp.data ?? []).map((r: any) => ({ id: r.question_id as string, selected: (r.selected_key ?? null) as string | null, state: r.palette_state as string, time: (r.time_spent_sec ?? 0) as number }))}
    />
  );
}
