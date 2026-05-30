# Overnight progress — SSR refactor

Running log of the autonomous run on `worktree/refactor/massive-refactor`. Newest first.
Full per-spec manual steps live in `docs/superpowers/manual-checks/`; they get aggregated into
`docs/superpowers/MANUAL-CHECKS.md` at the end (Spec #6).

## Status by spec
- **Spec #1 — SSR Foundation: ✅ DONE, reviewed, pushed.** Next.js App Router app, document from
  React (no index.html), hand-rolled stale-while-revalidate client cache, Home/Library on the
  cache, Vite SPA entry removed. 80 web tests pass; `next build` green. Code-review fix applied
  (`"use client"` on auth components).
- **Spec #2 — Concept Board: ✅ DONE (additive), reviewed, pushed.** New shared types + metadata,
  legacy concept prompt ported verbatim into `prompts/concept-board.v1.ts`, `runConceptBoard`
  pipeline, `/api/concept-board` routes + persistence + goal PATCH, web API client methods, and
  the `/board/[brandId]` page (legacy UX: goal picker, focus strip, grouping, selection,
  regenerate). 87 web + 183 backend tests pass; build green. Review: ship, no critical/high.
  Implemented ADDITIVELY (see roadmap "Implementation note") — old concept path stays until #3.
- **Spec #3 — Core UX: ✅ DONE, reviewed, pushed.** Cog→sign-out popover, onboarding (+Back),
  workbench rewired to be fed by the board (new `Concept` type; batch repointed), **old concept
  path deleted** (route/pipeline/prompt/`ConceptSet`/`AdIdea` gone, grep-clean), start modal +
  rail saved-brands + success toast. 116 web + 176 backend tests pass, build green. Review: no
  critical bugs; 2 medium onboarding fixes applied (in-flight race on Back, goal-save error
  handling) + toast timer fix. **Deferred:** library grouping→#5, react-router-dom dep removal→#6,
  full pixel-perfect legacy restyle (structurally faithful via the legacy class system; flag if
  you want a dedicated visual pass).
- **Spec #4 — Auth & accounts: ✅ DONE, reviewed, pushed.** Sign-up requires a matching re-enter
  password; the real admin accounts dashboard (approve/revoke/type-to-confirm delete/refresh) is
  wired into `/admin` (it was already react-router-free). 128 web tests pass, build green. Review:
  no critical; fixed the admin guard to not render while auth is unresolved. Auth-screen pixel
  restyle left as later polish.
- **Spec #5 — Quotas & per-brand: ⏳ pending.**
- **Spec #6 — Reference-ads bulk + cleanup + final MANUAL-CHECKS.md: ⏳ pending.**

## Manual items accumulated so far (for the owner)
- **Migration to hand-apply:** `supabase/migrations/20260530120000_brand_goal.sql` (goal column).
  See `manual-checks/spec-02-concept-board.md` for the verify query.
- **Env:** `BACKEND_ORIGIN` (web→backend proxy in non-local deploy); confirm `STAGE3_MODEL`.
- **Ports:** web (Next) on 3001, backend on 3000.
- Browser click-through smoke tests for Specs #1–#2 (listed in their manual-checks files) — not run
  by the autonomous build.

## Concerns / notes
- Spec #2 board "Next" stashes the selection and navigates to `/create` (still a stub) — the real
  handoff is wired in Spec #3.
- `ad_concept_sets` is shared by the old concept set and the new board during the transition
  (harmless; resolved when #3 removes the old path).
