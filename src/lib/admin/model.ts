// Shared types, parsing helpers and validation for the admin portal.

export type Key = "A" | "B" | "C" | "D";
export const KEYS: Key[] = ["A", "B", "C", "D"];
export const FORMATS: string[] = ["mcq", "matching", "assertion_reason", "statement", "table", "image"];
export const STATUSES: string[] = ["final", "provisional", "dropped", "multiple", "disputed"];
export const DIFFICULTIES: string[] = ["easy", "medium", "hard"];
export const NATURES: string[] = ["factual", "conceptual", "analytical", "application", "map_or_diagram"];

export interface Tag { unit: string; topic?: string }
export interface TableData { columns: string[]; rows: string[][] }
export interface Content { text: string; context?: string; statements?: string[]; table?: TableData; image?: string }
export interface HiContent { text: string; context?: string; statements?: string[] }
export interface Reference { book: string; page?: string; note?: string }

export interface AdminQuestion {
  id: string;
  paper_id: string;
  q_no: number;
  format: string;
  canonical_id?: string;
  passage_id?: string;
  source_ref?: string;
  body: { en: Content; hi?: HiContent };
  difficulty?: string;
  nature?: string;
  options: { key: Key; en: { text: string }; hi?: { text: string } }[];
  answer: { correct: Key[]; status: string; source?: string };
  primary: Tag;
  tags: Tag[];
  explanation?: { summary?: string; options?: Partial<Record<Key, string>>; references?: Reference[]; status?: string };
  review_status: string;
}

export interface Issue { level: "error" | "warn"; msg: string }
export interface TaxUnit { id: string; number: number; name: string; topics: { id: string; name: string; is_legacy?: boolean }[] }
export interface Ctx { units: TaxUnit[]; passageIds?: Set<string>; paperTotal?: number }

export const pad3 = (n: number): string => String(n).padStart(3, "0");
/** Question id = paper code + question number, e.g. 80-2025-JUN-E-045. */
export const makeId = (paperId: string, qNo: number): string => `${paperId.toUpperCase()}-${pad3(qNo)}`;

export function parseCode(raw: string): Tag | null {
  const code = raw.trim().toLowerCase();
  let m = /^([a-z0-9]+-u\d{2})$/.exec(code);
  if (m) return { unit: m[1] };
  m = /^([a-z0-9]+-u\d{2})-t\d{2}$/.exec(code);
  if (m) return { unit: m[1], topic: code };
  return null;
}

export function parseTable(text: string | undefined | null): TableData | undefined {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return undefined;
  const cells = lines.map((l) => l.split("|").map((c) => c.trim()));
  return { columns: cells[0], rows: cells.slice(1) };
}

export function tableToText(t: TableData | undefined): string {
  if (!t) return "";
  return [t.columns, ...t.rows].map((r) => r.join(" | ")).join("\n");
}

export function refLine(r: Reference): string {
  return `${r.book}${r.page ? `, p. ${r.page}` : ""}${r.note ? `: ${r.note}` : ""}`;
}

export function stateOf(issues: Issue[], isUpdate: boolean): "new" | "changed" | "error" {
  if (issues.some((i) => i.level === "error")) return "error";
  return isUpdate ? "changed" : "new";
}

// ---- comparison (staged row vs the live question) ----
export function clean(v: any): any {
  if (Array.isArray(v)) {
    const a = v.map(clean).filter((x: any) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v).sort()) {
      const c = clean(v[k]);
      if (c !== undefined) o[k] = c;
    }
    return Object.keys(o).length ? o : undefined;
  }
  if (v === null || v === undefined || v === "") return undefined;
  return v;
}

function tagSort(a: Tag, b: Tag): number {
  return (a.unit + (a.topic ?? "")).localeCompare(b.unit + (b.topic ?? ""));
}

function comparable(q: any): any {
  return {
    format: q.format,
    canonical_id: q.canonical_id,
    passage_id: q.passage_id,
    source_ref: q.source_ref,
    review_status: q.review_status,
    difficulty: q.difficulty,
    nature: q.nature,
    body: q.body,
    options: q.options,
    answer: { correct: [...(q.answer?.correct ?? [])].sort(), status: q.answer?.status, source: q.answer?.source },
    primary: q.primary,
    tags: [...(q.tags ?? [])].sort(tagSort),
    explanation: q.explanation
      ? { summary: q.explanation.summary, options: q.explanation.options, references: q.explanation.references }
      : undefined,
  };
}

export function diffFields(a: any, b: any): string[] {
  const ca = comparable(a);
  const cb = comparable(b);
  return Object.keys(ca).filter((k) => JSON.stringify(clean(ca[k])) !== JSON.stringify(clean(cb[k])));
}

// ---- DB row (questions + question_tags + question_keys) -> editor shape ----
export function rowToQuestion(row: any): AdminQuestion {
  const k: any = Array.isArray(row.question_keys) ? row.question_keys[0] : row.question_keys;
  const tags: any[] = row.question_tags ?? [];
  return {
    id: row.id,
    paper_id: row.paper_id,
    q_no: row.q_no,
    format: row.format,
    canonical_id: row.canonical_id ?? undefined,
    passage_id: row.passage_id ?? undefined,
    source_ref: row.source_ref ?? undefined,
    difficulty: row.difficulty ?? undefined,
    nature: row.nature ?? undefined,
    body: row.body,
    options: row.options,
    answer: { correct: k?.correct_keys ?? [], status: k?.answer_status ?? "final", source: k?.key_source ?? undefined },
    primary: { unit: row.primary_unit_id, topic: row.primary_topic_id ?? undefined },
    tags: tags.filter((t: any) => !t.is_primary).map((t: any) => ({ unit: t.unit_id, topic: t.topic_id ?? undefined })),
    explanation: k?.explanation ? { ...k.explanation, status: k.explanation_status } : undefined,
    review_status: row.review_status,
  };
}

// ---- validation ----
export function validateQuestion(q: AdminQuestion, ctx: Ctx): Issue[] {
  const out: Issue[] = [];
  const err = (msg: string) => out.push({ level: "error", msg });
  const warn = (msg: string) => out.push({ level: "warn", msg });

  if (!q.paper_id) err("Paper is missing.");
  if (!Number.isInteger(q.q_no) || q.q_no < 1) err("Question number must be a whole number from 1.");
  else if (ctx.paperTotal && q.q_no > ctx.paperTotal) err(`Question number is above the paper total (${ctx.paperTotal}).`);
  if (q.paper_id && Number.isInteger(q.q_no) && q.id !== makeId(q.paper_id, q.q_no)) err("Question id does not match paper and number.");

  if (!FORMATS.includes(q.format)) err(`Format must be one of: ${FORMATS.join(", ")}.`);
  if (q.format === "table" && !q.body?.en?.table) err("Format is table but no table is filled in.");
  if (q.format === "image" && !q.body?.en?.image) err("Format is image but no image file is given.");
  if (!q.body?.en?.text?.trim() && !q.body?.en?.image) err("Question text is empty.");
  if (q.format === "statement" && !(q.body?.en?.statements && q.body.en.statements.length > 0)) warn("Format is statement but no statements are listed.");
  if (q.difficulty && !DIFFICULTIES.includes(q.difficulty)) err(`Difficulty must be one of: ${DIFFICULTIES.join(", ")}.`);
  if (q.nature && !NATURES.includes(q.nature)) err(`Nature must be one of: ${NATURES.join(", ")}.`);

  if (!q.options || q.options.length !== 4) err("There must be exactly four options.");
  else q.options.forEach((o, i) => { if (!o.en?.text?.trim()) err(`Option ${KEYS[i]} is empty.`); });

  const n = q.answer?.correct?.length ?? 0;
  const st = q.answer?.status;
  if (!STATUSES.includes(st)) err("Answer status is missing or not valid.");
  else if ((st === "final" || st === "provisional") && n !== 1) err(`Status ${st} needs exactly one correct option.`);
  else if (st === "multiple" && n < 2) err("Status multiple needs two or more correct options.");
  else if (st === "dropped" && n > 0) warn("A dropped question normally has no correct option.");
  else if (st === "disputed" && n === 0) warn("Disputed question has no option marked.");

  const unit = ctx.units.find((u) => u.id === q.primary?.unit);
  if (!unit) err("Main unit is missing or unknown.");
  else if (!q.primary.topic) warn("No main topic chosen (unit only).");
  else if (!unit.topics.some((t) => t.id === q.primary.topic)) err(`Topic ${q.primary.topic} does not belong to ${unit.id}.`);

  const seen = new Set<string>([`${q.primary?.unit}/${q.primary?.topic ?? ""}`]);
  for (const t of q.tags ?? []) {
    const u = ctx.units.find((x) => x.id === t.unit);
    if (!u) { err(`Extra tag has unknown unit ${t.unit}.`); continue; }
    if (t.topic && !u.topics.some((x) => x.id === t.topic)) err(`Extra tag topic ${t.topic} does not belong to ${t.unit}.`);
    const key = `${t.unit}/${t.topic ?? ""}`;
    if (seen.has(key)) warn(`Extra tag ${t.topic ?? t.unit} repeats another tag.`);
    seen.add(key);
  }

  if (q.passage_id && ctx.passageIds && !ctx.passageIds.has(q.passage_id)) err(`Passage ${q.passage_id} not found.`);

  const ex = q.explanation;
  if (!ex || (!ex.summary && !ex.options)) warn("No explanation yet.");
  else if (ex.options && KEYS.some((k) => !ex.options?.[k])) warn("Not every option is explained.");
  if (q.review_status === "verified" && (!ex || (!ex.summary && !ex.options))) warn("Marked verified but has no explanation.");
  return out;
}


// ---- turning whatever was typed in the workbook into a syllabus tag ----
const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function bigrams(t: string): string[] {
  const x = norm(t).replace(/ /g, "");
  const out: string[] = [];
  for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of B) {
    const c = counts.get(g) ?? 0;
    if (c > 0) { hit++; counts.set(g, c - 1); }
  }
  return (2 * hit) / (A.length + B.length);
}

/**
 * Accepts a code (geo-u04-t01), a unit number (Unit 4 or U4), a unit name, a topic name,
 * or "Unit 4: topic name". Returns the tag, or a helpful error with a suggestion.
 */
export function resolveTag(raw: string, units: TaxUnit[]): { tag?: Tag; error?: string } {
  const text = raw.trim();
  if (!text) return {};
  const coded = parseCode(text);
  if (coded) return { tag: coded };

  const n = norm(text);
  const topicHits: { unit: TaxUnit; id: string }[] = [];
  for (const u of units) for (const t of u.topics) if (norm(t.name) === n) topicHits.push({ unit: u, id: t.id });
  if (topicHits.length === 1) return { tag: { unit: topicHits[0].unit.id, topic: topicHits[0].id } };
  if (topicHits.length > 1) return { error: `"${text}" matches topics in several units (${topicHits.map((h) => "Unit " + h.unit.number).join(", ")}). Use the topic code.` };

  const unitWord = /^(?:unit|u)\s*(\d{1,2})\b\s*(.*)$/.exec(n);
  if (unitWord) {
    const u = units.find((x) => x.number === Number(unitWord[1]));
    if (!u) return { error: `Unit ${unitWord[1]} does not exist in this syllabus.` };
    const rest = unitWord[2].trim();
    if (!rest || norm(u.name) === rest) return { tag: { unit: u.id } };
    const t = u.topics.find((x) => norm(x.name) === rest);
    if (t) return { tag: { unit: u.id, topic: t.id } };
    const best = u.topics.map((x) => ({ x, s: similarity(x.name, rest) })).sort((a, b) => b.s - a.s)[0];
    return { error: `Topic "${rest}" not found in Unit ${u.number}.${best && best.s >= 0.5 ? ` Did you mean "${best.x.name}" (${best.x.id})?` : ""}` };
  }

  const unitHit = units.find((u) => norm(u.name) === n || norm(`unit ${u.number} ${u.name}`) === n);
  if (unitHit) return { tag: { unit: unitHit.id } };

  const all: { label: string; code: string; s: number }[] = [];
  for (const u of units) {
    all.push({ label: u.name, code: u.id, s: similarity(u.name, text) });
    for (const t of u.topics) all.push({ label: t.name, code: t.id, s: similarity(t.name, text) });
  }
  all.sort((a, b) => b.s - a.s);
  const best = all[0];
  return { error: `"${text}" is not in the syllabus.${best && best.s >= 0.5 ? ` Did you mean "${best.label}" (${best.code})?` : ""}` };
}
