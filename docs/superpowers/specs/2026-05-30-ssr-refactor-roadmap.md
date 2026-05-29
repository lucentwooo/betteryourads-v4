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

1. **SSR framework: Next.js (App Router).** `apps/web` is rebuilt as a Next.js app. This
   replaces the current Vite SPA tooling and `react-router-dom`.
2. **SSR depth: shell + cached client data.** Next renders the app *shell/chrome* (root
   layout + page chrome). Auth stays **client-side** (Supabase localStorage, Bearer token),
   so the interactive app lives in client components; per-page data is fetched on the
   **client** through a stale-while-revalidate cache — which is exactly how legacy achieves
   its "instant my ads" feel. We intentionally do **not** use Next server-component data
   fetching or cookie sessions. **Backend auth is unchanged.**
3. **Backend kept.** `apps/backend` stays a pure, separate Express API service. Pipelines,
   Playwright, KIE, OpenRouter, Supabase service-role logic, and the brand/ad-prompt prompts
   are preserved. The browser uses one origin: Next proxies `/api/*` to `apps/backend` via
   `next.config` rewrites. The one backend area that changes is the **concepts** feature
   (Spec #2) and admin reference-ads upload shape (Spec #6).
4. **Layout/document owned by Next.** No static `index.html`; Next's `app/layout.tsx`
   (RootLayout) owns `<html><head><body>`, `<head>`/meta live there.
5. **Routing via Next.** `react-router-dom` is removed; navigation uses `next/link` and
   `next/navigation`. Routes migrate to the `app/` directory.
6. **Client cache is hand-rolled.** No TanStack Query / SWR dependency (consistent with
   CLAUDE.md anti-dependency / anti-over-engineering rules; legacy proves a small store
   suffices). Implemented as a client-side context provider.
7. **Next.js is an accepted large dependency.** Chosen explicitly by the owner; it (and its
   required peers) is the one pre-authorized big add. Any *other* new dependency is still
   flagged before install per CLAUDE.md.

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
Stand up the Next.js (App Router) app in `apps/web`: `app/layout.tsx` (RootLayout owns the
document), a client `providers` wrapper (auth + cache), `next.config` with the `/api` proxy
rewrite, package scripts, and the hand-rolled client data cache (stale-while-revalidate).
Migrate the app shell + Home + Library off `react-router-dom` to Next routing and wire them to
the cache as the smoke test. No restyle, no auth-flow change, no concept work.
**Everything else depends on this.**

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

## Final deliverable — consolidated manual-checks doc

After the **entire program is complete** (all six specs done), produce one markdown file —
`docs/superpowers/MANUAL-CHECKS.md` — listing every manual step the owner should perform/verify
that cannot be (or wasn't) automated. **Not per spec — a single doc at the very end.** To make
it complete, each spec's plan records the manual checks it introduces (in a "Manual checks"
note); those are aggregated into this one file as the last task of Spec #6.

Expected contents (grows as specs land):
- **Supabase migrations** to paste into the dashboard SQL Editor, in filename order, with the
  verifying `information_schema` query for each.
- **Environment variables** to set/confirm (e.g. `GENERATION_TZ=Australia/Sydney`,
  `DAILY_GENERATION_LIMIT`, any Next.js env).
- **Click-through smoke tests**: signup with re-enter password → pending → admin approve;
  onboarding with the new back button; cog → sign-out popup; concept board → workbench →
  ship; library instant-load on revisit.
- **Behavior checks**: 10/day quota enforced and the remaining-count UI; quota reset at AEST
  midnight; "your brands" shows only that brand's ads vs "my ads" shows all; per-brand logo
  saved on the board and not re-asked in make-ad; admin bulk drag-drop reference-ads upload.
- **Cleanup confirmation**: list of removed files; confirm nothing referenced them.

## Execution protocol (overnight, autonomous)

Run the program unattended in spec order, **plan-then-execute per spec** (plans #2–6 are generated
from their committed specs against the real code the previous spec produced — not pre-written, to
avoid speculating against files that don't exist yet):

```
execute Plan #1
for spec in [2,3,4,5,6]:
    generate Plan #<spec> from Spec #<spec>   (writing-plans skill)
    execute it subagent-driven                (subagent-driven-development: fresh subagent/task, two-stage review)
    run /code-review on the spec's diff        (code-review skill) → fix findings → commit
finally: write docs/superpowers/MANUAL-CHECKS.md (aggregate per-spec manual-checks)
```

Rules for the unattended run:
- **Subagent-driven execution**, committing per task; tests must pass before moving on
  (verification-before-completion — evidence, not assertions).
- **`/code-review` after every spec's coding is complete**; address findings before the next spec.
- **Do NOT apply Supabase migrations** (owner applies by hand) and **do NOT run browser
  click-through smoke tests** — queue both into `MANUAL-CHECKS.md` instead. A spec whose feature
  needs an unapplied migration still gets its code + tests written; the live behavior is verified
  by the owner after applying the SQL.
- Proceed through tasks **without pausing for approval**; surface blockers in the morning summary
  rather than stopping the run.
- Stay on `worktree/refactor/massive-refactor`; never merge other branches in.

## Implementation note (discovered during execution, 2026-05-30)

Spec #2 and Spec #3 are entangled: the current `Workbench` (rebuilt in #3) consumes the OLD
concept types (`AdIdea`/`ConceptSet`) and drives `batch` with them, so #2 cannot delete the old
concept path without breaking the not-yet-rebuilt workbench. **Resolution: Spec #2 is ADDITIVE** —
it adds the new concept-board backend + board page alongside the old code (new route path
`/api/concept-board`, board persisted to `ad_concept_sets` with the `ConceptBoard` shape; reads
`safeParse` so an old-shaped row is treated as a miss → regenerate). **Spec #3 then rewires the
workbench to the board and DELETES the old concept path** (`routes/concepts.ts`,
`pipelines/concepts.ts`, `ad-concepts.v1.ts`, `buildConceptContent`, old `ConceptSet`/`AdIdea`).
The "scrap old concept code" items from Spec #2 move into Spec #3. End state is unchanged.

## Open items deferred to their specs

- Exact client cache module API surface — finalized in Spec #1.
- Whether the concept board stores logo per brand in `brand_assets` vs a new column —
  decided in Spec #5 (with a hand-applied migration if needed).
- Reference-ads schema change (drop required label) — decided in Spec #6.
