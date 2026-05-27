# Web Frontend — Foundation Slice — Design

**Date:** 2026-05-28
**Branch:** `feature/web-frontend` (worktree at `C:/Users/jerem/worktrees/bya-web-frontend`, branched off `feature/jerey-refactor`)
**Status:** Approved (design); pending implementation plan

## Context

The TypeScript backend rebuild (see `2026-05-28-typescript-backend-rebuild-design.md`) is
backend-first by design: the frontend (`apps/web`, Vite + React + TS) was deferred to a
later phase against the proven, typed API. We are now pulling the frontend forward and
building it **in parallel** with Plan 5 (Supabase persistence), which is actively running
on `feature/jerey-refactor`.

This is safe because `apps/web` is greenfield — zero file overlap with `apps/backend/` or
`supabase/`. The only shared seam is `packages/shared`, which is the API contract both
streams build against. The frontend branch rebases onto `feature/jerey-refactor` as the
Plan 5 agent advances it. (Rebase, never merge — per repo Git rules.)

The legacy frontend (`legacy/app.html`, `library.html`, `auth.js`, `styles/`) assembled
prompts client-side and called a thin `/chat` proxy. **All that orchestration now lives
server-side.** The new frontend is a thin, typed client over the clean endpoints
(`/api/extract`, `/api/brand`, `/api/ad-prompt`, `/api/render`, `/api/config`). We are not
re-porting `bya-pipeline.js` / `bya-prompts.js`.

## Scope of the overall frontend effort

Decomposed into four slices, each its own spec → plan. The **admin panel is dropped** —
backend run-scripts (`run-extract`/`brand`/`ad-prompt`/`render`) + gated tests cover
pipeline iteration. Persisted data is read **through backend API endpoints** (not direct
Supabase reads), so the read/list endpoints — which are not in the backend spec or Plan 5
yet — get their contracts defined in `packages/shared` now and implemented backend-side
later.

| Slice | Plan 5 dependency | Summary |
|---|---|---|
| **A. Foundation** (this doc) | none | scaffold, design system, auth + approval gate, typed API client, app shell + routing, dev proxy |
| B. Auth screens | none | login / signup / magic-link / password-reset / awaiting-approval |
| C. Workbench | none | extract → brand → ad-prompt → render against today's live endpoints |
| D. Home + Library + saved-brand reuse | yes | needs new read endpoints + signed URLs; reconciles with Plan 5 |

Recommended build order: **A → C → B → D**.

## Goal of this slice

Stand up `apps/web` as a runnable walking skeleton: a Vite + React + TS app that boots,
applies the ported design system, authenticates against Supabase, enforces the approval
gate, exposes a typed API client over `packages/shared`, and renders an app shell with
routing placeholders for the screens that later slices fill in. No customer screens are
built here beyond the auth-state shells (login placeholder, awaiting-approval, signed-in
shell).

## New dependencies (flagged)

`apps/web` adds, as the approved stack dictates: `react`, `react-dom`,
`react-router-dom`, `@supabase/supabase-js` (already a backend dep), `@bya/shared`
(workspace). Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`,
`@types/react-dom`, `vitest` + `@testing-library/react` + `jsdom` for the smoke test.

## Repository layout (additions)

```
apps/web/
  index.html              # Vite entry (fonts load via the ported tokens.css @import — no <link> needed)
  vite.config.ts          # @vitejs/plugin-react; dev proxy /api → http://localhost:3000
  tsconfig.json           # references packages/shared
  package.json            # @bya/web
  public/                 # favicon.svg, grain.svg, logo-mark.png (from legacy/assets)
  src/
    main.tsx              # imports styles, mounts <App/> in <AuthProvider>
    App.tsx               # router + AuthGate + app shell
    styles/
      tokens.css          # ported verbatim from legacy/styles/tokens.css
      app.css             # ported from legacy/styles/app.css (component classes reused as-is)
    auth/
      AuthProvider.tsx    # context: config fetch → supabase client → session + profile + status
      useAuth.ts          # hook exposing { status, session, userId, email, signOut, supabase }
    api/
      client.ts           # typed fetch over /api/*, attaches Bearer token, validates with @bya/shared
    shell/
      AppShell.tsx        # rail nav + topbar + <Outlet/> (uses ported .rail/.topbar classes)
      AuthGate.tsx        # routes by auth status: loading / signed-out / awaiting-approval / approved
```

## Design system port

Faithful port, minimal restyling:

- Copy `legacy/styles/tokens.css` → `apps/web/src/styles/tokens.css` **verbatim** (the
  cream/ink/blue variables, type scale, spacing, radii, motion).
- Copy `legacy/styles/app.css` → `apps/web/src/styles/app.css`; React components reuse the
  existing class names (`.btn`, `.stage`, `.input`, `.badge`, `.rail`, `.topbar`,
  `.dropzone`, etc.) so the look matches without rebuilding styles.
- Both imported once in `main.tsx`. Fonts (DM Sans + JetBrains Mono) load via the Google
  Fonts `@import` at the top of `tokens.css` — ported verbatim, so no separate `<link>` or
  font step is needed.
- Assets (`favicon.svg`, `grain.svg`, `logo-mark.png`) copied to `public/`.

CSS Modules / component-scoped styles are explicitly **not** adopted now — global ported
CSS is the lowest-risk faithful port. Revisit only if class collisions actually appear.

## Auth model (port of `auth.js` → React)

`AuthProvider` owns all auth state. On mount:

1. `GET /api/config` → `{ supabaseUrl, supabaseAnonKey }`.
2. Create the Supabase client (`persistSession: true`, `autoRefreshToken: true`).
3. Resolve initial session; subscribe to `onAuthStateChange`.
4. When a session exists, query `profiles` (RLS, anon key) for `{ approved, email, is_admin }`.

Derived status drives the gate:

```
type AuthStatus = 'loading' | 'signed-out' | 'awaiting-approval' | 'approved';
```

- `signed-out` → login screen (placeholder shell here; built in Slice B).
- `awaiting-approval` → "you're on the list" screen (ported from legacy, blocks the app).
- `approved` → app shell with routed screens.

`useAuth()` exposes `{ status, session, userId, email, signOut, supabase }`. Token access
for API calls lives in the API client (below), reading the current session — no separate
cached-token global.

The `is_admin` flag is read but unused (admin panel dropped).

## Typed API client (`api/client.ts`)

A single module — no per-endpoint files (only four POST endpoints + config). Each function
attaches `Authorization: Bearer <token>` from the live Supabase session, POSTs JSON to the
relevant `/api/*` path, parses the response, and validates it against the `@bya/shared`
zod schema for that endpoint:

- `getConfig()` → `{ supabaseUrl, supabaseAnonKey, ... }`
- `extract(url)` → `MeasuredSiteData`
- `brand(req)` → `{ id, brandExtraction }`
- `adPrompt(req)` → `{ id, adPrompt }`
- `render(req)` → `{ id, imageUrl }`

A typed `ApiError` is thrown for non-2xx, carrying the backend's
`{ error: { code, message, stage } }` body so screens can show stage-aware messages. Read
endpoints (brands list, ads library) are added to this module in Slice D against contracts
defined in `packages/shared`.

Images are sent as base64 in JSON (matches the backend contract); the Express body limit is
already raised to 25mb.

## App shell & routing

- `react-router-dom` with top-level routes: `/` (home) and `/library`. The Workbench
  generate flow is an in-app view/overlay over home (matching the legacy modal-driven
  flow), not a separate URL.
- `AuthGate` wraps the router: it short-circuits to the loading / signed-out /
  awaiting-approval screens, and only renders `AppShell` + routes when `approved`.
- `AppShell` ports the left **rail nav** (logo, nav items, user profile) and **topbar**
  using the existing classes, with an `<Outlet/>` for the routed screen.
- Foundation ships **placeholder route content** ("Home — built in Slice C/D", etc.); real
  screens land in later slices.

## Dev / build wiring

- `vite.config.ts` proxies `/api` → `http://localhost:3000` (backend default; it
  auto-increments if busy — dev assumes 3000). So `apiFetch('/api/...')` works in dev with
  no CORS and no base-URL config.
- Scripts: `dev` (vite), `build` (`tsc -b && vite build`), `preview`, `test` (vitest run).
- Production serving (backend serving built static assets vs. separate hosting) is **out of
  scope** for this slice — decided when the app is closer to shippable.

## Testing

This slice is a skeleton; testing is intentionally light:

- One Vitest + React Testing Library smoke test: `AuthGate` renders the correct shell for
  each `AuthStatus` (mock `useAuth`), and `AppShell` renders the rail + outlet when
  approved.
- The API client's token attachment + error mapping gets a focused unit test (mock
  `fetch` + a mock session).

Heavier per-screen testing comes with the slices that build real screens.

## Coordination with Plan 5 (parallelization)

- Frontend work happens only under `apps/web/` (+ later, additive read-endpoint contracts
  in `packages/shared`). No edits to `apps/backend/` or `supabase/`.
- Rebase `feature/web-frontend` onto `feature/jerey-refactor` as the Plan 5 agent advances
  it; resolve `packages/shared` as the contract seam. Push with `--force-with-lease`.
- Plan 5 renames tables (`brands → brand_extractions`, `ads → generated_ads`) and adds
  `ad_prompts`; Slice D targets the new names. Foundation is unaffected (no persistence).

## Out of scope (this slice)

- Any real customer screen (home, workbench, library) — placeholders only.
- Auth screen UI (login/signup/magic-link/reset) — Slice B.
- Read/list endpoints and their contracts — Slice D.
- Admin panel — dropped from the whole effort.
- Production static-serving strategy.
- CSS Modules / styling rearchitecture.
