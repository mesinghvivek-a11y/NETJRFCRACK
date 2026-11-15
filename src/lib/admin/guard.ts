import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TaxUnit } from "./model";

/** Server-side check used by every admin page. Non-admins get a 404. */
export async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "admin") notFound();
  return { supabase, user };
}

export type UnitsBySubject = Record<string, TaxUnit[]>;

/** Every subject's syllabus: subject id -> units (with topics), in syllabus order. */
export async function loadUnitsBySubject(supabase: ReturnType<typeof createClient>): Promise<UnitsBySubject> {
  const { data } = await supabase
    .from("units")
    .select("id, subject_id, number, name, topics(id, name, sort, is_legacy)")
    .order("number");
  const out: UnitsBySubject = {};
  for (const u of data ?? []) {
    const sid = u.subject_id as string;
    if (!out[sid]) out[sid] = [];
    out[sid].push({
      id: u.id as string,
      number: u.number as number,
      name: u.name as string,
      topics: [...u.topics].sort((a: any, b: any) => a.sort - b.sort).map((t: any) => ({ id: t.id as string, name: t.name as string, is_legacy: Boolean(t.is_legacy) })),
    });
  }
  return out;
}

/** Paper id -> subject id, for papers already in the database. */
export async function loadPaperSubjects(supabase: ReturnType<typeof createClient>): Promise<Record<string, string>> {
  const { data } = await supabase.from("papers").select("id, subject_id");
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id as string] = p.subject_id as string;
  return out;
}
