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
