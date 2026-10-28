# Scanner Management System

Production build of the POC: Next.js 15 (App Router) on Vercel, Supabase (Postgres + Auth), optional Upstash Redis.

## Architecture

| Concern | Where it lives |
|---|---|
| Business rules (issue, return, bulk, damage/repair, status changes) | Postgres functions in `supabase/migrations/0001_init.sql`. Transactional, role-checked, audited. |
| "One active assignment per device" | Unique partial index. The database refuses a double-issue even under concurrent requests. |
| Bulk = all-or-nothing | One function call = one transaction. Any bad line rolls back the whole batch. |
| Authorisation | Roles stored in `profiles`. RLS gives read-only table access; every write goes through a function that checks the caller's role. UI hiding is cosmetic. |
| Audit log | Written by the same DB functions, in the same transaction as the change. Append-only (triggers block update/delete/truncate). |
| Login | Supabase Auth. Users type a **username**; it maps to `username@AUTH_EMAIL_DOMAIN` internally. |
| User admin | Server actions using the service-role key, after re-checking the caller is an active administrator. |
| Redis (Upstash) | Brute-force protection on sign-in (5 attempts / 15 min per IP+username, 30 per IP). Fails open if unset or down. |

Redis is deliberately **not** used for caching: dashboard numbers are cheap indexed queries and a handover tool should never show stale counts.

## Deploy

### 1. Supabase
1. Create a project (pick a region near your warehouse and, later, your Vercel functions).
2. SQL Editor → run `supabase/migrations/0001_init.sql`. (Or `supabase db push` with the CLI.)
3. *(Optional)* run `supabase/seed.sql` for the POC's demo devices/staff. Skip in production.
4. Authentication → Providers → Email: **disable "Allow new users to sign up"**, and set minimum password length to 8.
5. Settings → API: copy the project URL, `anon` key and `service_role` key.

### 2. Upstash Redis (recommended)
Create a Redis database (Vercel Marketplace → Upstash, or console.upstash.com). Copy the REST URL and token.

### 3. Vercel
1. Push this folder to a Git repo and import it in Vercel (framework: Next.js, no build overrides).
2. Add the environment variables from `.env.example` (all environments).
   - `SETUP_TOKEN`: any long random string. `/setup` is unusable without it.
   - `AUTH_EMAIL_DOMAIN`: a domain you control.
   - `SUPABASE_SERVICE_ROLE_KEY` must **not** be exposed to the browser (no `NEXT_PUBLIC_` prefix).
3. Deploy. Set the function region (Project Settings → Functions) to match your Supabase region.

### 4. First run
Open `https://your-app.vercel.app/setup`, enter the setup token and create the administrator. `/setup` redirects to login once any user exists; after that you can delete `SETUP_TOKEN`. Add staff, devices and other users from the app.

## Local development
```bash
cp .env.example .env.local   # fill in values (a free Supabase project works fine)
npm install
npm run typecheck
npm run dev
```

## Changes from the POC (on purpose)
- Passwords: Supabase Auth (bcrypt, sessions, refresh) instead of SHA-256 in the browser. Minimum length 8.
- "Today", overdue and report days use `APP_TIMEZONE` (default Europe/London) instead of UTC.
- Staff now have an employee number and shift (needed for the shift filters); picked from a searchable list.
- Added "Mark found" for Missing devices; closed damage reports can't be reopened; a device with an open assignment can't be retired.
- CSV exports are permission-checked server-side, audited, and neutralise spreadsheet formulas.
- Users menu is hidden for non-administrators; Audit is paged.

## Known limits / next steps
- Lists are capped (inventory 500 matches, reports 5,000 rows, audit paged by 100). Add pagination/virtualisation if you outgrow that.
- No bulk device/staff import yet (use the Supabase table editor's CSV import, or add a page).
- No tests included. Priority candidates: the SQL functions (pgTAP) and a Playwright smoke test of issue → return.
- Excel (.xlsx) export and Google Sheets from the POC's notes are not built; CSV only.
