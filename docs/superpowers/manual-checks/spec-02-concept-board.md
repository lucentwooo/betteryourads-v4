# Manual checks — Spec #2 (Concept Board)

## Schema / migrations (HAND-APPLY)
- **`supabase/migrations/20260530120000_brand_goal.sql`** — adds `goal text` to `brand_extractions`.
  Paste into the Supabase SQL Editor and run. Verify:
  ```sql
  select column_name from information_schema.columns
  where table_name='brand_extractions' and column_name='goal';
  ```
  Until applied, `PATCH /api/brand/:id/goal` and the board's goal persistence will error.

## Environment variables
- **`STAGE3_MODEL`** — the model used to generate the concept board (same var the old concepts
  flow used). Confirm it's set on the backend.

## Known transient (by design; resolved in Spec #3)
- The new concept board and the OLD concept set both persist to `ad_concept_sets`
  (unique `user_id,brand_extraction_id`). Generating a board overwrites any old concept set for
  that brand. This is harmless — reads use `safeParse` and treat a shape mismatch as a miss
  (regenerate) — and goes away when Spec #3 deletes the old concept path.

## Click-through smoke (verify manually)
- Visit `/board/<brandId>` for a saved brand with no board → goal picker (3 cards) appears.
- Pick a goal → a 10–16 concept board generates, grouped by awareness stage; the two focus stages
  for that goal are expanded, off-focus stages collapsed behind "Show N more".
- Select concepts → "Next" enables; clicking it stashes the selection (sessionStorage) and
  navigates to `/create`. **The workbench handoff itself is completed in Spec #3** (today `/create`
  is still the stub).
- "Regenerate" redraws the board for the same goal.

## Not done in this spec (Spec #3)
- Workbench rewiring to consume the board selection; deletion of the old concept path
  (`routes/concepts.ts`, `pipelines/concepts.ts`, `ad-concepts.v1.ts`, old `ConceptSet`/`AdIdea`).
