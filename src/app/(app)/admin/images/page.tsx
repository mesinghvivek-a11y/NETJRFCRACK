import { ImagesClient } from "@/components/admin/ImagesClient";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Images" };

export default async function ImagesPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("papers").select("id").order("year", { ascending: false });
  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Images</h1>
      <p className="mt-1 max-w-prose text-muted">Upload figures and maps for questions. They are stored per paper.</p>
      <div className="mt-6">
        <ImagesClient paperIds={(data ?? []).map((p: any) => p.id as string)} />
      </div>
    </section>
  );
}
