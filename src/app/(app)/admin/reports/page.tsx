import Link from "next/link";
import { ReportActions } from "@/components/admin/ReportActions";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("error_reports")
    .select("id, question_id, message, status, created_at")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  const rows: any[] = data ?? [];

  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">Reports</h1>
      <p className="mt-1 text-muted">Problems students flagged on questions.</p>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error.message}</p>}
      <ul className="mt-5 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/admin/questions/${r.question_id}`} className="font-semibold text-primary-ink underline underline-offset-4">{r.question_id}</Link>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${r.status === "open" ? "bg-ochre/15 text-[#7A5410]" : "bg-page text-muted"}`}>{r.status}</span>
              <span className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
            </p>
            <p className="mt-2 whitespace-pre-line text-[15px]">{r.message}</p>
            <ReportActions id={r.id} status={r.status} />
          </li>
        ))}
        {rows.length === 0 && !error && <li className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No reports yet.</li>}
      </ul>
    </section>
  );
}
