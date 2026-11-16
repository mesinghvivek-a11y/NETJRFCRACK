import { paperCodeFor, parsePaperCode } from "@/lib/papers";
import type { ParsedPaper } from "./excel";

export interface ExistingPaper {
  id: string; total: number; subject: string; year: number; session: string; shift: number; kind: string; language: string;
}
export interface SubjectCode { id: string; code: string }
export interface PaperTarget { code: string; subject: string; total: number; existingId?: string }

/**
 * Works out the final code of every paper (database and sheet together) and lets a typed code, in any
 * of its spellings, be traced back to the paper it means. Matching is by what a paper is:
 * subject, year, session, language, shift and exam kind.
 */
export function planPapers(subjects: SubjectCode[], existing: ExistingPaper[], sheet: ParsedPaper[]) {
  const issues: string[] = [];
  const subjectIds = subjects.map((s) => s.id);
  const codeOfSubject = new Map(subjects.map((s) => [s.id, s.code]));
  const subjectOfCode = new Map(subjects.filter((s) => s.code).map((s) => [s.code, s.id]));
  const keyOf = (subject: string, year: number, session: string, language: string, shift: number, kind: string): string => `${subject}|${year}|${session}|${language}|${shift}|${kind}`;
  const cycleOf = (subject: string, year: number, session: string, language: string): string => `${subject}|${year}|${session}|${language}`;

  const dbByKey = new Map(existing.map((e) => [keyOf(e.subject, e.year, e.session, e.language, e.shift, e.kind), e]));
  const sheetByKey = new Map<string, ParsedPaper>();
  const cycles = new Map<string, Set<string>>();
  const addToCycle = (cycle: string, key: string): void => {
    const set = cycles.get(cycle) ?? new Set<string>();
    set.add(key);
    cycles.set(cycle, set);
  };
  for (const e of existing) addToCycle(cycleOf(e.subject, e.year, e.session, e.language), keyOf(e.subject, e.year, e.session, e.language, e.shift, e.kind));

  const emptySyllabus: string[] = [];
  for (const p of sheet) {
    const label = `${p.subject || "no subject"} ${p.year || ""} ${p.session || ""}`.trim();
    if (!subjectIds.includes(p.subject)) issues.push(`Paper row (${label}): subject "${p.subject}" is not set up yet.`);
    else if (!codeOfSubject.get(p.subject)) issues.push(`Paper row (${label}): ${p.subject} has no NTA subject code. Set it under Admin > Syllabus.`);
    if (!["june", "december"].includes(p.session)) issues.push(`Paper row (${label}): session must be june or december.`);
    if (!["regular", "reexam"].includes(p.exam_kind)) issues.push(`Paper row (${label}): exam_kind must be regular or reexam.`);
    if (!["E", "H"].includes(p.language)) issues.push(`Paper row (${label}): language must be E or H.`);
    if (!Number.isInteger(p.year) || p.year < 2014) issues.push(`Paper row (${label}): year is not valid.`);
    if (![50, 75, 100].includes(p.total_questions)) issues.push(`Paper row (${label}): total_questions must be 50, 75 or 100.`);
    const key = keyOf(p.subject, p.year, p.session, p.language, p.shift, p.exam_kind);
    if (sheetByKey.has(key)) {
      issues.push(`Two rows describe the same paper (${label}, shift ${p.shift}, ${p.exam_kind}). Give each a different shift.`);
      continue;
    }
    sheetByKey.set(key, p);
    addToCycle(cycleOf(p.subject, p.year, p.session, p.language), key);
    if (subjectIds.includes(p.subject)) emptySyllabus.push(p.subject);
  }

  const finalCode = (subject: string, year: number, session: string, language: string, shift: number, kind: string): string => {
    const code = codeOfSubject.get(subject);
    if (!code) return "";
    const size = cycles.get(cycleOf(subject, year, session, language))?.size ?? 1;
    return paperCodeFor({ subjectCode: code, year, session, language, shift, kind }, size > 1);
  };
  for (const p of sheetByKey.values()) p.id = finalCode(p.subject, p.year, p.session, p.language, p.shift, p.exam_kind);

  const resolve = (typed: string): PaperTarget | null => {
    const pc = parsePaperCode(typed);
    if (!pc) return null;
    const subject = subjectOfCode.get(pc.subjectCode);
    if (!subject) return null;
    const key = keyOf(subject, pc.year, pc.session, pc.language, pc.shift ?? 1, pc.reexam ? "reexam" : "regular");
    const sp = sheetByKey.get(key);
    const db = dbByKey.get(key);
    if (sp) return { code: sp.id, subject, total: sp.total_questions, existingId: db?.id };
    if (db) return { code: finalCode(db.subject, db.year, db.session, db.language, db.shift, db.kind), subject, total: db.total, existingId: db.id };
    return null;
  };

  return { issues, resolve, papers: Array.from(sheetByKey.values()), subjectsOnSheet: Array.from(new Set(emptySyllabus)) };
}
