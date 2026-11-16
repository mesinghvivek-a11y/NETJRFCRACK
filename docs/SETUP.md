# Setup

## 1. Supabase project
1. Create a project at supabase.com.
2. SQL editor: run `supabase/migrations/0001_init.sql`, then `0002_storage.sql`.
3. Authentication > Providers > Google: enable it and paste the Client ID and Secret (create them in Google Cloud Console > APIs & Services > Credentials > OAuth client ID, type Web). In Google, add this authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Authentication > URL Configuration:
   - Site URL: your production URL (use `http://localhost:3000` while developing).
   - Redirect URLs: `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`.
5. Authentication > Email: keep "Confirm email" on for production. Turn it off in development if you want instant sign-up.

## 2. Environment
Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project settings > API)
- `SUPABASE_SERVICE_ROLE_KEY` is for the import script only. Never put it in a `NEXT_PUBLIC_` variable.

## 3. Run
```
npm install
npm run dev        # http://localhost:3000
```
Data scripts: see `scripts/` (`cd scripts && npm install && npm run validate`).

## 4. Deploy (Vercel)
Import the GitHub repo, set the two `NEXT_PUBLIC_` variables, deploy, then add the Vercel URL to the Supabase redirect URLs.

## 5. Admin portal (added)
1. Supabase SQL Editor: run `supabase/migrations/0004_admin.sql` once (after 0001, 0002 and 0003).
2. Make yourself admin (use the email you signed up with):
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR_EMAIL');
   ```
3. Reload the site. An **Admin** link appears (sidebar on desktop, top bar on phone and iPad portrait).
4. Add the new package: the repo's `package.json` now includes `read-excel-file`. Vercel installs it on the next deploy.
5. Import flow: Admin > Import Excel > choose the workbook > Save to review list > fix rows > Publish.
6. Images: Admin > Images, pick the paper and upload. Use the file name in the workbook's `image_file` column.
7. The database is now the source of truth. Do not use `scripts/import.ts` for new questions; use the portal.

## 6. New workbook format (version 2)
1. Supabase SQL Editor: run `supabase/migrations/0005_format.sql` once (after 0004).
2. Use `docs/UGC_NET_question_workbook_v2.xlsx`. Ids are built like 80-2025-JUN-E-045 (subject code, year, session, language, question number).
3. The older template and older ids (GEO-2025-JUN-S1-Q045) are no longer used.

## 7. Syllabus manager (added)
1. Supabase SQL Editor: run `supabase/migrations/0006_syllabus.sql` once (after 0005). It also loads the Geography syllabus (10 units, 160 topics), so uploads work straight away.
2. Admin > Syllabus lets you add a subject (name, NTA code, id prefix), load a ready-made syllabus (Geography or Paper 1) in one tap, edit units and topics, paste or upload a whole syllabus, and download the code list.
3. In the workbook, the primary_topic and extra_tags cells accept a code (geo-u04-t01), a topic name (Tides), a unit name, or Unit 4. Unknown names get a "Did you mean" hint.
4. Adding a new subject: add a row on the workbook's Lists sheet (subject id and NTA code) and use that id in the Papers sheet.

## 8. Tests, analysis and trends (added)
1. Supabase SQL Editor: run `supabase/migrations/0007_tests.sql` once (after 0006).
2. Tests: Tests page > choose years, units or topics > Start test. The exam screen is at /exam/<id> (no site menu, like NTA).
3. Each question is 72 seconds and 2 marks. The server owns the clock, answers save every 15 seconds and on this device, and the test submits itself when time runs out.
4. My analysis: score history and weak/strong topics (after 5 attempts in a topic). Trends: counts per unit and topic per year, built from published questions.

## 9. Exams as separate papers, filters, deleting (added)
1. Supabase SQL Editor: run `supabase/migrations/0008_exams.sql` once (after 0007). It renames existing papers to the new code rule and carries their questions, tags, bookmarks and tests with them.
2. Rule: one paper in a cycle = 80-2025-JUN-E; several = 80-2024-JUN-E-S1, -S2; re-exam adds -R. Admin > Papers shows every paper and has Fix paper codes.
3. Admin > Papers: delete a whole paper. Admin > Questions: select several, then Publish, Unpublish, Verify, Move to unit or topic, or Delete.
4. PYQs, Tests and Trends are per exam, with a subject selector.
