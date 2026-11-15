import Link from "next/link";
import { PresetCards } from "@/components/admin/PresetCards";
import { SubjectForm } from "@/components/admin/SubjectForm";
import { loadUnitsBySubject, requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Syllabus" };

export default async function SyllabusPage() {
  const { supabase } = await requireAdmin();
  const [subjects, unitsBySubject, usage] = await Promise.all([
    supabase.from("subjects").select("id, name, nta_code, id_prefix").order("name"),
    loadUnitsBySubject(supabase),
    supabase.from("admin_syllabus_usage").select("unit_id, n"),
  ]);
  const unitSubject = new Map<string, string>();
  for (const [sid, list] of Object.entries(unitsBySubject)) for (const u of list) unitSubject.set(u.id, sid);
  const tagged: Record<string, number> = {};
  for (const r of usage.data ?? []) {
    const sid = unitSubject.get(r.unit_id as string);
    if (sid) tagged[sid] = (tagged[sid] ?? 0) + (r.n as number);
  }
  const existing: Record<string, number> = {};
  for (const [sid, list] of Object.entries(unitsBySubject)) existing[sid] = list.length;
  const rows: any[] = subjects.data ?? [];

  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Syllabus</h1>
      <p className="mt-1 max-w-prose text-muted">
        Add each subject's syllabus here once. Every Excel upload then matches its unit and topic cells against it, by code or by name.
      </p>

      {subjects.error && <p role="alert" className="mt-4 text-sm text-danger">{subjects.error.message}. Run supabase/migrations/0006_syllabus.sql if you haven't.</p>}

      <div className="mt-6 space-y-6">
        <PresetCards existing={existing} />

        <div>
          <h2 className="font-serif text-xl font-bold">Subjects</h2>
          {rows.length === 0 ? (
            <p className="mt-2 text-muted">No subjects yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((s) => {
                const list = unitsBySubject[s.id] ?? [];
                const topics = list.reduce((n, u) => n + u.topics.length, 0);
                return (
                  <li key={s.id}>
                    <Link href={`/admin/syllabus/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface p-4 hover:border-primary">
                      <span>
                        <span className="font-semibold">{s.name}</span>
                        <span className="block text-sm text-muted">NTA code {s.nta_code ?? "not set"}, prefix {s.id_prefix ?? "not set"}</span>
                      </span>
                      <span className="text-sm text-muted">
                        {list.length === 0 ? <span className="font-medium text-[#7A5410]">No syllabus yet</span> : `${list.length} units, ${topics} topics, ${tagged[s.id] ?? 0} tags`}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Add another subject</summary>
          <div className="mt-4"><SubjectForm mode="create" /></div>
        </details>
      </div>
    </section>
  );
}
