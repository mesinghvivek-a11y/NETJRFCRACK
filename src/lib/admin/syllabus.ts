// Helpers for the Syllabus editor: draft tree types, text/Excel parsing, merging, CSV export.

export interface DraftTopic { key: string; id?: string; name: string; is_legacy: boolean; used: number }
export interface DraftUnit { key: string; id?: string; number: number; name: string; topics: DraftTopic[]; used: number }
export interface ParsedUnit { number?: number; name: string; topics: string[] }

let counter = 0;
export const newKey = (): string => `k${Date.now().toString(36)}${(counter++).toString(36)}`;
const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Text format: a unit line looks like "Unit 4: Name" (or "# Name"); every other line is a topic.
 * Bullets and numbering in front of topics are ignored.
 */
export function parseSyllabusText(text: string): { units: ParsedUnit[]; errors: string[] } {
  const units: ParsedUnit[] = [];
  const errors: string[] = [];
  let cur: ParsedUnit | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const um = /^(?:unit|u)\s*(\d{1,2})\s*[:.\-)]\s*(.+)$/i.exec(line);
    const hm = /^#+\s*(.+)$/.exec(line);
    if (um) {
      cur = { number: Number(um[1]), name: um[2].trim(), topics: [] };
      units.push(cur);
      continue;
    }
    if (hm) {
      cur = { name: hm[1].trim(), topics: [] };
      units.push(cur);
      continue;
    }
    const topic = line.replace(/^[-*\u2022]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
    if (!topic) continue;
    if (!cur) { errors.push(`The topic "${topic}" comes before any unit line.`); continue; }
    cur.topics.push(topic);
  }
  return { units, errors };
}

/** Excel rows: either unit_number / unit_name / topic_name columns, or the workbook's Syllabus sheet (code, kind, unit, name). */
export function parseSyllabusRows(rows: (string | number | boolean | Date | null | undefined)[][]): { units: ParsedUnit[]; errors: string[] } {
  const errors: string[] = [];
  if (rows.length < 2) return { units: [], errors: ["The sheet has no rows."] };
  const head = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
  const col = (n: string): number => head.indexOf(n);
  const cell = (r: any[], i: number): string => (i < 0 || r[i] === null || r[i] === undefined ? "" : String(r[i]).trim());
  const units: ParsedUnit[] = [];

  if (col("topic_name") >= 0) {
    const un = col("unit_number"), uname = col("unit_name"), tn = col("topic_name");
    for (const r of rows.slice(1)) {
      const name = cell(r, uname);
      const topic = cell(r, tn);
      if (!name) continue;
      const number = cell(r, un) ? Number(cell(r, un)) : undefined;
      let u = units.find((x) => (number !== undefined && x.number === number) || norm(x.name) === norm(name));
      if (!u) { u = { number, name, topics: [] }; units.push(u); }
      if (topic) u.topics.push(topic);
    }
    return { units, errors };
  }
  if (col("kind") >= 0 && col("name") >= 0) {
    const code = col("code"), kind = col("kind"), unit = col("unit"), name = col("name");
    const byCode = new Map<string, ParsedUnit>();
    for (const r of rows.slice(1)) {
      const k = cell(r, kind).toLowerCase();
      if (k === "unit") {
        const label = cell(r, name);
        const m = /^unit\s*(\d+)\s*[:.\-]?\s*(.*)$/i.exec(label);
        const u: ParsedUnit = { number: m ? Number(m[1]) : undefined, name: (m ? m[2] : label).trim() || label, topics: [] };
        units.push(u);
        byCode.set(cell(r, code), u);
      }
    }
    for (const r of rows.slice(1)) {
      if (cell(r, kind).toLowerCase() !== "topic") continue;
      const u = byCode.get(cell(r, unit));
      if (!u) { errors.push(`Topic "${cell(r, name)}" refers to an unknown unit.`); continue; }
      u.topics.push(cell(r, name));
    }
    return { units, errors };
  }
  return { units: [], errors: ["Could not find the columns. Use unit_number, unit_name, topic_name (or the workbook's Syllabus sheet)."] };
}

export function mergeParsed(units: DraftUnit[], parsed: ParsedUnit[]): { units: DraftUnit[]; addedUnits: number; addedTopics: number } {
  const out: DraftUnit[] = units.map((u) => ({ ...u, topics: u.topics.map((t) => ({ ...t })) }));
  let addedUnits = 0;
  let addedTopics = 0;
  for (const p of parsed) {
    let u = out.find((x) => (p.number !== undefined && x.number === p.number) || norm(x.name) === norm(p.name));
    if (!u) {
      const taken = p.number !== undefined && out.some((x) => x.number === p.number);
      const number = p.number !== undefined && !taken ? p.number : Math.max(0, ...out.map((x) => x.number)) + 1;
      u = { key: newKey(), number, name: p.name, topics: [], used: 0 };
      out.push(u);
      addedUnits++;
    }
    for (const tn of p.topics) {
      if (!u.topics.some((t) => norm(t.name) === norm(tn))) {
        u.topics.push({ key: newKey(), name: tn, is_legacy: false, used: 0 });
        addedTopics++;
      }
    }
  }
  out.sort((a, b) => a.number - b.number);
  return { units: out, addedUnits, addedTopics };
}

export function toPayload(units: DraftUnit[]): any[] {
  return units.map((u) => ({
    id: u.id,
    number: u.number,
    name: u.name.trim(),
    topics: u.topics.map((t) => ({ id: t.id, name: t.name.trim(), is_legacy: t.is_legacy })),
  }));
}

export function toCsv(units: DraftUnit[]): string {
  const q = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  const lines: string[] = ["code,kind,unit,name"];
  for (const u of units) {
    if (!u.id) continue;
    lines.push([q(u.id), "unit", q(u.id), q(`Unit ${u.number}: ${u.name}`)].join(","));
    for (const t of u.topics) if (t.id) lines.push([q(t.id), "topic", q(u.id), q(t.name)].join(","));
  }
  return lines.join("\n");
}

/** A string that changes whenever anything the database cares about changes. */
export function fingerprint(units: DraftUnit[]): string {
  return JSON.stringify(units.map((u) => [u.id ?? u.key, u.number, u.name, u.topics.map((t) => [t.id ?? t.key, t.name, t.is_legacy])]));
}
