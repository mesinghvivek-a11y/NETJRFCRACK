import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA = path.join(ROOT, "data");
export const MEDIA = path.join(DATA, "media");

export interface Topic { id: string; name: string }
export interface Unit { id: string; number: number; name: string; topics: Topic[] }
export interface Taxonomy {
  subject: { id: string; name: string; nta_code?: string; questions_per_paper: number; minutes_per_paper: number };
  units: Unit[];
}
export interface LoadedPaper { file: string; rel: string; data?: any; parseError?: string }
export interface Issue { file: string; level: "error" | "warn"; msg: string }

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
}

export function loadTaxonomies(): Taxonomy[] {
  return walk(path.join(DATA, "taxonomy")).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
}

export function loadPapers(): LoadedPaper[] {
  return walk(path.join(DATA, "questions")).map((file) => {
    const rel = path.relative(ROOT, file);
    try {
      return { file, rel, data: JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (e) {
      return { file, rel, parseError: String(e) };
    }
  });
}

export const isSample = (p: LoadedPaper) => path.basename(p.file).startsWith("sample-");

export function stable(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object")
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
export const contentHash = (q: unknown) => crypto.createHash("sha256").update(stable(q)).digest("hex");

export function imagePaths(q: any): string[] {
  const out: string[] = [];
  for (const lang of ["en", "hi"]) {
    if (q.body?.[lang]?.image) out.push(q.body[lang].image);
    for (const o of q.options ?? []) if (o[lang]?.image) out.push(o[lang].image);
  }
  return out;
}

export function validateAll(): { issues: Issue[]; papers: LoadedPaper[]; taxonomies: Taxonomy[] } {
  const issues: Issue[] = [];
  const add = (file: string, level: "error" | "warn", msg: string) => issues.push({ file, level, msg });

  const taxonomies = loadTaxonomies();
  const subjects = new Map(taxonomies.map((t) => [t.subject.id, t]));
  const papers = loadPapers();

  const AjvCtor: any = (Ajv2020 as any).default ?? Ajv2020;
  const addFmt: any = (addFormats as any).default ?? addFormats;
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  addFmt(ajv);
  const validateSchema = ajv.compile(JSON.parse(fs.readFileSync(path.join(DATA, "schema", "paper.schema.json"), "utf8")));

  // taxonomy sanity
  for (const t of taxonomies) {
    const seen = new Set<string>();
    for (const u of t.units) for (const tp of u.topics) {
      if (seen.has(tp.id)) add("taxonomy", "error", `duplicate topic id ${tp.id}`);
      seen.add(tp.id);
      if (!tp.id.startsWith(u.id + "-")) add("taxonomy", "error", `topic ${tp.id} does not belong to unit ${u.id}`);
    }
  }

  const allIds = new Map<string, string>(); // question id -> file
  const paperIds = new Map<string, string>();

  for (const lp of papers) {
    const f = lp.rel;
    if (lp.parseError) { add(f, "error", `invalid JSON: ${lp.parseError}`); continue; }
    const d = lp.data;

    if (!validateSchema(d)) {
      for (const e of validateSchema.errors ?? []) add(f, "error", `schema: ${e.instancePath || "/"} ${e.message}`);
      continue; // structural errors make the semantic checks unreliable
    }

    const p = d.paper;
    const stem = path.basename(lp.file, ".json").replace(/^sample-/, "");
    if (stem !== p.id) add(f, "error", `file name must be ${p.id}.json (got ${path.basename(lp.file)})`);
    if (paperIds.has(p.id)) add(f, "error", `paper id ${p.id} already used in ${paperIds.get(p.id)}`);
    paperIds.set(p.id, f);

    const tax = subjects.get(p.subject);
    if (!tax) { add(f, "error", `no taxonomy file for subject "${p.subject}"`); continue; }
    const unitMap = new Map(tax.units.map((u) => [u.id, new Set(u.topics.map((t) => t.id))]));

    const passageIds = new Set<string>((d.passages ?? []).map((x: any) => x.id));
    const prefix = p.id.toUpperCase() + "-Q";
    const qnos = new Set<number>();
    let noExpl = 0;

    for (const q of d.questions) {
      const at = `${q.id}`;
      if (!q.id.startsWith(prefix)) add(f, "error", `${at}: id must start with ${prefix}`);
      else if (Number(q.id.slice(prefix.length)) !== q.q_no) add(f, "error", `${at}: id number does not match q_no ${q.q_no}`);
      if (allIds.has(q.id)) add(f, "error", `${at}: duplicate id (also in ${allIds.get(q.id)})`);
      allIds.set(q.id, f);
      if (qnos.has(q.q_no)) add(f, "error", `${at}: duplicate q_no ${q.q_no}`);
      qnos.add(q.q_no);
      if (q.q_no > p.total_questions) add(f, "error", `${at}: q_no exceeds total_questions ${p.total_questions}`);

      if (q.options.map((o: any) => o.key).join("") !== "ABCD") add(f, "error", `${at}: options must be A, B, C, D in order`);

      const tags = [q.primary, ...(q.tags ?? [])];
      for (const t of tags) {
        const topics = unitMap.get(t.unit);
        if (!topics) { add(f, "error", `${at}: unknown unit ${t.unit}`); continue; }
        if (t.topic && !topics.has(t.topic)) add(f, "error", `${at}: topic ${t.topic} not in unit ${t.unit}`);
      }
      if (!q.primary.topic) add(f, "warn", `${at}: primary tag has no topic`);
      const pk = `${q.primary.unit}/${q.primary.topic ?? ""}`;
      if ((q.tags ?? []).some((t: any) => `${t.unit}/${t.topic ?? ""}` === pk)) add(f, "warn", `${at}: tags repeat the primary tag`);

      if (q.passage_id && !passageIds.has(q.passage_id)) add(f, "error", `${at}: passage_id ${q.passage_id} not in this file`);
      if (q.format === "table" && !q.body.en.table) add(f, "error", `${at}: format "table" needs body.en.table`);
      if (q.format === "image" && imagePaths(q).length === 0) add(f, "error", `${at}: format "image" needs an image`);
      for (const img of imagePaths(q)) if (!fs.existsSync(path.join(MEDIA, img))) add(f, "error", `${at}: image not found at data/media/${img}`);

      if (q.answer.status === "dropped" && q.answer.correct.length) add(f, "warn", `${at}: dropped question has correct keys`);
      if (!q.explanation?.summary) noExpl++;
      else if (q.explanation.options && Object.keys(q.explanation.options).length < 4) add(f, "warn", `${at}: explanation covers fewer than 4 options`);
      if (q.review_status === "verified" && !q.explanation) add(f, "warn", `${at}: verified but has no explanation`);
    }

    // canonical references, checked after all files are loaded (below)
    if (d.questions.length !== p.total_questions)
      add(f, "warn", `partial paper: ${d.questions.length} of ${p.total_questions} questions`);
    if (noExpl) add(f, "warn", `${noExpl} question(s) without explanation`);
  }

  for (const lp of papers) {
    if (!lp.data?.questions) continue;
    for (const q of lp.data.questions)
      if (q.canonical_id && !allIds.has(q.canonical_id)) add(lp.rel, "error", `${q.id}: canonical_id ${q.canonical_id} not found`);
  }
  return { issues, papers, taxonomies };
}
