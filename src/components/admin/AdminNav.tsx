"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/import", label: "Import Excel" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/images", label: "Images" },
  { href: "/admin/reports", label: "Reports" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 pb-3 md:mx-0 md:px-0">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/") || (i.href === "/admin/import" && pathname.startsWith("/admin/batches"));
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "text-muted hover:bg-surface hover:text-ink"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
