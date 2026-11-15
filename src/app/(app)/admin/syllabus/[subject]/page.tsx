import Link from "next/link";
import { notFound } from "next/navigation";
import { SubjectForm } from "@/components/admin/SubjectForm";
import { SyllabusEditor } from "@/components/admin/SyllabusEditor";
import { loadUnitsBySubject, requireAdmin } from "@/lib/admin/guard";
import type { DraftUnit } from "@/lib/admin/syllabus";

export const metadata = { title: "Edit syllabus" };

export default async function SubjectSyllabusPage({ params }: { params: { subject: string } }) {
  const { supabase } = await requireAdmin();
  const { data: subject } = await supabase.from("subjects").select("*").eq("id", params.subject).maybeSingle();
  if (!subject) notFound();

  const [bySubject, usage] = await Promise.all([
    loadUnitsBySubject(supabase),
    supabase.from("admin_syllabus_usage").select("unit_id, topic_id, n"),
  ]);
  const unitUse = new Map<string, number>();
  const topicUse = new Map<string, number>();
  for (const r of usage.data ?? []) {
    unitUse.set(r.unit_id as string, (unitUse.get(r.unit_id as string) ?? 0) + (r.n as number));
    if (r.topic_id) topicUse.set(r.topic_id as string, r.n as number);
  }
  const draft: DraftUnit[] = (bySubject[subject.id] ?? []).map((u) => ({
    key: u.id,
    id: u.id,
    number: u.number,
    name: u.name,
    used: unitUse.get(u.id) ?? 0,
    topics: u.topics.map((t) => ({ key: t.id, id: t.id, name: t.name, is_legacy: Boolean(t.is_legacy), used: topicUse.get(t.id) ?? 0 })),
  }));

  return (
    <section>
      <Link href="/admin/syllabus" className="text-sm text-primary-ink underline underline-offset-4">All subjects</Link>
      <h1 className="mt-2 font-serif text-2xl font-bold md:text-3xl">{subject.name}</h1>
      <p className="mt-1 text-muted">NTA code {subject.nta_code ?? "not set"}. Open a unit to edit its topics.</p>

      <div className="mt-6">
        <SyllabusEditor subjectId={subject.id} initialUnits={draft} />
      </div>

      <details className="mt-8 rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Subject details</summary>
        <div className="mt-4">
          <SubjectForm
            mode="edit"
            locked={draft.length > 0}
            initial={{
              id: subject.id,
              name: subject.name,
              nta_code: subject.nta_code ?? "",
              id_prefix: subject.id_prefix ?? "",
              questions_per_paper: subject.questions_per_paper,
              minutes_per_paper: subject.minutes_per_paper,
            }}
          />
        </div>
      </details>
    </section>
  );
}
