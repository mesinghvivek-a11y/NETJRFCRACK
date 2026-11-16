import { KEYS, makeId, parseCode, parseTable, type AdminQuestion, type Key, type Tag } from "./model";

export interface ParsedPaper {
  id: string; subject: string; year: number; session: string; language: string; exam_kind: string; shift: number;
  exam_date?: string; total_questions: number; duration_minutes?: number; max_marks?: number;
  answer_key_source?: string; answer_key_status?: string; source_name?: string; notes?: string;
}
export interface ParsedPassage { id: string; paper_id: string; body: { en: { text: string }; hi?: { text: string } } }
export interface ParsedRow { rowNo: number; q: AdminQuestion; parseIssues: string[]; primaryRaw: string; tagsRaw: string[] }
export interface ReadInfo { sheets: string[]; used: Record<string, string>; unknownHeaders: Record<string, string[]> }
export interface ParsedWorkbook { papers: ParsedPaper[]; passages: ParsedPassage[]; rows: ParsedRow[]; fileIssues: string[]; info: ReadInfo }

type Cell = string | number | boolean | Date | null | undefined;

/** lower case, no "(auto)", everything that is not a letter or digit becomes one underscore */
const nk = (t: string): string => t.toLowerCase().replace(/\(auto\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function s(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

// Other tools name columns differently. These are accepted in place of the template's names.
const ALIASES: Record<string, string[]> = {
  subject: ["subject_name", "subject_id"], year: ["exam_year"], session: ["exam_session", "cycle"], language: ["lang", "medium"],
  exam_kind: ["kind", "exam_type"], shift: ["exam_shift", "shift_no"], exam_date: ["date", "date_of_exam"],
  total_questions: ["no_of_questions", "number_of_questions", "total_q"], duration_minutes: ["duration", "time_minutes"],
  max_marks: ["maximum_marks", "total_marks"], answer_key_source: ["key_source_name"], answer_key_status: ["key_status_paper"],
  paper_id: ["paper_code", "paper"], q_no: ["qno", "question_no", "question_number", "q_number", "sr_no", "qn"],
  format: ["question_type", "q_type"], paragraph: ["context", "para"],
  question_en: ["question", "question_text", "question_english"], statements: ["statement", "statement_list"],
  opt_a: ["option_a", "option_1", "a"], opt_b: ["option_b", "option_2", "b"], opt_c: ["option_c", "option_3", "c"], opt_d: ["option_d", "option_4", "d"],
  correct: ["answer", "correct_answer", "correct_option", "ans", "correct_key"], answer_status: ["key_status", "status"],
  explanation: ["explanation_en", "detailed_explanation", "solution", "rationale"],
  expl_a: ["explanation_a", "option_a_explanation"], expl_b: ["explanation_b", "option_b_explanation"],
  expl_c: ["explanation_c", "option_c_explanation"], expl_d: ["explanation_d", "option_d_explanation"],
  references: ["reference", "books", "source_books"], primary_topic: ["topic", "main_topic", "primary", "topic_code", "primary_topic_code"],
  extra_tags: ["secondary_topics", "other_topics", "tags", "extra_topics", "additional_topics"],
  passage_id: ["passage_code"], canonical_of: ["repeat_of", "same_as"], source_ref: ["source_page", "page_ref"],
  review_status: ["review"], notes: ["remarks", "comment", "comments"],
};
const IGNORED = new Set(["question_id", "check", "entered", "status", "subject_code"]);
const SHEET_NAMES: Record<string, string[]> = {
  Papers: ["papers", "paper", "paper_details", "paper_info"],
  Questions: ["questions", "question", "question_bank", "qbank"],
  Passages: ["passages", "passage"],
};
const REQUIRED: Record<string, string[]> = {
  Papers: ["subject", "year", "session", "total_questions"],
  Questions: ["paper_id", "q_no", "question_en", "opt_a", "opt_b", "opt_c", "opt_d", "correct", "answer_status", "primary_topic"],
};

async function openWorkbook(file: File): Promise<{ names: string[]; read: (n: string) => Promise<Cell[][]> } | { error: string }> {
  const mod: any = await import("read-excel-file");
  const read: any = mod.default ?? mod;
  try {
    const names: string[] = typeof mod.readSheetNames === "function" ? await mod.readSheetNames(file) : [];
    return { names, read: (n: string) => read(file, { sheet: n }) as Promise<Cell[][]> };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

interface Sheet { rows: { rowNo: number; get: (col: string) => string }[]; headers: string[]; missing: string[]; unknown: string[] }

function toSheet(rows: Cell[][], required: string[]): Sheet {
  const headers = (rows[0] ?? []).map((h) => nk(s(h)));
  const index = new Map<string, number>();
  headers.forEach((h, i) => { if (h && !index.has(h)) index.set(h, i); });
  const find = (col: string): number => {
    const direct = index.get(col);
    if (direct !== undefined) return direct;
    for (const a of ALIASES[col] ?? []) { const j = index.get(a); if (j !== undefined) return j; }
    return -1;
  };
  const used = new Set<number>();
  const out: Sheet["rows"] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    out.push({
      rowNo: i + 1,
      get: (col: string): string => {
        const j = find(col);
        if (j < 0) return "";
        used.add(j);
        return s(r[j]);
      },
    });
  }
  // columns this reader looks for, so unknown ones can be reported
  const known = new Set<number>();
  for (const col of [...Object.keys(ALIASES), ...EXTRA_COLUMNS]) { const j = find(col); if (j >= 0) known.add(j); }
  const unknown = headers.filter((h, i) => h && !known.has(i) && !IGNORED.has(h));
  const missing = required.filter((c) => find(c) < 0);
  return { rows: out, headers, missing, unknown };
}
const EXTRA_COLUMNS = ["table", "image_file", "key_source", "difficulty", "nature", "question_hi", "paragraph_hi", "statements_hi",
  "opt_a_hi", "opt_b_hi", "opt_c_hi", "opt_d_hi", "source_name", "text_en", "text_hi", "passage_id"];

const isExample = (note: string): boolean => /^example/i.test(note);
const lines = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
const optNum = (v: string): number | undefined => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined);

function normSession(v: string): string {
  const t = nk(v);
  return t.startsWith("jun") ? "june" : t.startsWith("dec") ? "december" : t;
}
function normKind(v: string): string {
  const t = nk(v).replace(/_/g, "");
  if (t === "" || t === "regular" || t === "normal") return "regular";
  return t.includes("reexam") || t.includes("reexamination") ? "reexam" : t;
}
function normLang(v: string): string {
  const t = nk(v);
  return t === "" || t.startsWith("e") ? "E" : t.startsWith("h") ? "H" : v.toUpperCase();
}
function normFormat(v: string): string {
  const t = nk(v);
  if (!t || t === "mcq" || t.startsWith("multiple") || t === "single_choice") return "mcq";
  if (t.startsWith("statement")) return "statement";
  if (t.includes("assertion")) return "assertion_reason";
  if (t.includes("match")) return "matching";
  if (t.includes("table")) return "table";
  if (t.includes("image") || t.includes("map") || t.includes("diagram")) return "image";
  return t;
}
function normStatus(v: string): string {
  const t = nk(v);
  if (t.startsWith("final")) return "final";
  if (t.startsWith("prov")) return "provisional";
  if (t.startsWith("drop")) return "dropped";
  if (t.startsWith("multi")) return "multiple";
  if (t.startsWith("disput")) return "disputed";
  return t;
}
function parseCorrect(v: string): Key[] {
  const cleaned = v.toUpperCase().replace(/OPTION|ANSWER|ANS|KEY|CORRECT/g, " ");
  const out: Key[] = [];
  for (const tok of cleaned.split(/[^A-D1-4]+/)) {
    if (!tok) continue;
    for (const ch of tok) {
      const k = (/[1-4]/.test(ch) ? KEYS[Number(ch) - 1] : ch) as Key;
      if ((KEYS as string[]).includes(k) && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

/** Reads the workbook. Paper codes are worked out afterwards, against the papers already in the database. */
export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const fileIssues: string[] = [];
  const info: ReadInfo = { sheets: [], used: {}, unknownHeaders: {} };
  const empty = (): ParsedWorkbook => ({ papers: [], passages: [], rows: [], fileIssues, info });

  const opened = await openWorkbook(file);
  if ("error" in opened) {
    fileIssues.push(`This file could not be opened as an Excel (.xlsx) workbook: ${opened.error}. If it came from Numbers or Google Sheets, export it as Excel (.xlsx) and try again.`);
    return empty();
  }
  const book: { names: string[]; read: (n: string) => Promise<Cell[][]> } = opened;
  info.sheets = book.names;

  async function load(role: "Papers" | "Questions" | "Passages"): Promise<Sheet | null> {
    const wanted = SHEET_NAMES[role];
    const actual = book.names.length ? book.names.find((n: string) => wanted.includes(nk(n))) : role;
    if (!actual) {
      if (role !== "Passages") fileIssues.push(`The "${role}" sheet was not found. Sheets in your file: ${book.names.join(", ") || "none"}. Rename the sheet to ${role}.`);
      return null;
    }
    try {
      const rows = await book.read(actual);
      const sheet = toSheet(rows, REQUIRED[role] ?? []);
      info.used[role] = actual;
      info.unknownHeaders[role] = sheet.unknown;
      if (sheet.missing.length) {
        fileIssues.push(`The "${actual}" sheet is missing these columns: ${sheet.missing.join(", ")}. Columns found: ${sheet.headers.filter((h) => h).join(", ") || "none"}.`);
        return null;
      }
      return sheet;
    } catch (e) {
      if (role !== "Passages") fileIssues.push(`Could not read the "${actual}" sheet: ${e instanceof Error ? e.message : String(e)}.`);
      return null;
    }
  }

  const [papersSheet, qSheet, passSheet] = [await load("Papers"), await load("Questions"), await load("Passages")];
  if (!papersSheet && !qSheet) return empty();

  const papers: ParsedPaper[] = [];
  for (const r of papersSheet?.rows ?? []) {
    const subject = r.get("subject").toLowerCase();
    if (!subject && !r.get("year")) continue;
    if (isExample(r.get("notes"))) continue;
    const year = Number(r.get("year"));
    const session = normSession(r.get("session"));
    const language = normLang(r.get("language"));
    const exam_kind = normKind(r.get("exam_kind"));
    const shift = Number(r.get("shift")) || 1;
    papers.push({
      id: "",
      subject, year, session, language, exam_kind, shift,
      exam_date: r.get("exam_date") || undefined,
      total_questions: Number(r.get("total_questions")),
      duration_minutes: optNum(r.get("duration_minutes")),
      max_marks: optNum(r.get("max_marks")),
      answer_key_source: r.get("answer_key_source") || undefined,
      answer_key_status: normStatus(r.get("answer_key_status")) || undefined,
      source_name: r.get("source_name") || undefined,
      notes: r.get("notes") || undefined,
    });
  }

  const passages: ParsedPassage[] = [];
  for (const r of passSheet?.rows ?? []) {
    const id = r.get("passage_id");
    const text = r.get("text_en");
    if (!id || isExample(text)) continue;
    const hi = r.get("text_hi");
    passages.push({ id, paper_id: r.get("paper_id").toUpperCase(), body: { en: { text }, ...(hi ? { hi: { text: hi } } : {}) } });
  }

  const rows: ParsedRow[] = [];
  for (const r of qSheet?.rows ?? []) {
    const paperId = r.get("paper_id").toUpperCase();
    const qNoText = r.get("q_no");
    if (!paperId && !qNoText && !r.get("question_en")) continue;
    if (isExample(r.get("notes"))) continue;
    const issues: string[] = [];
    const qNo = Number(qNoText);

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
      format: normFormat(r.get("format")),
      canonical_id: r.get("canonical_of").toUpperCase() || undefined,
      passage_id: r.get("passage_id") || undefined,
      source_ref: r.get("source_ref") || undefined,
      difficulty: nk(r.get("difficulty")) || undefined,
      nature: nk(r.get("nature")) || undefined,
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
      answer: { correct: parseCorrect(r.get("correct")), status: normStatus(r.get("answer_status")), source: r.get("key_source") || undefined },
      primary,
      tags: tags.filter((t) => !(t.unit === primary.unit && t.topic === primary.topic)),
      explanation: hasExp ? { summary: summary || undefined, options: Object.keys(expOpts).length ? expOpts : undefined, references: refs, status: "draft" } : undefined,
      review_status: nk(r.get("review_status")) || "draft",
    };
    rows.push({ rowNo: r.rowNo, q, parseIssues: issues, primaryRaw, tagsRaw });
  }
  return { papers, passages, rows, fileIssues, info };
}
