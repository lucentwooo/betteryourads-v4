# Spec #2 — Concept Board (legacy approach)

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Depends on:** Spec #1 (SSR foundation). **Status:** Design.

## Goal

Replace the current "5 strategic ad ideas" concepts feature with the **legacy concept-board
approach**: a board of 10–16 *distinct psychological angles* grouped by customer awareness stage,
weighted by a per-brand **goal** (waitlist / trials / paid), which the user browses and selects
from before creating ads. Move the concept prompt into the backend `prompts/` folder, persist
boards in the existing `ad_concept_sets` table, and rebuild the board UI verbatim to legacy.

## Decisions (locked)

- **Persist in DB** — reuse `ad_concept_sets` (no table migration; `concept_set` jsonb holds the
  new shape). Concepts follow the user across devices.
- **Adopt the goal step** — `goal ∈ {waitlist, trials, paid}` stored per brand; focuses 2
  awareness stages. Requires a **`goal` column on `brand_extractions`** (hand-applied migration).
- The board reads `goal`; if a brand has no goal yet, the board shows an inline goal picker (the
  full first-run onboarding goal step is Spec #3 — both write the same column).

## What gets scrapped (deleted)

- `apps/backend/src/routes/concepts.ts` (replaced)
- `apps/backend/src/pipelines/concepts.ts` (replaced)
- `apps/backend/src/prompts/ad-concepts.v1.ts` (`AD_CONCEPTS_V1` — replaced by the legacy prompt)
- `buildConceptContent()` in `apps/backend/src/prompts/registry.ts` (replaced)
- The current `ConceptSet` / `AdIdea` schema in `packages/shared/src/concept.ts` (replaced)
- The current concept step in `apps/web/src/workbench/Workbench.tsx` (the board becomes its own
  page; full workbench rebuild is Spec #3 — this spec removes only the obsolete concept-picking
  code paths it owns).

## Architecture

### Shared types — rewrite `packages/shared/src/concept.ts`

```
AwarenessStage = "unaware" | "problem" | "solution" | "product" | "most"
Goal           = "waitlist" | "trials" | "paid"

Concept     = { angle: string; stage: AwarenessStage; headline: string; rationale: string }
ConceptBoard = { goal: Goal; concepts: Concept[] }   // stored as ad_concept_sets.concept_set
```

Add shared metadata constants (single source of truth for backend prompt + web board):
- `STAGE_ORDER: AwarenessStage[]` = `["unaware","problem","solution","product","most"]`
- `STAGE_META: Record<AwarenessStage,{name,blurb}>` (legacy text verbatim)
- `GOAL_LABEL: Record<Goal,string>` = `{waitlist:"Grow a waitlist",trials:"Get signups / trials",paid:"Convert to paid"}`
- `GOAL_FOCUS: Record<Goal,AwarenessStage[]>` = `{waitlist:["problem","solution"],trials:["solution","product"],paid:["product","most"]}`

### Backend — generation (legacy logic, server-side)

- New `apps/backend/src/prompts/concept-board.v1.ts` exporting `CONCEPT_BOARD_V1` — the legacy
  `generateConcepts` prompt text (verbatim, parameterized by `goalLabel` + `focus` + the grounded
  `facts` object), producing `{ concepts: [{angle,stage,headline,rationale}] }`, 10–16 concepts.
- New `buildConceptBoardContent(analysis, goal)` in `registry.ts` — builds the `facts` object from
  the analysis (customer_voice, customer_dna, messaging, proof subset, competitors,
  claim_constraints, existing seeds) exactly as legacy, injects `goalLabel` + `GOAL_FOCUS[goal]`.
- Rewrite `pipelines/concepts.ts` `runConceptBoard({ analysis, goal })`: one `chat({stage:"concepts"})`
  call, parse `{concepts}` loosely, filter to items with `headline && angle`, coerce invalid
  `stage` → `"solution"`, validate with the new `ConceptBoard` zod schema; one repair retry on
  parse failure (mirror current retry).

### Backend — persistence & routes

- `saveConceptBoard({userId, brandExtractionId, board})` upserts `ad_concept_sets`
  (`concept_set = board`, keyed by user+brand). `getConceptBoard(brandExtractionId)` reads it.
- `setBrandGoal({userId, brandExtractionId, goal})` writes `brand_extractions.goal`.
- Routes (replace `routes/concepts.ts`):
  - `POST /api/concepts` — body `{ brandExtractionId, goal }`; loads the brand's analysis
    server-side, runs `runConceptBoard`, saves, returns `{ board }`. (Generation reads stored
    analysis — no brandExtraction sent from client, matching legacy "reuse, don't re-run Stage 1".)
  - `GET /api/concepts/:brandId` — returns the saved board (or 404 → client triggers POST).
  - `PATCH /api/brand/:id/goal` — body `{ goal }`; sets the brand goal.

### Backend — batch coupling rewrite

`batch.ts` items currently carry an `AdIdea` `concept` passed to `runAdPrompt` as `userDirection`.
Change the item `concept` type to the new `Concept` and serialize it into `userDirection` (angle +
headline + rationale as the creative direction). This keeps the batch pipeline intact with the new
concept shape. (The board→workbench→batch *UI* flow is rebuilt in Spec #3.)

### Migration (hand-applied)

`supabase/migrations/2026xxxx_brand_goal.sql`:
```sql
alter table public.brand_extractions
  add column if not exists goal text;
```
Idempotent; no backfill (null goal = "not chosen yet"). Recorded in manual-checks.

### Web — the concept board page

New `apps/web/app/board/[brandId]/page.tsx` + `apps/web/src/board/` components, replicating the
legacy board UX verbatim:
- Brand DNA panel (collapsible), goal intro text.
- Awareness-stage focus strip (5 stages; focus stages highlighted per `GOAL_FOCUS`).
- Concept sections grouped by `STAGE_ORDER`: focus stages expanded; off-focus collapsed behind
  "Show N more →" (expansion state in component state).
- Each concept: checkbox row (headline bold, angle + rationale muted); click toggles selection.
- Footer: "N concepts selected" + "next" (disabled at 0) → carries selected concepts to the
  workbench (consumed in Spec #3; for this spec, store selection + navigate to `/create`).
- "↻ regenerate" → re-POST `/api/concepts` (overwrites the saved board).
- Loading + empty + error states (legacy copy).
- If the brand has no `goal`: inline goal picker (3 cards) → `PATCH /api/brand/:id/goal` → generate.
- Data via the Spec #1 cache pattern where it fits (board fetched per brand; not part of the global
  brands/ads cache — a dedicated `useConceptBoard(brandId)` hook is acceptable here).

## Non-goals (later specs)

- Full onboarding flow + first-run goal step + back button (Spec #3).
- Workbench rebuild and the board→workbench asset flow (Spec #3).
- Per-brand logo on the board (Spec #5).
- Quota display (Spec #5).

## Testing

- Shared: `ConceptBoard` schema parse/coerce (invalid stage → "solution"; filters headline-less).
- Backend: `runConceptBoard` returns ≥1 concept on a valid model response; repair retry on bad
  JSON; `buildConceptBoardContent` includes `goalLabel` + focus stages + grounded facts; route
  validation (missing goal/brandId → 400). Mock `chat`.
- Web: board groups by stage; focus stages expanded, off-focus collapsed with "Show more";
  selection toggles; "next" disabled at 0; goal picker shows when goal is null. Mock the board hook.

## Acceptance criteria

1. `/api/concepts` generates a 10–16 concept board (angle/stage/headline/rationale), weighted to
   the goal's focus stages, grounded only in the brand's stored analysis; saved to `ad_concept_sets`.
2. `brand_extractions.goal` is settable and drives focus; migration SQL provided for hand-apply.
3. The board page replicates legacy grouping/selection/regenerate/goal-picker behavior.
4. The old concept code/prompt/schema are deleted; batch accepts the new `Concept` shape.
5. `npm test -w @bya/web` and `npm test -w @bya/backend` pass.

## Manual checks (for final MANUAL-CHECKS.md)

- **Migration:** run `2026xxxx_brand_goal.sql` in the Supabase SQL editor; verify with
  `select column_name from information_schema.columns where table_name='brand_extractions' and column_name='goal';`
- Confirm `STAGE3_MODEL` (concepts model) env is set on the backend.
- Click-through: pick a goal → board generates; regenerate overwrites; selection → next.
