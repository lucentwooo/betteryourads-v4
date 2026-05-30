# Spec #7 — Legacy Parity Correction (UX/UX + missing pipelines)

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Depends on:** Specs #1–#6 (the SSR rebuild they corrected). **Status:** Design.

## Why this spec exists

The 6-spec SSR program aimed to reproduce the legacy app (`legacy/app.html` +
`legacy/bya-pipeline.js`) **verbatim** on Next.js + Express, but two kinds of drift were
discovered after Spec #6:

1. **Frontend chrome + home diverged from legacy.** The rail grew a non-legacy
   "Workspace" section header and an inline-SVG logo (legacy uses an `<img>` of
   `logo-mark.png`); the **Home screen shows a "recent ads" dashboard instead of the concept
   board** (legacy's `renderHome()` *is* the board). Spec #3's own design doc mis-described
   Home as a greeting hub, so the implementation faithfully built the wrong screen.
2. **One legacy pipeline was half-ported — `external_voc` dangles.** The board, Stage 1, and
   Stage 2 prompts made it across, but **`researchCustomers`** ("B2B SaaS market researcher",
   web-search VOC) did not. The concept-board grounding still *reads* `external_voc`
   (`registry.ts:127`) but nothing ever *writes* it, so every board silently runs with
   `customer_voice: "none collected"`.
   - **`generateAngles`** ("direct-response ad copywriter") is **not** a gap. Tracing
     `runPipeline` (`app.html:1144` batch vs `:1155` fallback) shows it is only the workbench
     **fallback** for "no concepts picked." Legacy's *primary* render path — render each selected
     concept — is already faithfully ported as the new per-concept `/batch`. In the board-first
     new IA that fallback has no trigger, so it is intentionally **not** ported (see Non-goals).

This spec corrects all of the above while **keeping every feature the program intentionally
added.**

## Goal

Bring the running app back to **legacy look + behavior**, on the existing Next.js + Express
stack, and restore the one missing legacy pipeline (VOC) — without removing the features built
in Specs #1–#6.

## Scope

### Part A — Frontend UX parity (the primary ask)

Audit each screen **side-by-side against `legacy/app.html`** and fix drift. Legacy is the
source of truth for layout, copy, and behavior. Known concrete divergences to fix:

- **Rail (`shell/AppShell.tsx`)**
  - Remove the `<h6>Workspace</h6>` section header — legacy's first nav section is headerless.
  - Replace the inline `<svg class="mark">` brand mark with `<img src="/logo-mark.png">`
    (asset already present in `apps/web/public/`), matching legacy `railHTML`.
  - Match legacy nav items/order/labels/icons: **home · make an ad · my ads · brands · add
    client**, then the **your brands** section, then the user footer card.
  - **Keep** the added admin section (gated to `admin@betteryourads.dev`) and the cog →
    sign-out popover — these are intentional Spec #3/#4 additions, restyled to sit in the
    legacy rail.
- **Home = concept board.** Home renders the legacy board (`renderHome`/`boardBodyHTML`):
  the "What should we make this week?" header, the **brand-DNA strip** (`brandDnaHTML`), the
  awareness-stage focus strip, concepts grouped by awareness stage (focus stages expanded,
  others collapsed behind "show N more"), multi-select, footer action, and ↻ regenerate.
  - The existing board logic lives at `/board/:brandId` (`board/Board.tsx`) — Home shows the
    **current/most-recent brand's** board; `/board/:brandId` stays for other saved brands.
  - **Supersede:** the current "recent ads" dashboard Home (`home/Home.tsx`). Its
    "recent ads / saved brands" content is already covered by **Library** — no feature lost.
  - If the user has no brand yet → onboarding gate (legacy `needsOnboarding`).
- **Brand-logo auto-capture (logo #2).** Verify/restore the legacy behavior where the user's
  **brand logo is auto-pulled from their extracted site** and shown with a "✓ from your site"
  state (legacy `deriveLogoFromUrls`), so the logo dropzone is pre-filled instead of empty.
- **Side-by-side sweep of the remaining screens** against legacy, fixing drift: onboarding,
  workbench, library, start modal, success toast, brand-DNA strip. The implementation plan
  produces the per-screen parity checklist; this spec sets the bar ("matches legacy").

### Part B — VOC research pipeline (`researchCustomers`) — fixes a live bug

There is a real bug in the current app: the concept board reads `external_voc` but nothing
produces it, so every board runs with empty customer voice. Port the legacy `researchCustomers`
pipeline to our backend and wire it so `external_voc` is actually produced and persisted —
fixing the bug by making the new app behave like legacy.

- New backend pipeline (e.g. `pipelines/customer-research.ts`) holding the legacy
  "B2B SaaS market researcher" prompt; one text-only `chat` call with the **web-search
  (`:online`) plugin on Stage 1** (mirrors legacy `stage: 1, online: true`).
- Input: the brand analysis's `external_customer_research_plan` + brand context; output: the
  compact VOC object (`top_complaints`, `recurring_phrases`, `desired_outcomes`, `objections`,
  `switching_triggers`, `competitor_gripes`, `sources`).
- **Trigger contract (must match legacy):** **lazy + once-per-brand + cached in DB.** Run after
  Stage 1, at brand creation / goal-save, **only if `external_voc` is absent** (legacy's
  `ensureResearch` no-ops when present); **persist `external_voc` on the brand-extraction
  record** so it is never re-run; the board reads it from there with no extra fetch. Best-effort:
  a failure leaves `"none collected"` (current behavior) and never blocks the board.

### Part C — Angle/color variations (`generateAngles`) — DROPPED

**Not ported in this spec.** It is legacy's workbench *fallback* for "no concepts picked," and
the board-first new IA has no entry point that reaches it (the workbench requires concepts from
the board). Legacy's primary render path is already covered by `/batch`, so dropping it removes
no reachable behavior. The capability ("take one finished ad → N recolored/reworded variants")
can return later as a **deliberate, reachable feature** (a "make variations" button on a
generated ad) in its own small spec; the legacy prompt (`bya-pipeline.js:292`) remains the
reference. Adding it now would mean building an unreachable path (against CLAUDE.md YAGNI).

### Keep (explicitly not removed)

Next.js + Express stack; admin dashboard + auth screens (Spec #4); multi-brand + Library
grouped by brand; **daily quotas + remaining-count UI** (Spec #5); per-brand saved logo
(Spec #5); bulk drag-drop reference-ads admin (Spec #6); the reference-ads **library picker**
in the workbench; the per-concept `/batch` flow.

## Non-goals

- No backend changes beyond Part B (the VOC pipeline + its wiring). Extract, brand, ad-prompt,
  render, batch internals are untouched.
- **Angle/color variations (`generateAngles`) are not ported** — fallback-only, unreachable in
  the board-first IA (see Part C).
- No new third-party dependencies (per CLAUDE.md). VOC reuses the existing OpenRouter
  `:online` path.
- No restyle of the design tokens — `tokens.css`/`app.css` already mirror legacy; add only the
  missing legacy component CSS needed for parity.

## Architecture notes

- **Home/board reuse:** factor the board view so Home and `/board/:brandId` render the same
  component with a different brand source (current brand vs route param) — no logic fork.
- **VOC persistence:** prefer storing `external_voc` on the existing brand-extraction record
  (where the rest of the analysis lives) so the board reads it with no extra fetch. If a
  column/shape change is needed, it's a **hand-applied** Supabase migration (owner pastes SQL;
  never `db push`) queued into MANUAL-CHECKS.
- **VOC pipeline** mirrors existing pipeline conventions (zod-validated I/O, `parseJsonLoose`,
  best-effort try/catch so a failure degrades to `"none collected"`).
- Heavy client interactivity stays in `"use client"` components; data via the existing
  stale-while-revalidate cache.

## Testing

- **Rail:** no "Workspace" header; logo is the PNG; legacy nav items present; admin section
  only for the admin email; cog popover still works.
- **Home:** renders the board for the current brand (not a recent-ads grid); empty-brand state
  routes to onboarding; `/board/:brandId` still renders other brands' boards.
- **Logo auto-capture:** extracted logo pre-fills the dropzone ("✓ from your site").
- **VOC:** pipeline returns the VOC shape; brand-save populates and persists `external_voc`
  **once** (re-running a brand with VOC present is a no-op); the board's `facts.customer_voice`
  is the VOC, not `"none collected"`; failure degrades to `"none collected"` without blocking.
- **Parity sweep:** per-screen checks added by the implementation plan.

## Acceptance criteria

1. Rail, Home, and the swept screens match legacy look/behavior; "Workspace" gone, PNG logo,
   Home is the concept board.
2. The brand logo auto-fills from the extracted site.
3. `external_voc` is populated by the ported VOC pipeline (lazy, once-per-brand, DB-cached) and
   grounds the board.
4. All Spec #1–#6 features still present and working (admin, quotas, multi-brand, bulk
   ref-ads, per-concept batch).
5. `npm run build -w @bya/web`, `npm test -w @bya/web`, and `npm test -w @bya/backend` pass.

## Deliverables (produced at the end of this spec's plan)

1. **Pipeline summary** — `docs/PIPELINE.md`: the end-to-end pipeline of the **new** app after
   this spec, in the flow + triggers-table format (step · prompt · trigger · frequency/caching ·
   model calls · which workspace). Reflects VOC restored and the angles fallback dropped.
2. **Manual checks** — `docs/superpowers/manual-checks/spec-07-legacy-parity.md`, aggregated into
   `docs/superpowers/MANUAL-CHECKS.md`: any Supabase migration SQL to paste into the dashboard
   (with its verifying `information_schema` query), env/config to confirm, and the click-through
   parity checks. **Migrations are applied by hand by the owner — never `db push`.**
3. **Cleanup list** — at the very end, remove files this spec makes unused (e.g. the superseded
   dashboard `home/Home.tsx` once Home renders the board) and list them, confirming nothing
   references them (grep + build clean).

## Manual checks (queued into the deliverable above)

- Side-by-side click-through of every screen vs `legacy/app.html`.
- Any Supabase migration for `external_voc` persistence (SQL to paste + verifying
  `information_schema` query).
- Confirm VOC `:online` web-search actually runs against the configured model (needs keys),
  and that re-opening a brand with VOC already present does **not** re-run it.
- Confirm logo auto-capture on a real site.
