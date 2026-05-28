# Concepts → Batch Generation

**Date:** 2026-05-28
**Branch:** forked from `dev` (new feature branch)
**Status:** Approved design — pending spec review

## Goal

After a brand is analyzed, generate **5 strategic ad concepts** from the brand DNA
(one per customer awareness level), let the user **select one or more**, attach
**per-concept assets**, and **batch-generate** the selected concepts into rendered
ads. Each render runs as an independent background job item with live per-card
status. This adds a strategy step between brand analysis and rendering, and turns
the workbench from "one ad at a time" into "pick angles, generate a batch."

Concept generation is a pure text-reasoning task driven by the strategist prompt in
`AdSignal Files/context files/Concept Prompts.txt` (5 ideas across Pain / Problem /
Solution / Product / Outcome aware, plus a campaign summary, recommended top-3, and
next-step notes).

**Relationship to the earlier `2026-05-26-batch-angle-variations` spec:** that one
targets the legacy single-file `index.html` prototype (client-side batch off a base
ad_prompt, no server changes). This spec is a fresh, server-side implementation on
the TS stack (`apps/backend` + `apps/web` + `packages/shared`) and is the one we are
building. It is not a continuation of the legacy file.

## Flow (chosen: A)

```
Analyze brand (existing)
  -> POST /api/concepts (brand DNA -> ConceptSet)        [auto, after brand ready]
  -> Pick concepts (5 cards, multi-select, capped at remaining daily limit)
  -> Add assets PER concept (reference ad + logo required, product optional each)
  -> POST /api/batch (start job)  -> { batchId }
  -> poll GET /api/batch/:id      -> per-item status fills result cards
  -> Done: gallery, per-ad download, "start over"; ads also appear in Library
```

## Key decisions

- **Batch execution = job model + polling (option B).** `POST /api/batch` creates a
  job + item rows, starts an **in-process concurrency-capped worker pool (2–3 in
  flight)**, and returns a `batchId`. The UI polls `GET /api/batch/:id`. Chosen over
  a single long synchronous request because a 5-item batch runs several minutes and
  must survive a **client refresh / flaky connection**.
  - **Known v1 limitation:** the worker is in-process and holds the per-item asset
    images in memory, so a **server restart** mid-batch loses in-flight work. On
    boot we mark any `queued`/`running` item as `error` ("interrupted by restart").
    This is acceptable for current single-instance Render deploy; a durable queue is
    out of scope.
- **Per-concept assets (not shared).** Each selected concept gets its own reference
  ad + logo (required) + product (optional). A **"copy assets to all"** helper is
  included to reduce tedium.
- **Selection capped at the remaining daily limit (option A).** A batch of N
  selected concepts = N creatives. The pick-concepts UI hard-stops selection at the
  user's remaining count and shows "X of Y left today" throughout. The batch route
  re-validates `items.length <= remaining` server-side (the UI cap is not trusted).
- **Concept model = new `STAGE3_MODEL` env var**, set to
  `deepseek/deepseek-v4-flash`. (New env var — flagged and approved.)
- **Concept feeds Stage 2 via the existing `userDirection` channel.** Each batch
  item passes its selected concept (serialized angle/hook/visual_direction) into the
  existing `runAdPrompt` `userDirection` field, so **no change to the AdPrompt
  schema or Stage-2 prompt** is needed. The worker then runs the existing
  `runAdPrompt` -> `runRender` -> `persistRenderedAd` chain per item.
- **Daily-limit counting is automatic.** `persistRenderedAd` inserts a
  `generated_ads` row per finished render, and `countAdsToday` counts those rows —
  so each batch item naturally counts against the cap with no separate accounting.

## Shared schemas (`packages/shared/src/concept.ts`, new)

New file — a new shared contract parallel to `ad-prompt.ts`. zod schemas mirroring
the strategist JSON, exported from `index.ts`:

- `CampaignStrategySummary` — brand_name, product_name, category, primary_customer,
  primary_problem, primary_outcome, main_positioning, strongest_ad_opportunity,
  main_claim_constraints[], tone_to_use, tone_to_avoid.
- `AdIdea` — the 14-field idea object (idea_number, awareness_level, idea_name,
  core_angle, customer_context, customer_pain_or_desire, customer_insight,
  belief_to_shift, main_hook, supporting_message, cta, why_this_could_work,
  proof_or_reason_to_believe, safe_claims_used[], claims_to_avoid[],
  visual_direction_for_later, brand_dna_fields_used[]).
- `ConceptSet` — `campaign_strategy_summary` + `ad_ideas` (array) +
  `recommended_top_3` + `next_step_recommendations`.

Be lenient where the model is unreliable: `awareness_level` is a free string (we
don't reject on it), arrays default to `[]`. We require `ad_ideas` to be a non-empty
array and each idea to have at least `idea_name`, `main_hook`, `cta`.

## Backend — concept generation

- **`apps/backend/src/prompts/ad-concepts.v1.ts`** (new) — the strategist prompt
  text from `Concept Prompts.txt`, plus a `buildConceptContent(brandExtraction)`
  that appends the brand DNA JSON. Registered in `prompts/registry.ts`.
- **`apps/backend/src/config/index.ts`** — add `stage3Model: env.STAGE3_MODEL ?? ""`
  to `AppConfig` / `loadConfig`. Add `STAGE3_MODEL=deepseek/deepseek-v4-flash` to
  `.env.example`.
- **`apps/backend/src/pipelines/concepts.ts`** (new) — `runConcepts({ brandExtraction })`:
  one `chat({ model: stage3Model, stage: "concepts" })` call with the strategist
  prompt; `parseJsonLoose` -> `ConceptSet.safeParse`; one repair retry on invalid
  JSON (mirror `ad-prompt.ts`); throw `ValidationError` on a second failure.
- **`apps/backend/src/routes/concepts.ts`** (new) — `POST /api/concepts`
  `{ brandExtraction, brandExtractionId? }` -> runs the pipeline, persists via
  `saveConceptSet`, returns `{ id, conceptSet }`. Gated by `requireApprovedUser`.
  Mounted in `server.ts`.

## Backend — batch jobs

New supabase helpers in `services/supabase.ts`:

- `saveConceptSet({ userId, brandExtractionId, conceptSet, model })` -> `{ id }`
  (upsert on `(user_id, brand_extraction_id)` so re-running a brand replaces its set).
- `getConceptSet(brandExtractionId, userId)` -> `ConceptSet | null`.
- `createBatch({ userId, brandExtractionId, items })` -> `{ batchId }` — inserts a
  `batch_jobs` row (`status='running'`, `total=items.length`) plus one `batch_items`
  row per concept (`status='queued'`, `idea_number`, `idea_name`).
- `updateBatchItem(itemId, patch)` — set status / `generated_ad_id` / `error`.
- `finalizeBatchIfDone(batchId)` — when no item is `queued`/`running`, set
  `batch_jobs.status` to `done` (or `error` if all failed).
- `getBatch(batchId, userId)` -> job + items; for each `done` item, sign the linked
  `generated_ads.image_path` (reuse the existing signed-URL pattern) to return
  `imageUrl`.
- `markStaleBatchItems()` — on server boot, set lingering `queued`/`running` items
  (and their jobs) to `error`.

Routes (new `routes/batch.ts`, mounted in `server.ts`, `requireApprovedUser`):

- **`POST /api/batch`** `{ brandExtractionId, items: [{ concept, referenceAdImage,
  logoImage, productAsset? }] }`:
  1. Validate non-empty `items`; each has `referenceAdImage` + `logoImage`.
  2. Enforce limit: non-admins, `countAdsToday(userId) + items.length <=
     DAILY_CREATIVE_LIMIT`, else `RateLimitError`.
  3. `createBatch(...)` -> `batchId`.
  4. Start the worker (fire-and-forget) holding the asset images in memory; return
     `{ batchId }` immediately.
- **`GET /api/batch/:id`** -> `{ id, status, items: [{ id, ideaNumber, ideaName,
  status, imageUrl?, error? }] }` for polling.

Worker (`services/batch-worker.ts`, new — small in-process module):

- Concurrency pool, max 3 in flight, over the batch items.
- Per item: `runAdPrompt({ brandExtraction, referenceAdImage, logoImage,
  productAsset, userDirection: <serialized concept> })` -> `saveAdPrompt` ->
  `runRender` -> `persistRenderedAd` -> `updateBatchItem(done, generated_ad_id)`.
  On throw: `updateBatchItem(error, message)` (one item's failure never sinks the
  batch — `Promise.allSettled`-style isolation).
- After all settle: `finalizeBatchIfDone`.
- `markStaleBatchItems()` called once from `server.ts` on startup.

## Migration (`supabase/migrations/<ts>_concepts_and_batches.sql`, new)

Applied by hand (paste into Supabase SQL Editor — per project rule, no CLI).
Idempotent (`create table if not exists`, `drop policy if exists` then `create`).
RLS `own` policies matching the `ad_prompts` pattern. Asset images are **not**
stored (held in memory by the worker); tables store status + links only.

- `ad_concept_sets` — id, user_id (fk auth.users cascade), brand_extraction_id (fk
  brand_extractions cascade), concept_set jsonb, model text, created_at, updated_at;
  unique `(user_id, brand_extraction_id)`.
- `batch_jobs` — id, user_id (fk cascade), brand_extraction_id (fk set null),
  status text check in (queued|running|done|error), total int, created_at.
- `batch_items` — id, batch_id (fk batch_jobs cascade), user_id (fk cascade),
  idea_number int, idea_name text, status text check in (queued|running|done|error),
  generated_ad_id (fk generated_ads set null), error text, created_at.

## Frontend (`apps/web`)

- **`api/client.ts`** — add `concepts({ brandExtraction, brandExtractionId })`,
  `startBatch({ brandExtractionId, items })`, `getBatch(batchId)`; reuse `ApiError`.
- **`workbench/state.ts`** — extend the reducer with new stages:
  `concepts-loading`, `pick-concepts`, `pick-assets`, `batch-running`, `batch-done`,
  and state for `conceptSet`, `selectedIdeaNumbers`, per-concept asset map, `batchId`,
  and polled item statuses. Keep the existing single-ad path intact only if needed;
  otherwise the brand-analyzed transition now leads into the concept flow.
- **`workbench/Workbench.tsx`** — after `ANALYZED`, auto-call `api.concepts(...)`.
  New stage views:
  - **Pick concepts:** 5 selectable cards (UI/UX styled), each showing awareness
    badge, idea_name, main_hook, cta, why_this_could_work, visual_direction;
    `recommended_top_3` highlighted. Multi-select toggle, hard-capped at remaining
    daily limit; persistent "X of Y left today".
  - **Add assets per concept:** one section per selected concept with three dropzones
    (reuse `Dropzone`); "copy assets to all" helper; "Make my ads (N)" disabled until
    every selected concept has its required reference + logo.
  - **Batch running:** grid, one card per concept, each spinner -> image / error,
    polling `getBatch` until job `status` is `done`/`error`.
  - **Done:** gallery with per-ad download + "start over". Ads also appear in Library
    (persisted by `persistRenderedAd`, no extra work).
- **Styling:** apply the `ui-ux-pro-max` skill for the concept cards and batch grid,
  consistent with existing `styles/tokens.css` + `app.css` "stage"/"card" aesthetic.

## Docs

- Add one-line entries to `docs/FEATURES.md` (per the updated CLAUDE.md rule) for the
  concept stage and batch generation.

## Out of scope (v1)

- Durable/queue-backed jobs surviving a server restart.
- Editing concept fields in the UI before generating (concepts are read-only picks).
- Regenerating a single concept set item, or re-rolling concepts.
- Multiple asset *formats* / aspect-ratio variation per concept.

## Testing

- **shared:** `concept.ts` schema parse tests (valid set; lenient/missing fields).
- **backend (vitest):** concepts pipeline parse+repair (mock `chat`); batch route
  limit enforcement (mock supabase); worker item isolation (one item throws, others
  still complete + finalize). E2E render/concept calls stay gated/skipped without keys.
- **web:** reducer transitions through the new stages; selection cap logic; "make my
  ads" enablement; polling fill of result cards (mock `api`).
- **manual:** analyze a real brand, confirm 5 distinct concepts, pick 2–3, attach
  assets, batch-generate, watch cards fill, confirm downloads + Library entries.
