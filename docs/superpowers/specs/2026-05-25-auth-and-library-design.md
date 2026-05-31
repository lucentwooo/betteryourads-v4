# Design: Customer Logins + Saved Brands & Ad Library

**Date:** 2026-05-25
**Branch:** `feature/auth-and-saving`
**Status:** Approved (user delegated final decisions)

## Goal

Add customer authentication and persistence to the existing OpenRouter Site Analyzer
(a 3-stage "website → on-brand ad image" tool). For the demo phase, gate access behind
manual approval; lay groundwork for real customers. Save each customer's brand analyses
and generated ads, with a dedicated Library page for browsing generated ads.

## Decisions (locked)

- **Auth method:** Magic link (passwordless email) via Supabase Auth.
- **Access model:** Anyone can request a login link. After login, the app is **gated** —
  users see a "pending approval" screen until an admin sets `approved = true`. Approval is
  done by flipping a checkbox in the Supabase dashboard (no in-app admin page yet).
- **Integration pattern (Option A + server enforcement):** Browser uses the Supabase JS
  client directly for auth and for reading/writing its own data, protected by Row-Level
  Security (RLS). The Express server additionally enforces login+approval on the
  cost-incurring endpoints so the gate cannot be bypassed by calling the API directly.
- **Persistence is split into three places:** `brands` table, `ads` table, and a private
  Storage bucket for image files.
- **Multiple brands per account** with a brand-switcher dropdown (covers the "test multiple
  brands" need; no separate admin/impersonation feature).
- **Images are copied off KIE** into Supabase Storage on Stage 3 success, because KIE URLs
  expire in ~24h (confirmed by existing UI note in `index.html`).

## Non-goals (YAGNI for now)

- No in-app admin/approvals UI (use Supabase dashboard).
- No passwords, OAuth/Google, or email/password login.
- No billing, teams/orgs, or sharing between users.
- No renaming/tagging of brands beyond an auto-derived name.
- No editing or re-generating past ads from the Library (view/download only).

## Architecture

### Components

1. **Supabase project** (already provisioned; keys in `.env`)
   - Auth (magic link), Postgres (tables + RLS), Storage (private `ads` bucket).

2. **`server.js`** (Express) — gains:
   - `@supabase/supabase-js` dependency; a service-role admin client.
   - Extended `GET /config` exposing `supabaseUrl` + `supabaseAnonKey` (both non-secret;
     anon key is browser-safe and protected by RLS).
   - `requireApprovedUser` middleware: reads `Authorization: Bearer <token>`, verifies it via
     `admin.auth.getUser(token)`, then checks `profiles.approved` for that user; 401 if no/bad
     token, 403 if not approved. Applied to `/extract`, `/chat`, `/kie/generate`,
     `/kie/result`, and the new `POST /library/ads`.
   - `POST /library/ads` (authenticated): accepts `{ imageUrl, brandId, websiteUrl, prompt,
     aspectRatio, resolution }`, downloads `imageUrl` server-side, uploads bytes to Storage at
     `<userId>/<adId>.png`, inserts an `ads` row (service role), returns the saved record.

3. **`public auth.js`** (new, served statically) — shared browser auth module exposing a
   global `Auth` object:
   - Loads `/config`, creates the Supabase browser client.
   - `Auth.guard()`: resolves with `{ session, profile }` only when an approved user is
     present; otherwise renders the login screen or pending-approval screen and keeps the app
     hidden. Used by both `index.html` and `library.html`.
   - `Auth.authedFetch(url, opts)`: wrapper attaching the bearer token to server calls.
   - `Auth.client`: the Supabase client (for direct brands reads/writes + storage signed URLs).
   - `Auth.signOut()`.

4. **`index.html`** (generator) — gains:
   - Login + pending-approval gate (via `Auth.guard()`), a header bar with the user's email,
     a Library link, and a Sign-out button.
   - A **brand switcher** dropdown populated from the user's `brands`; selecting one loads its
     saved analysis into the Stage 1 result so Stage 2/3 use it.
   - Stage 1 success auto-upserts a `brands` row (keyed by `user_id` + `website_url`).
   - Stage 3 success calls `POST /library/ads` to persist the image, then shows "Saved to
     Library ✓".
   - The four backend fetches (`/extract`, `/chat`, `/kie/generate`, `/kie/result`) switch to
     `Auth.authedFetch`.

5. **`library.html`** (new) — gallery behind the same gate. Lists the user's `ads` newest-first
   (grouped by brand/website), rendering each image via a Storage **signed URL** generated
   client-side, with date, source website, and a download link. Header links back to the
   generator.

### Data model (Postgres)

`profiles` (one row per auth user; auto-created by trigger on `auth.users` insert)
- `id uuid pk references auth.users(id) on delete cascade`
- `email text`
- `approved boolean not null default false`
- `is_admin boolean not null default false`
- `created_at timestamptz default now()`
- RLS: a user may `select` their own row. (Approval is edited via dashboard / service role.)

`brands`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`
- `name text` (auto-derived from website hostname)
- `website_url text not null`
- `analysis jsonb` (the merged Stage 1 brand-extraction JSON)
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- `unique (user_id, website_url)` (re-analyzing a site updates its row)
- RLS: user can `select/insert/update/delete` rows where `user_id = auth.uid()`.

`ads`
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `brand_id uuid references brands(id) on delete set null`
- `website_url text`
- `image_path text not null` (Storage key, e.g. `<userId>/<adId>.png`)
- `prompt text`, `aspect_ratio text`, `resolution text`
- `created_at timestamptz default now()`
- RLS: user can `select/delete` own rows. Inserts come from the server (service role), so an
  insert policy for end users is not required.

### Storage

- Private bucket `ads`. Path convention: `<userId>/<adId>.png`.
- Storage RLS policies: a user may `select` (read) objects under their own `<userId>/` prefix
  (needed to create signed URLs client-side). Uploads are performed by the service role.

### Auth gate flow (browser, on page load)

```
getSession()
  ├─ no session         → render Login screen (email field + "Send magic link")
  ├─ session, profile.approved == false → render "Pending approval" screen
  └─ session, approved  → reveal app; run page-specific init
onAuthStateChange re-runs the gate (handles magic-link return + sign-out).
```

Magic link uses `signInWithOtp({ email, options: { emailRedirectTo: <app origin> } })`.

### Server enforcement flow (per protected request)

```
read Bearer token → admin.auth.getUser(token)
  ├─ invalid/missing → 401
  └─ valid → read profiles.approved (service role)
        ├─ not approved → 403
        └─ approved → proceed to original handler
```

### Save-ad flow (Stage 3 success)

```
browser: POST /library/ads (authedFetch) { imageUrl(KIE), brandId, websiteUrl, prompt, aspect, resolution }
server : verify+approve → fetch(imageUrl) bytes → storage.upload(<uid>/<adId>.png)
         → insert ads row → return record
browser: show "Saved to Library ✓"
```

## Configuration & one-time setup (documented for a non-technical user)

1. Run `supabase/schema.sql` in the Supabase SQL editor (creates tables, trigger, RLS,
   bucket, and storage policies).
2. In Supabase Auth settings: set **Site URL** to `http://localhost:8787` and add it to the
   **Redirect URLs** allowlist.
3. Run the app with a fixed port (`PORT=8787`) so the magic-link redirect stays valid.
4. To approve a user: open the `profiles` table in the dashboard and tick `approved`.

`.env` already contains `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Error handling

- Missing/invalid token → 401; not approved → 403; the browser surfaces a friendly message
  and (for 401) re-shows the login screen.
- Magic-link send failure → inline error on the login screen.
- Brand upsert failure → non-fatal; Stage 1 result still shows, with a "couldn't save" note.
- Save-ad failure → the generated image still displays (with its temporary KIE link) and a
  "couldn't save to Library" warning; generation is never blocked by a save failure.
- Storage download/upload failure → 502 from `/library/ads` with a clear message.

## Testing

Manual verification (no automated suite exists in this repo):
- Logged-out user is blocked from the app and from calling `/chat` directly (401).
- Logged-in but unapproved user sees the pending screen and gets 403 from protected endpoints.
- Approved user completes Stages 1–3; a `brands` row and an `ads` row + stored image appear.
- Brand switcher loads a previously saved analysis.
- Library page shows the generated ad via a working signed URL after the KIE link would have
  expired.
- A second user cannot see the first user's brands or ads (RLS).

## Affected / new files

- `server.js` (edit), `package.json` (add dep)
- `auth.js` (new), `index.html` (edit), `library.html` (new)
- `supabase/schema.sql` (new), `README.md` (edit: setup steps), `.env.example` (already has keys)
