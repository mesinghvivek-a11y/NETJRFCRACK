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
