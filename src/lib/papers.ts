// One place that knows what a paper code means: 80-2024-JUN-E-S2-R
//   80 = NTA subject code, 2024 = year, JUN or DEC = session, E = English,
//   S2 = shift 2 (only when the cycle has more than one paper), R = re-exam.

export interface ParsedCode {
  subjectCode: string;
  year: number;
  session: "june" | "december";
  language: string;
  shift: number | null; // null when the code has no -S part
  reexam: boolean;
}

export function parsePaperCode(code: string): ParsedCode | null {
  const m = /^([A-Za-z0-9]+)-(\d{4})-(JUN|DEC)-([EH])(?:-S(\d+))?(-R)?$/i.exec(code.trim());
  if (!m) return null;
  return {
    subjectCode: m[1],
    year: Number(m[2]),
    session: m[3].toUpperCase() === "JUN" ? "june" : "december",
    language: m[4].toUpperCase(),
    shift: m[5] ? Number(m[5]) : null,
    reexam: Boolean(m[6]),
  };
}

export function paperCodeFor(a: { subjectCode: string; year: number; session: string; language: string; shift: number; kind: string }, multi: boolean): string {
  return `${a.subjectCode}-${a.year}-${a.session === "june" ? "JUN" : "DEC"}-${a.language}${multi ? `-S${a.shift}` : ""}${a.kind === "reexam" ? "-R" : ""}`;
}

/** "2025 Jun", "2024 Jun S1", "2024 Jun S2". A re-exam is shown with a badge, not in this text. */
export function examLabel(code: string): string {
  const p = parsePaperCode(code);
  if (!p) return code;
  return `${p.year} ${p.session === "june" ? "Jun" : "Dec"}${p.shift ? ` S${p.shift}` : ""}`;
}

export const isReexam = (code: string): boolean => parsePaperCode(code)?.reexam ?? false;

/** Newest first: later year, then December before June, then lower shift, then re-exam last. */
export function compareNewestFirst(a: { id: string }, b: { id: string }): number {
  const x = parsePaperCode(a.id);
  const y = parsePaperCode(b.id);
  if (!x || !y) return a.id.localeCompare(b.id);
  if (x.year !== y.year) return y.year - x.year;
  if (x.session !== y.session) return x.session === "december" ? -1 : 1;
  if ((x.shift ?? 0) !== (y.shift ?? 0)) return (x.shift ?? 0) - (y.shift ?? 0);
  return Number(x.reexam) - Number(y.reexam);
}
export const compareOldestFirst = (a: { id: string }, b: { id: string }): number => compareNewestFirst(b, a);

export interface ExamInfo { id: string; label: string; reexam: boolean; questions: number }
