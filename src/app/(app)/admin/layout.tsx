import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Admin</p>
      <AdminNav />
      {children}
    </div>
  );
}
