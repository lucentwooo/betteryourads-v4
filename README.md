# BetterYourAds

Turn a website URL into on-brand ad creative through a 3-stage pipeline:

1. **Extract / Brand (Stage 1)** — headless Chromium (Playwright) reads exact colors,
   fonts, and text off the live page; an OpenRouter LLM turns that measured data into
   structured brand "DNA".
2. **Ad prompt (Stage 2)** — a vision model turns the brand DNA (+ optional user
   direction / product asset) into a structured image-generation prompt.
3. **Render (Stage 3)** — the prompt goes to KIE GPT-Image and the result is persisted to
   Supabase Storage.

## Layout

Monorepo (npm workspaces, Node ≥20):

- `apps/backend` (`@bya/backend`) — Express + TypeScript API. Routes under `/api/*`
  (`extract`, `brand`, `ad-prompt`, `render`, `config`), all gated by an approval check.
- `apps/web` (`@bya/web`) — React + Vite frontend. See `apps/web/README.md`.
- `packages/shared` (`@bya/shared`) — zod schemas shared by both.

## One-time setup

```powershell
npm install
npx playwright install chromium   # the backend needs the browser
```

Then copy `.env.example` to `.env` at the repo root and fill in your keys
(`OPENROUTER_API_KEY`, `STAGE1_MODEL` / `STAGE2_MODEL`, `KIE_API_KEY`, and the
`SUPABASE_*` keys). See the Supabase section below.

## Run

```powershell
# backend API (http://localhost:3000)
npm run dev -w @bya/backend

# web app (Vite dev server; proxies /api → http://localhost:3000)
npm run dev -w @bya/web
```

To run a single pipeline stage from the CLI:

```powershell
npm run run:extract -w @bya/backend     # also run:brand, run:ad-prompt, run:render
```

Tests: `npm test -w @bya/backend` and `npm test -w @bya/web`.

## Supabase setup

The app uses Supabase for auth, saved brand extractions, ad prompts, and an ad Library.

1. **Create the database structure.** In your Supabase dashboard, open **SQL Editor**,
   paste the contents of `supabase/schema.sql`, and click **Run**. This creates the
   `profiles`, `brand_extractions`, `ad_prompts`, and `generated_ads` tables plus the
   private `ads` storage bucket. (Safe to re-run.)
2. **Allow the login redirect.** Go to **Authentication → URL Configuration**. Set
   **Site URL** and add it to **Redirect URLs** (the web dev server's origin).
3. **Keys.** Ensure `.env` has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` (the service-role key is secret, server-only — it bypasses
   Row Level Security).

> Migrations live in `supabase/migrations/` and are applied by hand in the SQL Editor.
> `supabase/schema.sql` is the single paste-once script that creates the current end state.

### Approving a user

Anyone can sign in, but the app stays locked until you approve them:

1. Have the person sign in once (so their `profiles` row is created).
2. In the dashboard, open **Table Editor → `profiles`**, find their email, and set
   **`approved`** to `true`. They get access on their next page load.
