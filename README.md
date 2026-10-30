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
2. Apply the migrations in `supabase/migrations/` **in order** (`20260101000000_init.sql`, then `20260102000000_updates.sql`). Use `npx supabase db push` (the dashboard SQL editor rejects multi-statement files with "cannot insert multiple commands into a prepared statement").
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

## Update 2: transfers, Day/Night shifts, mobile dropdowns, admin-only delete

Migration `20260102000000_updates.sql` is **incremental and non-destructive**: new columns/tables only, no rows removed.
Old `Morning`/`Afternoon` transaction shifts are mapped to `Day`; the original value is kept in `transactions.legacy_shift`.
If you already applied the first migration, just run `npx supabase db push` again.

**Transfer / reassign** (`Bulk` page, and a *Transfer* button on every issued device)
- One database transaction: closes the holder's assignment as `end_type = 'transfer'` (not a return) and opens a linked one for the new holder.
- `transfers` table records original receiver, from, to, device, shift, operator, note, batch and timestamp; `transactions.origin_tx` always points to the very first issue, so "who originally received it / who holds it now" is always answerable.
- Per-device button, checkboxes, "select this handover" (by original batch) and "select all". The old holder immediately stops appearing as responsible.
- Reports/dashboard count transfers separately, never as returns.

**Shifts**: `Day Shift` / `Night Shift` toggle on issue, return, bulk and transfer; stored on every transaction (issue shift and return/transfer shift). Admins set the start times in **Settings**; forms pre-select the current shift. The report shift filter matches the *issue* shift.

**Delete / archive (administrator only, enforced in the database)**
- `delete_device`, `delete_staff`, `archive_device`, `set_staff_active` all require the Administrator role inside Postgres; tables have no direct DELETE grant. Hiding buttons is cosmetic.
- Delete is refused for anything with an active assignment or any history; those get **Archive** (devices, status Retired, hidden from pickers, history kept) or **Deactivate** (staff).
- A reason is required and is written to the audit log with the administrator and timestamp.

**Mobile**: searchable staff/device dropdowns (staff show employee ID; devices searchable by number, type, serial, notes; Issue lists show only Available devices). Bulk uses a multi-select with chips; scanning a code + Enter, or pasting a list, adds devices. Inputs/buttons are 44px on phones; tables scroll inside their own container, the page never scrolls sideways.

### Testing
Automated, SQL: `supabase/tests/scenarios.sql` runs your scenarios 1-7, 9 and 10 (10 devices bulk-issued, 3 then 7 transferred, history, shifts, non-admin refusals, admin delete/archive). It is one statement, rolls itself back, and finishes by raising `ALL 10 SCENARIOS PASSED`. Run it on a dev project, never production.

Manual (scenario 8, phones): on a real phone open Issue, Bulk and Transfer; check the dropdown opens under the field above the keyboard, typing filters, taps select, nothing scrolls sideways. Also try Safari on iOS and Chrome on Android.
