import { KEYS, makeId, paperCode, parseCode, parseTable, type AdminQuestion, type Key, type Tag } from "./model";

export interface ParsedPaper {
  id: string; subject: string; year: number; session: string; language: string; exam_kind: string; shift: number;
  exam_date?: string; total_questions: number; duration_minutes?: number; max_marks?: number;
  answer_key_source?: string; answer_key_status?: string; source_name?: string; notes?: string;
}
export interface ParsedPassage { id: string; paper_id: string; body: { en: { text: string }; hi?: { text: string } } }
export interface ParsedRow { rowNo: number; q: AdminQuestion; parseIssues: string[]; primaryRaw: string; tagsRaw: string[] }
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
    const get = (col: string): string => {
      const j = head.indexOf(col);
      return j < 0 ? "" : s(r[j]);
    };
    out.push({ rowNo: i + 1, get });
  }
  return out;
}

const isExample = (note: string): boolean => /^example/i.test(note);
const lines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
const optNum = (v: string): number | undefined => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);

/** subjectCodes maps a subject id (geography) to its NTA code (80). */
export async function parseWorkbook(file: File, subjectCodes: Record<string, string>): Promise<ParsedWorkbook> {
  const fileIssues: string[] = [];
  const papersRaw = await readSheet(file, "Papers");
  const qRaw = await readSheet(file, "Questions");
  const passRaw = await readSheet(file, "Passages");
  if (!papersRaw) fileIssues.push('The sheet "Papers" was not found.');
  if (!qRaw) fileIssues.push('The sheet "Questions" was not found.');

  const papers: ParsedPaper[] = [];
  for (const r of toObjects(papersRaw ?? [])) {
    const subject = r.get("subject").toLowerCase();
    if (!subject && !r.get("year")) continue;
    if (isExample(r.get("notes"))) continue;
    const year = Number(r.get("year"));
    const session = r.get("session").toLowerCase();
    const language = (r.get("language") || "E").toUpperCase();
    const exam_kind = r.get("exam_kind").toLowerCase() || "regular";
    const shift = Number(r.get("shift")) || 1;
    papers.push({
      id: paperCode({ subjectCode: subjectCodes[subject] ?? "", year, session, language, shift, examKind: exam_kind }),
      subject, year, session, language, exam_kind, shift,
      exam_date: r.get("exam_date") || undefined,
      total_questions: Number(r.get("total_questions")),
      duration_minutes: optNum(r.get("duration_minutes")),
      max_marks: optNum(r.get("max_marks")),
      answer_key_source: r.get("answer_key_source") || undefined,
      answer_key_status: r.get("answer_key_status").toLowerCase() || undefined,
      source_name: r.get("source_name") || undefined,
      notes: r.get("notes") || undefined,
    });
  }

  const passages: ParsedPassage[] = [];
  for (const r of toObjects(passRaw ?? [])) {
    const id = r.get("passage_id");
    const text = r.get("text_en");
    if (!id || isExample(text)) continue;
    const hi = r.get("text_hi");
    passages.push({ id, paper_id: r.get("paper_id").toUpperCase(), body: { en: { text }, ...(hi ? { hi: { text: hi } } : {}) } });
  }

  const rows: ParsedRow[] = [];
  for (const r of toObjects(qRaw ?? [])) {
    const paperId = r.get("paper_id").toUpperCase();
    const qNoText = r.get("q_no");
    if (!paperId && !qNoText && !r.get("question_en")) continue;
    if (isExample(r.get("notes"))) continue;
    const issues: string[] = [];
    const qNo = Number(qNoText);

    const correct = Array.from(new Set(r.get("correct").toUpperCase().split(/[^A-D]+/).filter((x) => x.length > 0))).filter(
      (x): x is Key => (KEYS as string[]).includes(x),
    );

    // Topic cells are resolved against the syllabus in the database later (codes, names or "Unit 4").
    const primaryRaw = r.get("primary_topic");
    const tagsRaw = r.get("extra_tags").split(/[;\n]+/).map((x) => x.trim()).filter((x) => x.length > 0);
    const primary: Tag = parseCode(primaryRaw) ?? { unit: "" };
    const tags: Tag[] = [];
    for (const t of tagsRaw) {
      const parsed = parseCode(t);
      if (parsed) tags.push(parsed);
    }

    const table = parseTable(r.get("table"));
    const image = r.get("image_file");
    const context = r.get("paragraph");
    const statements = lines(r.get("statements"));

    const hiText = r.get("question_hi");
    const hiContext = r.get("paragraph_hi");
    const hiStatements = lines(r.get("statements_hi"));
    const hasHi = Boolean(hiText || hiContext || hiStatements.length);

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
      format: r.get("format").toLowerCase() || "mcq",
      canonical_id: r.get("canonical_of").toUpperCase() || undefined,
      passage_id: r.get("passage_id") || undefined,
      source_ref: r.get("source_ref") || undefined,
      difficulty: r.get("difficulty").toLowerCase() || undefined,
      nature: r.get("nature").toLowerCase() || undefined,
      body: {
        en: {
          text: r.get("question_en"),
          ...(context ? { context } : {}),
          ...(statements.length ? { statements } : {}),
          ...(table ? { table } : {}),
          ...(image && paperId ? { image: `${paperId}/${image}` } : {}),
        },
        ...(hasHi ? { hi: { text: hiText, ...(hiContext ? { context: hiContext } : {}), ...(hiStatements.length ? { statements: hiStatements } : {}) } } : {}),
      },
      options,
      answer: { correct, status: r.get("answer_status").toLowerCase(), source: r.get("key_source") || undefined },
      primary,
      tags: tags.filter((t) => !(t.unit === primary.unit && t.topic === primary.topic)),
      explanation: hasExp ? { summary: summary || undefined, options: Object.keys(expOpts).length ? expOpts : undefined, references: refs, status: "draft" } : undefined,
      review_status: r.get("review_status").toLowerCase() || "draft",
    };
    rows.push({ rowNo: r.rowNo, q, parseIssues: issues, primaryRaw, tagsRaw });
  }
  return { papers, passages, rows, fileIssues };
}
