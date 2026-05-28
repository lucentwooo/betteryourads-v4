# @bya/web — BetterYourAds frontend

Vite + React + TypeScript customer app. A thin, typed client over the backend's
`/api/*` endpoints — all ad-generation orchestration lives server-side in `@bya/backend`.

## Run (dev)

```bash
# from the repo root (links the workspace + @bya/shared)
npm install

# 1) start the backend (needs its own .env — Supabase service key, OpenRouter, KIE)
npm run dev --workspace @bya/backend     # http://localhost:3000

# 2) start the web app (Vite proxies /api → http://localhost:3000)
npm run dev --workspace @bya/web
```

```bash
npm run build --workspace @bya/web   # tsc --noEmit + vite build
npm test  --workspace @bya/web        # vitest (48 tests)
```

## What's built

- **Auth** — Supabase sign-in / sign-up / magic-link / forgot-password + password recovery,
  behind an **approval gate** (`profiles.approved`). Unapproved users see "you're on the list".
- **Workbench** (`/create`) — the single-ad flow: URL → analyze (extract + brand) → pick
  reference ad + logo (+ optional product image) → generate (ad-prompt + render) → preview &
  download.
- **Home** (`/`) — greeting, "make an ad" CTA, brand/ad counts, recent ads, saved-brand pills.
- **Library** (`/library`) — grid of generated ads (signed image URLs).
- **Saved-brand reuse** — a Home brand pill opens `/create?brandId=<id>`, which loads the saved
  brand and jumps straight to pick-ref (skips re-analysis).

## Owner steps before a real run

1. **Apply Plan 5 migrations:** `supabase db push` (the migrations under `supabase/migrations/`
   rename `brands→brand_extractions`, `ads→generated_ads`, add `ad_prompts`). The app's
   persistence-backed screens need the new schema.
2. **`.env`** at the repo root with `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `KIE_API_KEY` (backend reads these;
   `/api/config` exposes url + anon key to the browser).
3. **Approve a user:** set `profiles.approved = true` for your account, or you'll be held at the
   approval screen.

## Deferred (not built)

- **Angle variations / batch** — needs a backend multi-angle endpoint that doesn't exist yet
  (the future batch feature).
- **Admin panel** — backend run-scripts + tests cover pipeline iteration instead.
- **Library domain grouping, ad deletion, performance-tag editing, "ship to Meta."**

Slice specs/plans: `docs/superpowers/specs/2026-05-28-web-frontend-*` and
`docs/superpowers/plans/2026-05-28-web-frontend-*`.
