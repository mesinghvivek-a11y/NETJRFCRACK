"use client";

import { useRouter, usePathname } from "next/navigation";
import type { SubjectInfo } from "@/lib/taxonomy";

/** Subject picker for pages that only need to change subject (Trends, My analysis). */
export function SubjectSwitch({ subjects, subject }: { subjects: SubjectInfo[]; subject: string }) {
  const router = useRouter();
  const pathname = usePathname();
  if (subjects.length < 2) return null;
  return (
    <select
      aria-label="Subject"
      value={subject}
      onChange={(e) => router.push(`${pathname}?subject=${e.target.value}`)}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary"
    >
      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
