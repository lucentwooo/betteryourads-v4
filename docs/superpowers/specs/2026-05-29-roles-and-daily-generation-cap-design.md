# Roles & Daily Generation Cap — Design

**Date:** 2026-05-29

## Goal

Introduce two roles — `admin` and `user` — configured **only** in the database.
Normal users may generate at most **10 creatives per day**; admins are unlimited.
The daily window resets at midnight in `Australia/Sydney` time (AEST/AEDT).

## Roles (no schema change)

`profiles.is_admin` (boolean, already in `supabase/schema.sql`) is the role.

- `is_admin = true`  → admin, exempt from the cap.
- `is_admin = false` → normal user, subject to the daily cap.

Roles are set by editing the DB directly, e.g.:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

There is no UI for changing roles, by design.

## New table: `generations` (usage log)

One row per **successful** generation, so usage can be counted per day regardless
of whether the result was later saved as an ad.

```sql
create table if not exists public.generations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at);

alter table public.generations enable row level security;
drop policy if exists "own generations read" on public.generations;
create policy "own generations read" on public.generations
  for select using (auth.uid() = user_id);
```

- Rows are **inserted by the server** (service role, bypasses RLS).
- The read policy lets the browser read its own rows if ever needed; enforcement
  does not depend on it.
- Added idempotently to `supabase/schema.sql`.

## Day boundary

The "day" is the calendar day in `Australia/Sydney`. To count today's generations,
the server computes the UTC instant of the most recent local midnight in that
timezone (DST-aware), then counts `generations` rows with `created_at >= thatInstant`.

- Implemented with `Intl.DateTimeFormat` using `timeZone: 'Australia/Sydney'`
  (no extra dependency) to derive the local Y-M-D, then resolve that local
  midnight back to a UTC `Date`.
- Timezone is configurable via env `GENERATION_TZ` (default `Australia/Sydney`).

## Enforcement — `/kie/generate`

This is the cost-incurring endpoint and the correct gate.

1. Extend `requireApprovedUser` to also select `is_admin` from `profiles`
   (currently selects only `approved`). Attach it as `req.profile = { is_admin }`.
2. At the top of `/kie/generate`, **before** spending money on an image:
   - If `req.profile.is_admin` → skip the check.
   - Else count this user's `generations` rows since local midnight (Sydney).
     If `count >= DAILY_GENERATION_LIMIT` → respond `429` with
     `{ error: "Daily limit of 10 reached. It resets at midnight (AEST)." }`.
3. On a **successful** generation, insert one `generations` row:
   - OpenRouter backend (synchronous): after the image URLs are returned.
   - KIE backend (async): after the task is created successfully (taskId obtained).

A KIE task that is created but later fails at poll time still counts as one
generation. This is an accepted trade-off: enforcing/recording at poll time would
require deduping across the many `/kie/result` polls per task. The project's
default backend (`IMAGE_BACKEND=openrouter`) is synchronous, where "success =
image returned" is exact.

## New endpoint — `GET /usage`

Lets the app show remaining quota (e.g. "7 of 10 used today").

- Gated by `requireApprovedUser`.
- Returns `{ used, limit, isAdmin }` where `used` is today's count (Sydney day),
  `limit` is `DAILY_GENERATION_LIMIT`, and `isAdmin` is `req.profile.is_admin`.
- Admins: `isAdmin: true`; the app can show "Unlimited".

## Config

- `DAILY_GENERATION_LIMIT` — integer, default `10`.
- `GENERATION_TZ` — IANA timezone, default `Australia/Sydney`.
- Both added to `.env.example` with comments.

## Out of scope

- No UI for assigning roles (DB-only, as required).
- No backfill of the `generations` table from existing `ads` rows; the cap begins
  counting from deployment.
- No change to the `ads` table or the save flow.

## Files touched

- `supabase/schema.sql` — add `generations` table + RLS.
- `server.js` — extend `requireApprovedUser`; add daily-limit check + recording in
  `/kie/generate`; add `/usage`; add a `startOfSydneyDay()` helper and limit const.
- `.env.example` — document `DAILY_GENERATION_LIMIT` and `GENERATION_TZ`.
- Optionally `app.html` — surface remaining quota via `/usage` (can be a follow-up).
