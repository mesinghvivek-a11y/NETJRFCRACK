import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MEDIA, contentHash, imagePaths, isSample, validateAll } from "./lib.js";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const WITH_SAMPLES = args.has("--include-samples");
const SKIP_MEDIA = args.has("--skip-media");

const { issues, papers, taxonomies } = validateAll();
const errors = issues.filter((i) => i.level === "error");
if (errors.length) {
  for (const e of errors) console.log(`ERROR  ${e.file}  ${e.msg}`);
  console.log(`\nImport aborted: fix ${errors.length} validation error(s) first (npm run validate).`);
  process.exit(1);
}

const toImport = papers.filter((p) => WITH_SAMPLES || !isSample(p));
const skipped = papers.length - toImport.length;
if (skipped) console.log(`Skipping ${skipped} sample file(s) (use --include-samples to import them).`);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!url || !key)) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, never the anon key).");
  process.exit(1);
}
const db = DRY ? (null as any) : createClient(url!, key!, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: any }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message ?? JSON.stringify(error)}`);
  return data;
}
const chunk = <T,>(a: T[], n = 200): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const TESTABLE = new Set(["final", "provisional", "multiple"]);

async function importTaxonomy() {
  for (const t of taxonomies) {
    const s = t.subject;
    if (DRY) { console.log(`taxonomy ${s.id}: ${t.units.length} units, ${t.units.reduce((n, u) => n + u.topics.length, 0)} topics`); continue; }
    await must(db.from("subjects").upsert({ id: s.id, name: s.name, nta_code: s.nta_code ?? null, questions_per_paper: s.questions_per_paper, minutes_per_paper: s.minutes_per_paper }), "subjects");
    await must(db.from("units").upsert(t.units.map((u) => ({ id: u.id, subject_id: s.id, number: u.number, name: u.name }))), "units");
    const topics = t.units.flatMap((u) => u.topics.map((tp, i) => ({ id: tp.id, unit_id: u.id, name: tp.name, sort: i + 1 })));
    for (const c of chunk(topics)) await must(db.from("topics").upsert(c), "topics");
    console.log(`taxonomy ${s.id}: ${t.units.length} units, ${topics.length} topics`);
  }
}

async function importPaper(file: string, d: any) {
  const p = d.paper;
  const qs: any[] = d.questions;
  if (DRY) { console.log(`${p.id}: ${qs.length} question(s) (dry run)`); return; }

  await must(db.from("papers").upsert({
    id: p.id, subject_id: p.subject, year: p.year, session: p.session, exam_kind: p.exam_kind,
    exam_date: p.exam_date ?? null, shift: p.shift, total_questions: p.total_questions,
  }), "papers");

  if (d.passages?.length)
    await must(db.from("passages").upsert(d.passages.map((x: any) => ({ id: x.id, paper_id: p.id, body: x.body }))), "passages");

  const existing = await must<{ id: string; content_hash: string }[]>(db.from("questions").select("id, content_hash").eq("paper_id", p.id), "existing questions");
  const have = new Map(existing.map((r) => [r.id, r.content_hash]));
  const hashed = qs.map((q) => ({ q, hash: contentHash(q) }));
  const changed = hashed.filter(({ q, hash }) => have.get(q.id) !== hash);

  if (changed.length) {
    const now = new Date().toISOString();
    const rows = changed.map(({ q, hash }) => ({
      id: q.id, paper_id: p.id, subject_id: p.subject, q_no: q.q_no, canonical_id: q.canonical_id ?? null,
      format: q.format, body: q.body, options: q.options, passage_id: q.passage_id ?? null,
      primary_unit_id: q.primary.unit, primary_topic_id: q.primary.topic ?? null,
      review_status: q.review_status ?? "draft", is_testable: TESTABLE.has(q.answer.status),
      content_hash: hash, updated_at: now,
    }));
    for (const c of chunk(rows)) await must(db.from("questions").upsert(c), "questions");

    const ids = changed.map(({ q }) => q.id);
    for (const c of chunk(ids)) await must(db.from("question_tags").delete().in("question_id", c), "clear tags");
    const tagRows: any[] = [];
    for (const { q } of changed) {
      const seen = new Set<string>();
      const push = (t: any, primary: boolean) => {
        const k = `${t.unit}/${t.topic ?? ""}`;
        if (seen.has(k)) return;
        seen.add(k);
        tagRows.push({ question_id: q.id, unit_id: t.unit, topic_id: t.topic ?? null, is_primary: primary });
      };
      push(q.primary, true);
      for (const t of q.tags ?? []) push(t, false);
    }
    for (const c of chunk(tagRows)) await must(db.from("question_tags").insert(c), "tags");

    const keyRows = changed.map(({ q }) => ({
      question_id: q.id, correct_keys: q.answer.correct, answer_status: q.answer.status, key_source: q.answer.source ?? null,
      explanation: q.explanation ? { summary: q.explanation.summary ?? null, options: q.explanation.options ?? null, references: q.explanation.references ?? [] } : null,
      explanation_status: q.explanation ? q.explanation.status ?? "draft" : "none",
    }));
    for (const c of chunk(keyRows)) await must(db.from("question_keys").upsert(c), "question_keys");

    if (!SKIP_MEDIA) {
      const imgs = [...new Set(changed.flatMap(({ q }) => imagePaths(q)))];
      for (const img of imgs) {
        const buf = fs.readFileSync(path.join(MEDIA, img));
        const type = MIME[path.extname(img).toLowerCase()] ?? "application/octet-stream";
        await must(db.storage.from("question-media").upload(img, buf, { upsert: true, contentType: type }), `upload ${img}`);
      }
      if (imgs.length) console.log(`  uploaded ${imgs.length} image(s)`);
    }
  }

  const inFile = new Set(qs.map((q) => q.id));
  const orphans = existing.map((r) => r.id).filter((id) => !inFile.has(id));
  console.log(`${p.id}: ${qs.length} in file, ${changed.length} new/changed, ${qs.length - changed.length} unchanged` +
    (orphans.length ? `, ${orphans.length} in DB but not in file (not deleted): ${orphans.join(", ")}` : ""));
}

await importTaxonomy();
for (const lp of toImport) await importPaper(lp.rel, lp.data);
console.log(DRY ? "\nDry run complete: nothing written." : "\nImport complete.");
