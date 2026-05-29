# SSR Refactor — Program Roadmap

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor` (worktree at `C:\Users\jerem\worktrees\bya-massive-refactor`)
**Status:** Roadmap approved; Spec #1 in detail (see companion doc).

## Context

BetterYourAds turns a website URL into on-brand ad creative via a 3-stage pipeline
(extract/brand → ad-prompt → render). The current rebuild is a Vite **SPA** (`apps/web`)
on a TypeScript Express **API backend** (`apps/backend`). A legacy single-file prototype
(`legacy/app.html` + `server.js`) has UX the owner prefers.

This program rebuilds the frontend as **SSR**, adopts the legacy concept-board approach,
replicates the legacy UI/UX verbatim, and folds in a set of targeted improvements — while
**keeping the existing Express backend essentially untouched**.

## Cross-cutting decisions (apply to every spec)

1. **SSR approach: Vite SSR + Express (manual).** No Next.js / React Router framework mode.
   We use Vite's SSR build with a hand-written render server.
2. **SSR depth: shell + cached client data.** The server renders the app *shell/chrome*
   only. Auth stays client-side (Supabase localStorage, Bearer token). Per-page data is
   fetched on the **client** through a stale-while-revalidate cache — which is exactly how
   legacy achieves its "instant my ads" feel. **Backend auth is unchanged.**
3. **Backend kept.** `apps/backend` stays a pure API service. Pipelines, Playwright, KIE,
   OpenRouter, Supabase service-role logic, and the brand/ad-prompt prompts are preserved.
   The one backend area that changes is the **concepts** feature (Spec #2) and admin
   reference-ads upload shape (Spec #6).
4. **Document rendered from React.** No static `index.html`; a `Document` component owns
   `<html><head><body>`. Vite dev HMR scripts are injected by `server.ts` in dev only.
5. **Client cache is hand-rolled.** No TanStack Query / SWR dependency (consistent with
   CLAUDE.md anti-dependency / anti-over-engineering rules; legacy proves a small store
   suffices).
6. **SSR server lives in `apps/web`** (`apps/web/server.ts`), separate from the API backend,
   and proxies `/api/*` to `apps/backend` so the browser sees one origin.

## Project constraints (from CLAUDE.md)

- Scope discipline: do exactly what each spec defines; no drive-by refactors.
- Prompts live in `apps/backend/src/prompts/`; keep `docs/FEATURES.md` in sync.
- Branches are independent lines; **rebase, never merge**; tag `merged/<branch>` at
  integration time.
- Supabase migrations are applied **by hand** (owner pastes SQL into the dashboard); never
  `supabase db push`. New migration files go in `supabase/migrations/` with a timestamp prefix.
- Admin identity: `admin@betteryourads.dev`.

## Decomposition — 6 specs, in order

Each spec gets its own design doc, implementation plan, and `/code-review` before it's
considered done. Later specs depend on earlier ones as noted.

### Spec #1 — SSR Foundation *(detailed; companion doc)*
Stand up Vite SSR: `Document` + `entry-server` + `entry-client`, `server.ts` (dev Vite
middleware / prod static+SSR), `vite.config` SSR build, package scripts, and the hand-rolled
client data cache (stale-while-revalidate). Home + Library wired to the cache as the smoke
test. No restyle, no auth change, no concept work. **Everything else depends on this.**

### Spec #2 — Concept board (legacy approach)
Scrap the current `/api/concepts` + `ad-concepts.v1` prompt + concept-driven batch flow.
Port the legacy concept-generation approach into the backend; move the legacy concept
prompt(s) from `bya-prompts.js` into `apps/backend/src/prompts/` (renamed to the project's
convention). Rebuild the concept-board UI verbatim (awareness-stage grouping, selection,
regenerate). Depends on #1.

### Spec #3 — Core UX replication (legacy, verbatim)
Onboarding (**+ back button** during add-client), home/board, workbench (3-stage), library
with **stale-while-revalidate**, rail, start modal, and **cog → sign-out popup** (make
sign-out discoverable). Match legacy look/behavior verbatim; may use `ui-ux-pro-max` only as
needed to hit fidelity. Depends on #1, #2.

### Spec #4 — Auth & accounts
Signup with **re-enter password** confirmation, recovery, pending-approval screen, and the
**admin accounts dashboard** (kept from current app, restyled to legacy: approve/revoke/
delete). Admin = `admin@betteryourads.dev`. Depends on #1, #3.

### Spec #5 — Quotas & per-brand behavior
**10 creatives/day per user, reset at AEST (Australia/Sydney) midnight**, with a
remaining-count UI for normal users. **"Your brands" shows only the selected brand's ads;
"My ads" shows all.** **Brand logo uploaded once on the concept-board page and saved per
brand**, so it isn't re-uploaded on the make-ad page. Depends on #1, #2, #3.

### Spec #6 — Admin reference ads + cleanup
Admin reference-ads upload becomes **bulk drag-drop, no per-file label** (drop N files → all
upload). Then **remove all now-unused files** across the project (old concept code, dead SPA
files, legacy artifacts no longer referenced). Depends on all prior specs.

## Open items deferred to their specs

- Exact client cache module API surface — finalized in Spec #1.
- Whether the concept board stores logo per brand in `brand_assets` vs a new column —
  decided in Spec #5 (with a hand-applied migration if needed).
- Reference-ads schema change (drop required label) — decided in Spec #6.
