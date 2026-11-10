# UGC NET Prep Platform: Architecture

Stack: Next.js (App Router, TypeScript) + Tailwind, Supabase (Postgres, Auth, Storage), Recharts.

## 1. Data flow

```
PDF -> (your extraction tools) -> paper JSON -> GitHub repo
        -> CI: validate against data/schema/paper.schema.json + taxonomy ids
        -> import script (service role key): upsert into Postgres, images into Storage
        -> app reads via Supabase client
```

- One JSON file per paper/shift: `data/questions/<subject>/<paper-id>.json`.
- Taxonomy lives in `data/taxonomy/<subject>.json`. Topic ids are frozen once published; rename the label, never the id.
- The importer is idempotent: it upserts by `questions.id` and skips rows whose `content_hash` is unchanged. Re-running after fixing a JSON file is always safe.
- Images: `question-media/<paper-id>/<qid>-q.png`, `...-A.png`. The JSON stores only the path.

## 2. Repo layout

```
data/taxonomy/      geography.json, (paper1.json later)
data/schema/        paper.schema.json
data/questions/     geography/<paper-id>.json
supabase/migrations/0001_init.sql
scripts/            validate.ts, import.ts
src/app/            (auth) pyq test analysis stats bookmarks
src/components/     QuestionCard, TestShell, Palette, charts
src/lib/            supabase client, queries, scoring helpers
```

## 3. Key decisions

| Topic | Decision | Why |
|---|---|---|
| Question id | Own id `GEO-2025-JUN-S1-Q045`; NTA ids are not stored | Stable, human-readable, you control it |
| Answers | Separate private table `question_keys`; read only via RPC | Tests can't leak answers; one place for the paywall check |
| Option keys | A-D by position in the published paper; correct answer stored as a key | Matches how the paper reads |
| Duplicates across shifts | `canonical_id` points to first appearance | Trend stats count each question once |
| Multi-tag | One primary unit/topic (stats) + any number of secondary tags (browse) | Totals stay correct |
| Testable | `is_testable = false` for dropped/disputed keys | Never score a doubtful key |
| Scoring | Server-side in `submit_attempt`: +2 correct, 0 otherwise | Client can't be trusted |
| Timer | Server stores `deadline_at = start + n*72s`; client counts down to it | Refresh or device switch can't reset the clock |
| Auto-submit | Client submits at 0; server accepts autosaved data up to 30s past deadline | Handles slow connections without letting anyone extend time |
| Resume | Local persistence plus `save_responses` every ~15s | Survives crashes and device changes |
| Paywall | `profiles.plan` + check inside `reveal_answer` / `start_attempt` | No schema change needed later |

## 4. Test engine behavior

- Duration = questions x 72s, marks = questions x 2. Full 100-question paper = 120 min / 200 marks.
- Palette states: not visited, not answered, answered, marked, answered and marked.
- UI: question left, number pills right, previous/next/mark/clear at the bottom, timer on top.
- Answers and explanations are fetched only after submit, through `attempt_review`.
- Test selection: year, unit, topic or any combination. Selecting a unit includes questions whose secondary tags match.
- Test setup screen: rows per unit that expand into topics, each showing past attempts (count, best %, last %).

## 5. Analytics

Static (all users):
- Table: questions per unit and per topic per year (`stats_topic_year`), with a normalization toggle (count vs % of paper).
- Line charts per unit. Also: weightage %, hot and cold topics, never-asked topics, last year each topic appeared, priority score (frequency x recency), question-type split.

Personal (`my_topic_performance` view):
- Accuracy = correct / attempted. Score % = score / total marks. Time per question.
- Weak/strong labels only after at least 5 attempted questions in a topic.

## 6. Security

- RLS on every table. `question_keys` has no policy, so it is reachable only through security-definer functions.
- Service role key is used only in the import script / CI, never in the browser.
- Google OAuth and email/password through Supabase Auth; `profiles` row is created by trigger.

## 7. Build order

1. Supabase project, run migration, load taxonomy and a sample paper (done: files in this repo).
2. `scripts/validate.ts` and `scripts/import.ts`.
3. Auth + app shell (Next.js, Tailwind, mobile-first).
4. PYQ browser: filters, question card with tap-to-reveal, bookmarks, error reports.
5. Test engine, then test review and history.
6. Personal analytics, then static trend analytics.
7. Paper 1 taxonomy and tests, extra subjects, Hindi UI, paywall.
