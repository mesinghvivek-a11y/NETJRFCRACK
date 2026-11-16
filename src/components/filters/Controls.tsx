"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ExamInfo } from "@/lib/papers";

const fieldCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary disabled:bg-page disabled:text-muted";

export function SelectField({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select aria-label={label} className={fieldCls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Search box that waits for a pause in typing. Press / anywhere to jump to it. */
export function SearchField({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);
  const last = useRef(value);

  useEffect(() => {
    if (value !== last.current) { last.current = value; setDraft(value); }
  }, [value]);

  useEffect(() => {
    if (draft.trim() === last.current.trim()) return;
    const t = window.setTimeout(() => { last.current = draft.trim(); onCommit(draft.trim()); }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-w-0">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        aria-label="Search"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        className={`${fieldCls} pl-9 pr-9`}
      />
      {draft && (
        <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); last.current = ""; onCommit(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Horizontal list of exams (papers). Several can be chosen at once. */
export function ExamChips({ exams, selected, onChange }: { exams: ExamInfo[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const on = "border-ink bg-ink text-white";
  const off = "border-line bg-surface text-muted hover:text-ink";
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Exams">
      <button type="button" aria-pressed={selected.length === 0} onClick={() => onChange([])} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${selected.length === 0 ? on : off}`}>All exams</button>
      {exams.map((e) => {
        const sel = selected.includes(e.id);
        return (
          <button key={e.id} type="button" aria-pressed={sel} title={`${e.id}, ${e.questions} questions`} onClick={() => toggle(e.id)} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${sel ? on : off}`}>
            {e.label}
            {e.reexam && <span className={`ml-1.5 rounded px-1 text-[10px] font-semibold uppercase ${sel ? "bg-white/20" : "bg-ochre/20 text-[#7A5410]"}`}>re-exam</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Small removable chips that sum up what is filtered right now. */
export function ActiveFilters({ chips, onClear }: { chips: { label: string; onRemove: () => void }[]; onClear: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c, i) => (
        <span key={i} className="flex items-center gap-1 rounded-full bg-primary-wash py-1 pl-3 pr-1 text-xs font-medium text-primary-ink">
          {c.label}
          <button type="button" aria-label={`Remove ${c.label}`} onClick={c.onRemove} className="rounded-full p-0.5 hover:bg-primary/10"><X size={14} aria-hidden="true" /></button>
        </span>
      ))}
      <button type="button" onClick={onClear} className="text-xs font-medium text-primary-ink underline underline-offset-4">Clear all</button>
    </div>
  );
}

/** A bar that stays at the top while the page scrolls. */
export function StickyBar({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className={`sticky top-0 z-20 -mx-4 border-b border-line bg-page/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 ${busy ? "opacity-80" : ""}`} aria-busy={busy}>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
