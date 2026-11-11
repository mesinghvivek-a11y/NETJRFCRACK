import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { paperLabel } from "@/lib/admin/model";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const [progress, batches, reports] = await Promise.all([
    supabase.from("admin_paper_progress").select("*").order("year", { ascending: false }),
    supabase.from("import_batches").select("id, filename, created_at, status, summary").order("created_at", { ascending: false }).limit(8),
    supabase.from("error_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const papers: any[] = progress.data ?? [];
  const sum = (k: string): number => papers.reduce((n: number, p: any) => n + (p[k] ?? 0), 0);
  const staged = (batches.data ?? []).filter((b: any) => b.status === "staged");

  const cards = [
    { label: "Published", value: sum("published") },
    { label: "Drafts", value: sum("drafts") },
    { label: "Verified", value: sum("verified") },
    { label: "Open reports", value: reports.count ?? 0 },
  ];

  return (
    <section>
      {progress.error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
          {progress.error.message}. Run supabase/migrations/0004_admin.sql if you haven't.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-2xl font-bold">{c.value}</p>
            <p className="text-sm text-muted">{c.label}</p>
          </div>
        ))}
      </div>

      {staged.length > 0 && (
        <div className="mt-6 rounded-xl border border-ochre/40 bg-ochre/15 p-4">
          <p className="font-semibold">Waiting for review</p>
          <ul className="mt-2 space-y-1 text-sm">
            {staged.map((b: any) => (
              <li key={b.id}>
                <Link href={`/admin/batches/${b.id}`} className="font-medium text-primary-ink underline underline-offset-4">{b.filename ?? "Upload"}</Link>
                <span className="text-muted"> from {new Date(b.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-8 font-serif text-xl font-bold">Papers</h2>
      {papers.length === 0 ? (
        <p className="mt-2 text-muted">No papers yet. Use Import Excel to add your first one.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Paper</th>
                <th className="px-3 py-2 font-medium">Questions</th>
                <th className="px-3 py-2 font-medium">Drafts</th>
                <th className="px-3 py-2 font-medium">Verified</th>
                <th className="px-3 py-2 font-medium">No explanation</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p: any) => {
                const have = p.published + p.drafts;
                return (
                  <tr key={p.paper_id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/admin/questions?paper=${p.paper_id}`} className="font-medium text-primary-ink underline underline-offset-4">{paperLabel(p)}</Link>
                      <span className="block text-xs text-muted">{p.paper_id}</span>
                    </td>
                    <td className={`px-3 py-2 ${have < p.total_questions ? "text-[#7A5410]" : ""}`}>{have} of {p.total_questions}</td>
                    <td className="px-3 py-2">{p.drafts}</td>
                    <td className="px-3 py-2">{p.verified}</td>
                    <td className="px-3 py-2">{p.no_explanation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
