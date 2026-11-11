import { KEYS, makeId, parseCode, parseTable, type AdminQuestion, type Key, type Tag } from "./model";

export interface ParsedPaper {
  id: string; subject: string; year: number; session: string; exam_kind: string;
  shift: number; exam_date?: string; total_questions: number;
}
export interface ParsedPassage { id: string; paper_id: string; body: { en: { text: string }; hi?: { text: string } } }
export interface ParsedRow { rowNo: number; q: AdminQuestion; parseIssues: string[] }
export interface ParsedWorkbook { papers: ParsedPaper[]; passages: ParsedPassage[]; rows: ParsedRow[]; fileIssues: string[] }

type Cell = string | number | boolean | Date | null | undefined;

function s(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

async function readSheet(file: File, name: string): Promise<Cell[][] | null> {
  const mod: any = await import("read-excel-file");
  const read: any = mod.default ?? mod;
  try {
    return (await read(file, { sheet: name })) as Cell[][];
  } catch {
    return null;
  }
}

function toObjects(rows: Cell[][]): { rowNo: number; get: (col: string) => string }[] {
  if (rows.length === 0) return [];
  const head: string[] = rows[0].map((h) => s(h).toLowerCase());
  const out: { rowNo: number; get: (col: string) => string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const idx = (col: string): number => head.indexOf(col);
    const get = (col: string): string => {
      const j = idx(col);
      return j < 0 ? "" : s(r[j]);
    };
    out.push({ rowNo: i + 1, get });
  }
  return out;
}

const isExample = (note: string): boolean => /^example/i.test(note);

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const fileIssues: string[] = [];
  const papersRaw = await readSheet(file, "Papers");
  const qRaw = await readSheet(file, "Questions");
  const passRaw = await readSheet(file, "Passages");
  if (!papersRaw) fileIssues.push('The sheet "Papers" was not found.');
  if (!qRaw) fileIssues.push('The sheet "Questions" was not found.');

  const papers: ParsedPaper[] = [];
  for (const r of toObjects(papersRaw ?? [])) {
    const id = r.get("paper_id");
    if (!id || isExample(r.get("source_note"))) continue;
    papers.push({
      id,
      subject: r.get("subject"),
      year: Number(r.get("year")),
      session: r.get("session").toLowerCase(),
      exam_kind: r.get("exam_kind").toLowerCase() || "regular",
      shift: Number(r.get("shift")) || 1,
      exam_date: r.get("exam_date") || undefined,
      total_questions: Number(r.get("total_questions")),
    });
  }

  const passages: ParsedPassage[] = [];
  for (const r of toObjects(passRaw ?? [])) {
    const id = r.get("passage_id");
    const text = r.get("text_en");
    if (!id || isExample(text)) continue;
    const hi = r.get("text_hi");
    passages.push({ id, paper_id: r.get("paper_id"), body: { en: { text }, ...(hi ? { hi: { text: hi } } : {}) } });
  }

  const rows: ParsedRow[] = [];
  for (const r of toObjects(qRaw ?? [])) {
    const paperId = r.get("paper_id");
    const qNoText = r.get("q_no");
    if (!paperId && !qNoText && !r.get("question_en")) continue;
    if (isExample(r.get("notes"))) continue;
    const issues: string[] = [];
    const qNo = Number(qNoText);

    const correct = Array.from(new Set(r.get("correct").toUpperCase().split(/[^A-D]+/).filter((x) => x.length > 0))).filter(
      (x): x is Key => (KEYS as string[]).includes(x),
    );

    const primaryCode = r.get("primary_topic");
    const primary: Tag = parseCode(primaryCode) ?? { unit: primaryCode };
    if (primaryCode && !parseCode(primaryCode)) issues.push(`primary_topic "${primaryCode}" is not a valid code.`);

    const tags: Tag[] = [];
    for (const part of r.get("extra_tags").split(/[;\n]+/)) {
      const t = part.trim();
      if (!t) continue;
      const parsed = parseCode(t);
      if (!parsed) { issues.push(`extra tag "${t}" is not a valid code.`); continue; }
      tags.push(parsed);
    }

    const en = r.get("question_en");
    const table = parseTable(r.get("table"));
    const image = r.get("image_file");
    const hiText = r.get("question_hi");

    const options = KEYS.map((k) => {
      const lower = k.toLowerCase();
      const hi = r.get(`opt_${lower}_hi`);
      return { key: k, en: { text: r.get(`opt_${lower}`) }, ...(hi ? { hi: { text: hi } } : {}) };
    });

    const expOpts: Partial<Record<Key, string>> = {};
    for (const k of KEYS) {
      const v = r.get(`expl_${k.toLowerCase()}`);
      if (v) expOpts[k] = v;
    }
    const summary = r.get("explanation");
    const refs = r.get("references").split(/[;\n]+/).map((x) => x.trim()).filter((x) => x.length > 0).map((book) => ({ book }));
    const hasExp = Boolean(summary) || Object.keys(expOpts).length > 0 || refs.length > 0;

    const q: AdminQuestion = {
      id: paperId && Number.isInteger(qNo) ? makeId(paperId, qNo) : "",
      paper_id: paperId,
      q_no: qNo,
      format: r.get("format") || "mcq",
      canonical_id: r.get("canonical_of") || undefined,
      passage_id: r.get("passage_id") || undefined,
      source_ref: r.get("source_ref") || undefined,
      body: {
        en: { text: en, ...(table ? { table } : {}), ...(image && paperId ? { image: `${paperId}/${image}` } : {}) },
        ...(hiText ? { hi: { text: hiText } } : {}),
      },
      options,
      answer: { correct, status: r.get("answer_status").toLowerCase(), source: r.get("key_source") || undefined },
      primary,
      tags: tags.filter((t) => !(t.unit === primary.unit && t.topic === primary.topic)),
      explanation: hasExp ? { summary: summary || undefined, options: Object.keys(expOpts).length ? expOpts : undefined, references: refs, status: "draft" } : undefined,
      review_status: r.get("review_status").toLowerCase() || "draft",
    };
    rows.push({ rowNo: r.rowNo, q, parseIssues: issues });
  }
  return { papers, passages, rows, fileIssues };
}
