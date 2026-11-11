import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side check used by every admin page. Non-admins get a 404. */
export async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (data?.role !== "admin") notFound();
  return { supabase, user };
}

export async function loadUnits(supabase: ReturnType<typeof createClient>, subject = "geography") {
  const { data } = await supabase
    .from("units")
    .select("id, number, name, topics(id, name, sort)")
    .eq("subject_id", subject)
    .order("number");
  return (data ?? []).map((u: any) => ({
    id: u.id as string,
    number: u.number as number,
    name: u.name as string,
    topics: [...u.topics].sort((a: any, b: any) => a.sort - b.sort).map((t: any) => ({ id: t.id as string, name: t.name as string })),
  }));
}
