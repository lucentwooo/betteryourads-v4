# Backend — how it works (routes, pipelines, triggers)

`apps/backend` (`@bya/backend`) is a TypeScript **Express** API. The browser (`apps/web`, Next.js)
talks to it through one origin: Next proxies `/api/*` to this service. Every external secret
(OpenRouter, KIE, Supabase service-role) lives here, never in the browser.

This doc is the companion to [`PIPELINE.md`](./PIPELINE.md) (which focuses on the LLM call graph).
Here we cover the whole service: endpoints, what triggers them, the pipelines behind them, the
services they call, config, quota, and the data model.

---

## 1. Server & request lifecycle

- **Entry:** `src/index.ts` → `loadEnvFile()` (hand-rolled `.env` loader, no `dotenv`; real
  `process.env` wins) → `createServer()` → listen on `PORT` (default 3000). On boot it calls
  `markStaleBatchItems()` to fail any batch items orphaned by a restart.
- **App:** `src/server.ts` — a single Express app, `express.json({ limit: "25mb" })` (images are
  sent as base64 data URLs), all routers mounted under **`/api`**. No CORS middleware (same-origin
  in prod, Vite/Next proxy in dev). `GET /api/health` → `{ ok: true }`.
- **Auth gate:** almost every route is wrapped in **`requireApprovedUser`**
  (`src/middleware/require-approved-user.ts`):
  `Authorization: Bearer <token>` → `getUserFromToken(token)` (Supabase `auth.getUser`) →
  `isApproved(userId)` (checks `profiles.approved`) → sets `req.user = { id, email }`. Missing/invalid
  token → `AuthError` (401); not approved → `ForbiddenError` (403).
- **Admin gate:** admin routes add **`requireAdmin`** (`src/middleware/require-admin.ts`), which
  checks `req.user.email === ADMIN_EMAIL` (`admin@betteryourads.dev`).
- **Errors:** every handler catches and calls `toHttpError()` → `{ status, body }`. Custom error
  classes (`ValidationError` 422, `AuthError` 401, `ForbiddenError` 403, `RateLimitError` 429,
  `OpenRouterError` 502, `KieError`, `PersistenceError` 500) carry the HTTP mapping + a `stage` tag.

---

## 2. Endpoints & what triggers them

All paths are under `/api`. "Trigger" = the web action that calls it.

| Method & path | Auth | Purpose | Triggered by (web) |
|---|---|---|---|
| `GET /health` | public | liveness | infra |
| `GET /config` | public | active model names + which integrations are configured + `SUPABASE_ANON_KEY` for client auth | app bootstrap |
| `POST /extract` | approved | Playwright reads the live page → `MeasuredSiteData` (colors, fonts, logos, text) | onboarding "Continue" |
| `POST /brand` | approved | Stage 1 brand DNA (+ VOC) → persist | onboarding, after extract |
| `POST /concept-board` | approved | generate the concept board for a brand+goal → persist | board: pick goal / ↻ regenerate |
| `GET /concept-board/:brandId` | approved | read the saved board (instant reopen) | opening Home/board |
| `PATCH /brand/:id/goal` | approved | set a brand's goal (`waitlist`/`trials`/`paid`) | onboarding goal step, board |
| `POST /ad-prompt` | approved | Stage 2 vision → render-ready `AdPrompt` | (batch worker; also direct) |
| `POST /render` | approved | KIE image gen → store → signed URL; **daily-quota gated** | single render path |
| `GET /usage` | approved | remaining creatives today (admin = unlimited) | workbench + board quota UI |
| `POST /batch` | approved | render one ad per selected concept (async worker); **quota gated** | workbench "Make my ad(s)" |
| `GET /batch/:id` | approved | batch status + per-item image URLs | workbench polling (3s) |
| `GET /brands` | approved | list saved brands (newest first) | rail, Home, start modal |
| `GET /brand/:id` | approved | full brand detail + logo URL | board, workbench preset |
| `POST /brand/:id/logo` | approved | upload/replace a brand's logo | board logo dropzone |
| `GET /ads` | approved | list generated ads (all, or `?brandId=`) | Library |
| `GET /reference-ads?variant=` | approved | curated reference ads (`with_asset`/`no_asset`) | workbench reference picker |
| `GET /admin/users` | admin | list users + approval/admin flags | admin dashboard |
| `PATCH /admin/users/:id/approval` | admin | approve/revoke (not self) | admin dashboard |
| `DELETE /admin/users/:id` | admin | delete user + cascade data (not self) | admin dashboard |
| `POST /admin/reference-ads` | admin | upload a curated reference ad | reference-ads admin |
| `DELETE /admin/reference-ads/:id` | admin | delete a curated reference ad | reference-ads admin |

---

## 3. Pipelines (`src/pipelines/`)

Each pipeline is a pure function; routes call them and handle persistence.

### Stage 1 — `runExtract(url)` → `MeasuredSiteData` (`extract.ts`)
Validates the URL, runs headless **Playwright** (`services/browser` `extractSite`) to read computed
colors (area-weighted), CSS color variables, fonts, `<img>` logos, and page text. **No LLM.**

### Stage 1 — `runBrand({ url, measuredSiteData })` → `BrandExtraction` (`brand.ts`)
- `buildStage1Prompt()` grounds the `extract-brand-dna.v3` system prompt with the measured data.
- Runs **3 parallel agents** (`BRAND_AGENT_GROUPS` A/B/C), each emitting a disjoint slice of the
  11-section schema (splitting avoids truncated single-shot output). Each agent:
  `chat({ model: STAGE1_MODEL, online: true, stage: "brand" })`, **one repair retry** on bad JSON.
- Merges successful slices, validates against `BrandExtraction`, stamps `schema_version: 1`.
- **Model calls:** 3 (up to 6 with repairs). **Online:** yes.

### VOC — `runCustomerResearch(analysis)` → `ExternalVoc | null` (`customer-research.ts`)
Best-effort voice-of-customer pass (ported from legacy `researchCustomers`). Builds
`customer-research.v1` from the analysis's `external_customer_research_plan` + brand context, then
`chat({ model: STAGE1_MODEL, online: true })` (web search). Parses to the VOC object; **returns
`null` on any failure** (never blocks brand creation). **Model calls:** 1.

> **Wiring:** `POST /brand` runs `runBrand`, then (lazily, only if absent) `runCustomerResearch`,
> attaches `external_voc` onto the analysis, and `saveBrandExtraction` persists the whole thing in
> the `brand_extractions.analysis` JSONB blob. The concept board later reads `external_voc` as
> `facts.customer_voice`.

### Concept board — `runConceptBoard({ analysis, goal })` → `ConceptBoard` (`concept-board.ts`)
`buildConceptBoardContent()` assembles `concept-board.v1` from grounded facts (customer voice,
customer DNA, messaging, proof, competitors, claim constraints, weighted by `GOAL_FOCUS[goal]`).
`chat({ model: STAGE3_MODEL, stage: "concepts" })`, **one repair retry**. Returns 10–16 concepts
(`angle`, `stage`, `headline`, `rationale`). **Model calls:** 1 (+1 repair). **Online:** no.

### Stage 2 — `runAdPrompt(input)` → `AdPrompt` (`ad-prompt.ts`)
`buildStage2Content()` selects `image-generator.v4-{no,w}-asset` by product-asset presence and
builds a **vision** message: prompt text + `BRAND_EXTRACTION_JSON` + reference-ad image + logo image
(+ optional product asset, customer research, performance memory, user direction).
`chat({ model: STAGE2_MODEL, stage: "ad-prompt" })`, **one repair retry**. **Model calls:** 1 (+1).

### Stage 3 — `runRender(input)` → `{ imageUrl, aspectRatio, resolution }` (`render.ts`)
Maps the aspect ratio to a KIE-accepted value (downgrades `1:1`+`4K` → `2K`), uploads the reference
ad / logo / optional product to KIE (`uploadBase64`), `createTask()` with the stringified ad-prompt,
then **polls** `pollResult()` every ~3s up to ~120s. Success → image URL; fail/timeout → `KieError`.
**No OpenRouter call** — KIE is the image backend.

---

## 4. Trigger map (web action → endpoint → pipeline → model)

```
Onboarding "Continue"
  → POST /extract            runExtract            Playwright            (no LLM)
  → POST /brand              runBrand              STAGE1_MODEL ×3 online (3 agents, merged)
                             runCustomerResearch   STAGE1_MODEL  online  (VOC, best-effort)
  → PATCH /brand/:id/goal    setBrandGoal          —                     (DB)

Home / board (open)
  → GET  /concept-board/:id  getConceptBoard       —                     (DB read; instant)
Board (pick goal / ↻ regenerate)
  → POST /concept-board      runConceptBoard       STAGE3_MODEL          (1 call + repair)

Workbench "Make my ad(s)"  (one shared reference → N concept ads)
  → POST /batch             createBatch + runBatch (async)
       per item (≤3 concurrent):
         runAdPrompt          STAGE2_MODEL (vision) (Stage 2, 1 call + repair)
         runRender            KIE_IMAGE_MODEL       (Stage 3, upload → poll)
         persistRenderedAd    —                     (download → store → DB)
  → GET  /batch/:id          getBatch              —                     (poll every 3s)

Library / rail / modal
  → GET  /brands, /ads, /reference-ads, /brand/:id   (DB reads, signed URLs)
```

---

## 5. Services (`src/services/`)

- **`openrouter.ts` — `chat({ model, messages, online?, stage })`**: single POST to
  `openrouter.ai/api/v1/chat/completions`; appends `:online` to the model when `online`. Returns
  `choices[0].message.content`; throws `OpenRouterError` on any failure. One call per invocation.
- **`kie.ts`** (image backend): `uploadBase64()` → upload via `kieai.redpandaai.co`;
  `createTask()` → `api.kie.ai/api/v1/jobs/createTask` (prompt capped at 20k chars); `pollResult()`
  → `recordInfo?taskId=…` returning `{ state, urls, failMsg }`.
- **`batch-worker.ts` — `runBatch({ batchId, userId, brandExtractionId, items })`**: a work queue
  with **max 3 concurrent** workers; each item runs `runAdPrompt` → `saveAdPrompt` → `runRender` →
  `persistRenderedAd` and marks the item `done`/`error` (one failure never aborts the others);
  `finalizeBatchIfDone()` flips the batch to `done`/`error` when no items remain queued/running.
- **`supabase.ts`** (service-role; all writes set `user_id` explicitly, bypassing RLS). Key
  functions by area:
  - *Auth:* `getUserFromToken`, `isApproved`
  - *Users (admin):* `listAllUsers`, `setUserApproved`, `deleteUser` (also purges storage)
  - *Brand:* `saveBrandExtraction` (upsert on user+url), `getBrandExtraction`, `listBrandExtractions`,
    `getBrandDetail`, `setBrandGoal`
  - *Ad prompts:* `saveAdPrompt`, `getAdPrompt`, `assemblePerformanceMemory`
  - *Generated ads:* `persistRenderedAd` (downloads KIE image → `ads/` bucket → DB → signed URL),
    `countAdsToday`, `listGeneratedAds`
  - *Logo:* `saveBrandLogo` (replaces prior), `getBrandLogoUrl`
  - *Concept board:* `saveConceptBoard` (upsert on user+brand), `getConceptBoard`
  - *Reference ads:* `listReferenceAds`, `createReferenceAd`, `deleteReferenceAd`
  - *Batch:* `createBatch`, `getBatch`, `updateBatchItem`, `finalizeBatchIfDone`, `markStaleBatchItems`
  - Signed URLs are issued with a **7-day TTL**.

---

## 6. Config & env (`src/config/index.ts`)

| Field | Env var | Notes |
|---|---|---|
| `stage1Model` | `STAGE1_MODEL` | brand extraction + VOC (run `:online`) |
| `stage2Model` | `STAGE2_MODEL` | ad-prompt (vision) |
| `stage3Model` | `STAGE3_MODEL` | concept board |
| `kieModel` | `KIE_IMAGE_MODEL` | default `gpt-image-2-image-to-image` |
| `kieResolution` | `KIE_IMAGE_RESOLUTION` | default `1K` |
| `openrouterConfigured` | `OPENROUTER_API_KEY` | presence flag |
| `kieConfigured` | `KIE_API_KEY` | presence flag |
| `supabaseConfigured` | `SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY`+`SUPABASE_ANON_KEY` | presence flag |
| `supabaseUrl` / `supabaseAnonKey` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` | anon key is returned to the browser for client auth |

**Quota** (`src/lib/usage.ts`): `dailyLimit()` ← `DAILY_GENERATION_LIMIT` (default **10**);
`generationTz()` ← `GENERATION_TZ` (default **`Australia/Sydney`**); `startOfDayInTz()` computes the
DST-safe local-midnight window used by `countAdsToday()`. `POST /render` and `POST /batch` reject
with `RateLimitError` (429) when `used + N > limit` — **admin is unlimited**.

---

## 7. Data model

**Tables:** `profiles` (`approved`, `is_admin`) · `brand_extractions` (`analysis` JSONB incl.
`external_voc`, `measured_site_data`, `goal`) · `ad_concept_sets` (`concept_set`, `model`) ·
`ad_prompts` (`ad_prompt_json`, `variant`, `user_direction`, `model`) · `generated_ads`
(`image_path`, `prompt`, `aspect_ratio`, `resolution`, `performance`, `ad_prompt_id`) ·
`brand_assets` (`image_path`, `kind='logo'`, `brand_id`) · `reference_ads` (`variant`, `label`,
`storage_path`) · `batch_jobs` (`status`, `total`) · `batch_items` (`batch_id`, `status`,
`idea_number`, `idea_name`, `generated_ad_id`, `error`).

**Storage buckets:** `ads/` (generated images) · `brand-assets/` (logos) · `reference-ads/`
(curated, `with_asset`/`no_asset`).

**Caching that gives the "instant" feel:** the concept board is read from `ad_concept_sets` on
revisit (no regeneration); brand analysis incl. `external_voc` lives in `brand_extractions.analysis`,
so the board grounds on it without a re-run.

---

## 8. End-to-end summary

1. **Extract** (Playwright, no LLM) →
2. **Brand** (3 online agents + 1 online VOC, merged, persisted in `analysis`) →
3. **Concept board** (1 call, cached in `ad_concept_sets`) →
4. **Workbench** picks one shared reference → **Batch** renders **one ad per selected concept**:
   each item = **Stage 2** (vision ad-prompt) + **Stage 3** (KIE render) + persist, ≤3 concurrent →
5. **Library** lists the results with signed URLs.

LLM prompts live only here, in `src/prompts/` (`extract-brand-dna.v3`, `customer-research.v1`,
`concept-board.v1`, `image-generator.v4-{no,w}-asset`). Switching models is config, not code.
