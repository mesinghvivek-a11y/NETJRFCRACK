import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaxonomyUnit } from "./types";

export const DEFAULT_SUBJECT = "geography";

export async function getTaxonomy(supabase: SupabaseClient, subject = DEFAULT_SUBJECT) {
  const [u, p] = await Promise.all([
    supabase.from("units").select("id, number, name, topics(id, name, sort)").eq("subject_id", subject).order("number"),
    supabase.from("papers").select("year").eq("subject_id", subject),
  ]);
  const units: TaxonomyUnit[] = (u.data ?? []).map((x: any) => ({
    id: x.id,
    number: x.number,
    name: x.name,
    topics: [...x.topics].sort((a: any, b: any) => a.sort - b.sort).map((t: any) => ({ id: t.id, name: t.name })),
  }));
  const years: number[] = Array.from(new Set<number>((p.data ?? []).map((r: any) => r.year as number))).sort((a: number, b: number) => b - a);
  return { units, years };
}
