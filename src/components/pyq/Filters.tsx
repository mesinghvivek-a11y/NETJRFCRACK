"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark } from "lucide-react";
import type { TaxonomyUnit } from "@/lib/types";

export function Filters({ years, units }: { years: number[]; units: TaxonomyUnit[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const year = sp.get("year") ?? "";
  const unit = sp.get("unit") ?? "";
  const topic = sp.get("topic") ?? "";
  const saved = sp.get("saved") === "1";
  const topics = units.find((u) => u.id === unit)?.topics ?? [];
  const active = Boolean(year || unit || topic || saved);

  function update(patch: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    p.delete("page");
    const qs = p.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const select =
    "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-primary";

  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Year
          <select className={select} value={year} onChange={(e) => update({ year: e.target.value || null })}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Unit
          <select className={select} value={unit} onChange={(e) => update({ unit: e.target.value || null, topic: null })}>
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>Unit {u.number}: {u.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Topic
          <select
            className={`${select} disabled:bg-page disabled:text-muted`}
            value={topic}
            disabled={!unit}
            onChange={(e) => update({ topic: e.target.value || null })}
          >
            <option value="">{unit ? "All topics in this unit" : "Choose a unit first"}</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => update({ saved: saved ? null : "1" })}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
            saved ? "border-primary bg-primary-wash text-primary-ink" : "border-line text-muted hover:text-ink"
          }`}
        >
          <Bookmark size={16} aria-hidden="true" fill={saved ? "currentColor" : "none"} />
          Saved only
        </button>
        {active && (
          <button
            type="button"
            onClick={() => start(() => router.push(pathname))}
            className="text-sm font-medium text-primary-ink underline underline-offset-4"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
