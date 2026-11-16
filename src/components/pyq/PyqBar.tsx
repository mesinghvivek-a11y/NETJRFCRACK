"use client";

import { useState } from "react";
import { Bookmark, SlidersHorizontal } from "lucide-react";
import { ActiveFilters, ExamChips, SearchField, SelectField, StickyBar } from "@/components/filters/Controls";
import { useUrlState } from "@/components/filters/useUrlState";
import type { ExamInfo } from "@/lib/papers";
import type { SubjectInfo } from "@/lib/taxonomy";
import type { TaxonomyUnit } from "@/lib/types";

export function PyqBar({ subjects, subject, units, exams }: { subjects: SubjectInfo[]; subject: string; units: TaxonomyUnit[]; exams: ExamInfo[] }) {
  const u = useUrlState();
  const [more, setMore] = useState(false);
  const papers = u.list("paper");
  const unit = u.get("unit");
  const topic = u.get("topic");
  const q = u.get("q");
  const sort = u.get("sort") || "newest";
  const saved = u.get("saved") === "1";
  const topics = units.find((x) => x.id === unit)?.topics ?? [];

  const chips: { label: string; onRemove: () => void }[] = [];
  for (const id of papers) {
    const e = exams.find((x) => x.id === id);
    if (e) chips.push({ label: e.label, onRemove: () => u.set({ paper: papers.filter((x) => x !== id).join(",") || null }) });
  }
  if (unit) chips.push({ label: `Unit ${units.find((x) => x.id === unit)?.number ?? ""}`, onRemove: () => u.set({ unit: null, topic: null }) });
  if (topic) chips.push({ label: topics.find((x) => x.id === topic)?.name ?? "Topic", onRemove: () => u.set({ topic: null }) });
  if (q) chips.push({ label: `"${q}"`, onRemove: () => u.set({ q: null }) });
  if (saved) chips.push({ label: "Saved", onRemove: () => u.set({ saved: null }) });

  return (
    <StickyBar busy={u.pending}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
        <SelectField label="Subject" value={subject} onChange={(v) => u.set({ subject: v, paper: null, unit: null, topic: null })} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
        <SearchField value={q} onCommit={(v) => u.set({ q: v || null })} placeholder="Search questions (press /)" />
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More filters" className={`rounded-lg border px-3 ${more ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
      <ExamChips exams={exams} selected={papers} onChange={(ids) => u.set({ paper: ids.join(",") || null })} />
      {more && (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          <SelectField label="Unit" value={unit} onChange={(v) => u.set({ unit: v || null, topic: null })} placeholder="All units" options={units.map((x) => ({ value: x.id, label: `Unit ${x.number}: ${x.name}` }))} />
          <SelectField label="Topic" value={topic} disabled={!unit} onChange={(v) => u.set({ topic: v || null })} placeholder={unit ? "All topics" : "Pick a unit first"} options={topics.map((t) => ({ value: t.id, label: t.name }))} />
          <SelectField label="Sort" value={sort} onChange={(v) => u.set({ sort: v === "newest" ? null : v })} options={[{ value: "newest", label: "Newest exam first" }, { value: "oldest", label: "Oldest exam first" }, { value: "unit", label: "By unit and topic" }]} />
          <button type="button" aria-pressed={saved} onClick={() => u.set({ saved: saved ? null : "1" })} className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[15px] font-medium ${saved ? "border-primary bg-primary-wash text-primary-ink" : "border-line bg-surface text-muted"}`}>
            <Bookmark size={16} aria-hidden="true" fill={saved ? "currentColor" : "none"} /> Saved only
          </button>
        </div>
      )}
      <ActiveFilters chips={chips} onClear={() => u.set({ paper: null, unit: null, topic: null, q: null, saved: null, sort: null })} />
    </StickyBar>
  );
}
