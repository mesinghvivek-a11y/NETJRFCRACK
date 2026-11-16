import type { SupabaseClient } from "@supabase/supabase-js";
import { compareNewestFirst, examLabel, isReexam, type ExamInfo } from "./papers";
import type { TaxonomyUnit } from "./types";

export const DEFAULT_SUBJECT = "geography";

export interface SubjectInfo { id: string; name: string; questions: number }

/** Subjects that have at least one published question (falls back to all subjects if none do). */
export async function getSubjects(supabase: SupabaseClient): Promise<SubjectInfo[]> {
  const { data } = await supabase.from("public_subjects").select("id, name, questions").order("name");
  const all: SubjectInfo[] = (data ?? []).map((s: any) => ({ id: s.id as string, name: s.name as string, questions: s.questions as number }));
  const live = all.filter((s) => s.questions > 0);
  return live.length ? live : all;
}

export function pickSubject(subjects: SubjectInfo[], wanted: string | undefined): string {
  if (wanted && subjects.some((s) => s.id === wanted)) return wanted;
  if (subjects.some((s) => s.id === DEFAULT_SUBJECT)) return DEFAULT_SUBJECT;
  return subjects[0]?.id ?? DEFAULT_SUBJECT;
}

/** Units with topics, and the exams (papers) that have published questions, newest first. */
export async function getTaxonomy(supabase: SupabaseClient, subject = DEFAULT_SUBJECT) {
  const [u, p] = await Promise.all([
    supabase.from("units").select("id, number, name, topics(id, name, sort, is_legacy)").eq("subject_id", subject).order("number"),
    supabase.from("exam_list").select("id, questions").eq("subject_id", subject),
  ]);
  const units: TaxonomyUnit[] = (u.data ?? []).map((x: any) => ({
    id: x.id,
    number: x.number,
    name: x.name,
    topics: [...x.topics].sort((a: any, b: any) => a.sort - b.sort).map((t: any) => ({ id: t.id, name: t.name })),
  }));
  const exams: ExamInfo[] = (p.data ?? [])
    .map((r: any) => ({ id: r.id as string, label: examLabel(r.id as string), reexam: isReexam(r.id as string), questions: r.questions as number }))
    .sort(compareNewestFirst);
  return { units, exams };
}
