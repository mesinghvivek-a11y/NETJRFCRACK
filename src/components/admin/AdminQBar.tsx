"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ActiveFilters, SearchField, SelectField, StickyBar } from "@/components/filters/Controls";
import { useUrlState } from "@/components/filters/useUrlState";
import type { TaxUnit } from "@/lib/admin/model";

export function AdminQBar({ subjects, subject, units, papers }: {
  subjects: { id: string; name: string }[]; subject: string; units: TaxUnit[]; papers: { id: string; label: string }[];
}) {
  const u = useUrlState();
  const [more, setMore] = useState(false);
  const paper = u.get("paper");
  const unit = u.get("unit");
  const topic = u.get("topic");
  const status = u.get("status");
  const review = u.get("review");
  const missing = u.get("missing") === "1";
  const q = u.get("q");
  const sort = u.get("sort") || "newest";
  const topics = units.find((x) => x.id === unit)?.topics ?? [];

  const chips: { label: string; onRemove: () => void }[] = [];
  if (paper) chips.push({ label: papers.find((p) => p.id === paper)?.label ?? paper, onRemove: () => u.set({ paper: null }) });
  if (unit) chips.push({ label: `Unit ${units.find((x) => x.id === unit)?.number ?? ""}`, onRemove: () => u.set({ unit: null, topic: null }) });
  if (topic) chips.push({ label: topics.find((t) => t.id === topic)?.name ?? "Topic", onRemove: () => u.set({ topic: null }) });
  if (status) chips.push({ label: status === "draft" ? "Drafts" : "Published", onRemove: () => u.set({ status: null }) });
  if (review) chips.push({ label: review === "verified" ? "Verified" : "Not verified", onRemove: () => u.set({ review: null }) });
  if (missing) chips.push({ label: "No explanation", onRemove: () => u.set({ missing: null }) });
  if (q) chips.push({ label: `"${q}"`, onRemove: () => u.set({ q: null }) });

  return (
    <StickyBar busy={u.pending}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 md:grid-cols-[11rem_14rem_minmax(0,1fr)_auto]">
        <SelectField label="Subject" value={subject} onChange={(v) => u.set({ subject: v, paper: null, unit: null, topic: null })} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
        <SelectField label="Exam" value={paper} onChange={(v) => u.set({ paper: v || null })} placeholder="All exams" options={papers.map((p) => ({ value: p.id, label: p.label }))} />
        <div className="col-span-3 md:col-span-1"><SearchField value={q} onCommit={(v) => u.set({ q: v || null })} placeholder="Search text or id (press /)" /></div>
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More filters" className={`hidden rounded-lg border px-3 md:block ${more ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted"}`}>
          <SlidersHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
      <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="text-sm font-medium text-primary-ink underline underline-offset-4 md:hidden">{more ? "Fewer filters" : "More filters"}</button>
      {more && (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          <SelectField label="Unit" value={unit} onChange={(v) => u.set({ unit: v || null, topic: null })} placeholder="All units" options={units.map((x) => ({ value: x.id, label: `Unit ${x.number}: ${x.name}` }))} />
          <SelectField label="Topic" value={topic} disabled={!unit} onChange={(v) => u.set({ topic: v || null })} placeholder={unit ? "All topics" : "Pick a unit first"} options={topics.map((t) => ({ value: t.id, label: t.name }))} />
          <SelectField label="Publish status" value={status} onChange={(v) => u.set({ status: v || null })} placeholder="Draft and published" options={[{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }]} />
          <SelectField label="Review status" value={review} onChange={(v) => u.set({ review: v || null })} placeholder="Any review status" options={[{ value: "verified", label: "Verified" }, { value: "draft", label: "Not verified" }]} />
          <SelectField label="Sort" value={sort} onChange={(v) => u.set({ sort: v === "newest" ? null : v })} options={[{ value: "newest", label: "Newest exam first" }, { value: "oldest", label: "Oldest exam first" }, { value: "edited", label: "Recently edited" }, { value: "topic", label: "By unit and topic" }]} />
          <button type="button" aria-pressed={missing} onClick={() => u.set({ missing: missing ? null : "1" })} className={`rounded-lg border px-3 py-2 text-[15px] font-medium ${missing ? "border-primary bg-primary-wash text-primary-ink" : "border-line bg-surface text-muted"}`}>Only without explanation</button>
        </div>
      )}
      <ActiveFilters chips={chips} onClear={() => u.set({ paper: null, unit: null, topic: null, status: null, review: null, missing: null, q: null, sort: null })} />
    </StickyBar>
  );
}
