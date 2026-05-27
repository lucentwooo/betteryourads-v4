# TypeScript Backend Rebuild — Design

**Date:** 2026-05-28
**Branch:** `feature/jerey-refactor`
**Status:** Approved (design); pending implementation plan

## Goal

Rebuild BetterYourAds as a TypeScript application, **backend first**. Archive the
current app under `legacy/` (kept intact and runnable as a behavioral reference) and
build a new, typed, layered backend that implements an upgraded ad-generation pipeline.
The frontend (Vite + React + TS) comes in a **later phase** against the proven, typed
API contract — it is explicitly out of scope here.

"Backend down pat" means **demonstrated**: every pipeline is independently runnable and
verified (script + tests) before we build any UI on top of it.

## Stack

- **Backend:** TypeScript + Express (long-running Node process — required for Playwright).
- **Validation:** zod at every boundary (request bodies AND LLM JSON output).
- **Tests:** Vitest (TS-native), external services mocked; one gated real e2e smoke.
- **Persistence:** Supabase (Postgres + Storage), service-role key server-side only.
- **External services:** Playwright (headless Chromium), OpenRouter (chat completions,
  Stage 1 + Stage 2 vision), KIE (GPT-Image, Stage 3 render).
- **Frontend (later phase):** Vite + React + TypeScript.

### Why this stack

`/extract` runs headless Chromium via Playwright, which wants a persistent Node process,
not serverless. Everything left after deleting the marketing landing page sits behind
login, so SSR/SEO (Next.js's main draw) buys nothing. The real maintainability pain is
the old string-DOM frontend — solved later by typed React components consuming a typed
API. A TS Express backend preserves the secret-keeping-proxy invariant almost 1:1.

## Repository layout (npm workspaces monorepo)

```
betteryourads-v4/
├── legacy/                  # entire current app, moved here untouched, still runnable
│   ├── server.js  app.html  admin.html  library.html
│   ├── auth.js  bya-pipeline.js  bya-prompts.js
│   ├── styles/  assets/  supabase/  scripts/  package.json
│
├── apps/
│   └── backend/             # NEW — TS Express backend (this phase)
│       ├── src/  scripts/  tests/  package.json  tsconfig.json
│   └── web/                 # (LATER) Vite + React frontend — not built this phase
│
├── packages/
│   └── shared/              # NEW — shared TS types + zod schemas (the API contract)
│       └── src/  package.json
│
├── docs/                    # specs stay at root (incl. this design)
├── package.json             # workspaces root: ["apps/*", "packages/*"]
├── .env                     # unchanged, root-level, server-only secrets
└── .gitignore               # node_modules, dist/, Playwright cache
```

- `legacy/` keeps its own `package.json` so `cd legacy && npm start` runs the old app.
- `packages/shared` carries **only** types + zod schemas — never secrets. The backend
  imports them now; the future frontend imports the same ones, so the contract can't drift.
- New prompt content is ported into `apps/backend/src/prompts/`; the originals in
  `docs/extra files/` remain the human-readable source.
- Secret-keeping invariant unchanged: `.env` stays root/server-only.

## Backend internal structure (layered — "Approach A")

```
apps/backend/src/
  config/      typed env (models, keys, KIE resolution); real process.env wins over .env
  server.ts    Express wiring + middleware
  routes/      thin HTTP handlers, one per endpoint → call a pipeline
  pipelines/   extract · brandDna · adPrompt · render — typed (input)→(output),
               no HTTP/Express awareness; independently runnable & testable
  services/    external clients, one responsibility each:
                 browser.ts     Playwright chromium singleton + extractFromPage()
                 openrouter.ts  chat({model,messages,online}) + JSON parse helper
                 kie.ts         uploadBase64 → createTask → pollResult
                 supabase.ts    typed persistence + storage (service-role, server-only)
  prompts/     versioned prompt modules + registry:
                 extract-brand-dna.v3.ts
                 image-generator.v4-no-asset.ts
                 image-generator.v4-w-asset.ts
                 registry.ts  → getStage1Prompt() · getStage2Prompt({ hasProductAsset })
  lib/         json extraction, image utils, typed errors
```

## Pipelines & data flow

Four operations, each its own endpoint, each a typed pipeline function callable without HTTP.

```
 URL ──▶ [1] EXTRACT ─────▶ MeasuredSiteData
            (Playwright)     (area-weighted colors, CSS vars, fonts, logos, text)

 URL + MeasuredSiteData ──▶ [2] BRAND DNA ──▶ BrandExtraction JSON ──▶ Supabase
            (OpenRouter STAGE1, Extract Brand DNA v3, :online ALWAYS on)
            (11 sections + source_map)

 BrandExtraction + ReferenceAd + Logo + [ProductAsset?]
   + [customerResearch?] [performanceMemory?] [userDirection?] ──▶ [3] AD PROMPT ──▶ AdPrompt JSON ──▶ Supabase
            (OpenRouter STAGE2 vision; ProductAsset presence selects
             v4-w-Asset vs v4-NO-Asset prompt)
            (reference_ad_analysis, reskin_map, ad_prompt)

 AdPrompt + ReferenceAd + Logo + [ProductAsset?] ──▶ [4] RENDER ──▶ image URL ──▶ Supabase (library + storage)
            (KIE: upload base64 → generate → poll; renders at 1K resolution;
             aspect ratio auto-detected from the Stage-2 prompt)
```

**Extract and Brand DNA stay separate atomic operations** (frontend orchestrates
`extract → brand`) — keeps each endpoint simple and independently configurable as
configuration grows.

### Endpoints (all under `/api`, all server-side secret-keeping)

| Method/Path | Request | Response |
|---|---|---|
| `POST /api/extract` | `{ url }` | `MeasuredSiteData` |
| `POST /api/brand` | `{ url, measuredSiteData }` | `{ id, brandExtraction }` |
| `POST /api/ad-prompt` | `{ brandExtractionId \| brandExtraction, referenceAdImage, logoImage, productAsset?, customerResearch?, performanceMemory?, userDirection? }` | `{ id, adPrompt }` |
| `POST /api/render` | `{ adPromptId \| adPrompt, referenceAdImage, logoImage, productAsset? }` | `{ id, imageUrl }` |
| `GET /api/config` | — | active models / which keys are set (non-secret) |

- **Stage-1 web search (`:online`) is ALWAYS on** — it is not a client flag or option.
  The Brand DNA pipeline always appends OpenRouter's `:online` plugin; there is no way to
  turn it off from the request.
- **Images** are transported as **base64 in JSON** (matches KIE's base64 upload path);
  Express body limit raised (~25mb).
- **Stage-2 variant selection** is driven purely by `productAsset` presence
  (`hasProductAsset` → v4-w-Asset prompt, else v4-NO-Asset).
- **Optional Stage-2 inputs are all wired now:** `customerResearch`,
  `performanceMemory`, `userDirection` thread into the Stage-2 prompt when present.
- **Performance memory is backend-assembled from Supabase** (prior generated ads +
  their performance tags, joined back to the ad_prompts/brand that produced them); an
  explicit override may still be passed in the request.

## Contracts & validation (the spine)

`BrandExtraction` (11 sections + `source_map`) and `AdPrompt` (`reference_ad_analysis`,
`reskin_map`, `ad_prompt`) are defined as **zod schemas in `packages/shared`**, with TS
types inferred from them. They are validated:

- **Inbound** — request bodies.
- **Outbound from the model** — the LLM's JSON is parsed and validated against the
  contract. On failure: **one repair retry** with a "return valid JSON only" nudge; if
  still invalid, surface a typed `ValidationError` with the raw output captured
  server-side. Downstream stages never receive malformed data.

The `BrandExtraction` payload is **versioned** (`schema_version`) and the schema is
tolerant (new sections optional) so older persisted rows still parse.

## Prompt registry

The three `.txt` prompts become typed modules. Each exports its system text + a builder
that injects the stage's inputs. `registry.ts` selects the Stage-2 variant from
`hasProductAsset`. The model per stage is **config-driven** (`STAGE1_MODEL`,
`STAGE2_MODEL`, `KIE_IMAGE_MODEL`, `KIE_IMAGE_RESOLUTION`) — switching models never
touches code. Source prompts: Extract Brand DNA v3, Image Generator v4 (NO Asset),
Image Generator v4 (w Asset). v4 is structurally identical to v3 (same output JSON);
only the product-visual anti-hallucination wording is tightened.

## Persistence & migration

### Current schema (populated, with RLS)

`profiles`, `brands` (`analysis` jsonb, unique user+url), `ads` (`image_path`, `prompt`
text, aspect/resolution), `brand_assets` (product images), plus storage buckets `ads`
(server-written, read-only) and `brand-assets` (browser-written). RLS throughout.

### Target schema (renamed + extended)

| Existing | Renamed to | Changes |
|---|---|---|
| `brands` | `brand_extractions` | add `measured_site_data jsonb`; `analysis` holds versioned BrandExtraction JSON |
| `ads` | `generated_ads` | add `performance jsonb`; link to new `ad_prompts` |
| `brand_assets` | (kept) | product assets for w-Asset Stage 2 |
| `profiles` | (kept) | auth, deferred to frontend phase |
| — | `ad_prompts` (NEW) | `id, brand_extraction_id fk, variant ('no_asset'\|'w_asset'), ad_prompt_json jsonb, user_direction jsonb, model, created_at` |

Generated images stay in a Supabase **storage bucket**; the library serves **signed
URLs**. **Performance memory is derived by query** (no dedicated table). `user_id` stays
nullable for now (auth lands with the frontend).

### Migration approach (real data — must preserve)

1. **Adopt Supabase CLI migrations.** Stop hand-editing the single idempotent
   `schema.sql`; move to ordered, append-only files under `supabase/migrations/`
   (`supabase migration new …`, `supabase db push`). The old `schema.sql` becomes the
   baseline/first migration.
2. **Expand → rename → backfill → contract** (never destructive in one step):
   - **Expand:** `create table ad_prompts`; `alter table … add column measured_site_data`,
     `add column performance`.
   - **Rename:** `alter table brands rename to brand_extractions`, `ads rename to
     generated_ads`. Postgres preserves data, FKs, indexes, and RLS policies across a
     rename; update policy/object **names** for clarity in a follow-up.
   - **Backfill:** existing `brands.analysis` already *is* brand JSON (stamp
     `schema_version`); old `generated_ads` rows get `performance = null` and no linked
     `ad_prompt` (their old `prompt` text predates the structured Stage-2 output and is
     retained as-is).
   - **Contract:** only after the new backend is live and verified, a later migration
     drops anything truly dead.
3. **Payload versioning** (`schema_version` on the brand JSON) + tolerant zod so old rows
   keep parsing; the prompts already treat missing data as "unknown."
4. **De-risk on a Supabase preview branch** — develop/test migrations on a DB branch,
   then merge, rather than running straight against production data.

## Config & secret-keeping

`config/` exposes typed config from env: `STAGE1_MODEL`, `STAGE2_MODEL`,
`KIE_IMAGE_MODEL`, `KIE_IMAGE_RESOLUTION`, `OPENROUTER_API_KEY`, `KIE_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The "real `process.env` wins over `.env`"
convention from the current app is preserved. All keys are server-side only; the
service-role key never leaves the backend; error bodies never contain secrets.

## Error handling

- Typed errors per service: `ExtractionError`, `OpenRouterError`, `ValidationError`,
  `KieError`. Routes map them to `{ error: { code, message, stage } }` with the right
  HTTP status.
- **LLM JSON** (riskiest seam): parse → zod-validate → one repair retry → typed error
  with raw output logged.
- **KIE render:** bounded polling with a timeout ceiling; surface task status rather than
  hang. Renders at **1K** resolution (`KIE_IMAGE_RESOLUTION=1K`); no 4K/2K downgrade logic
  is needed.
- **Playwright:** per-request navigation timeout; relaunch the shared browser singleton
  if it crashes.

## Verification ("down pat" = demonstrated)

- **Per-pipeline run scripts** in `apps/backend/scripts/` (`run-extract.ts`,
  `run-brand.ts`, `run-ad-prompt.ts`, `run-render.ts`) — exercise the real pipeline
  against sample inputs, print/save output JSON. No frontend required.
- **Vitest unit tests** with external services mocked — pipeline orchestration + zod
  contract behavior (valid in → valid out; malformed LLM output → repair path → typed
  error).
- **Gated real e2e smoke** — one test hitting real OpenRouter/KIE/Playwright against a
  sample URL + reference ad, skipped unless API keys are present (no default cost/CI burn).
- Each pipeline is **built test-first** (failing test/script → implement → green).

## Build order (incremental, vertical slices)

1. **Walking skeleton** — workspaces root, `packages/shared`, `apps/backend` that boots;
   move current app into `legacy/`; settle dev/build/test wiring.
2. **Backend proxy/service clients + endpoints, one at a time** — `extract`, then
   `brand`, then `ad-prompt`, then `render`; each verified via its run script + tests
   before the next.
3. **Persistence + migrations** — adopt CLI migrations; expand→rename→backfill→contract;
   wire pipelines to Supabase; backend-assembled performance memory.
4. **(Later phase, out of scope here)** — `apps/web` frontend on the proven typed API;
   auth + per-user scoping.

## Future extension point: batch variations (design toward, do NOT build now)

The end goal is **batch variation generation**, planned to work like this:

1. A new **concept-generation agent** (a stage effectively before Stage 2) takes the
   brand and produces N distinct ad concepts/angles.
2. Each concept becomes **an additional input to Stage 2** (alongside reference ad, brand
   JSON, and the existing optional inputs).
3. A thin **batch composer** loops Stage 2 → Stage 3 across the concepts to produce the
   batch in one user action.

The current design is intentionally shaped to absorb this **without rework** — and that
shapedness is the only thing in scope now:

- **Stage 2 input is an extensible typed object.** Adding a `concept` field later is a
  non-breaking, additive change to the request schema + prompt builder.
- **Pipeline functions are composable.** The future batch composer is a small server-side
  loop over the existing `adPrompt` and `render` pipeline functions — it does not need a
  generic orchestrator engine (Approach B stays rejected).
- **The prompt registry can hold the concept-agent prompt** as another versioned module.
- **Persistence can group a batch later** via an optional `batch_id` on `generated_ads`
  (and/or `ad_prompts`); not added now, but the schema/migrations leave room for it.

**The real concern batch introduces is async job handling, not orchestration logic.** A
batch is N slow, expensive calls (N × Stage-2 LLM + N × KIE render), so it can't run
synchronously in one HTTP request. When built, the batch endpoint should kick off work,
return a `batch_id`, process in the background, and let the client **poll for progress**
(the same poll pattern KIE already forces at render). An MVP can process items
sequentially in the background and update per-item status; a real worker/queue is only
warranted if volume demands. This is a job/queue concern — still **not** a generic
workflow-orchestrator engine (Approach B stays rejected).

No orchestrator, concept agent, batch composer, or batch endpoint is built in this phase.
This section exists so the contracts and schema don't get designed in a way that blocks it.

## Out of scope (this phase)

- Frontend (`apps/web`) — built later against the typed API.
- Auth / per-user data scoping — lands with the frontend.
- The concept-generation agent, batch composer, and batch endpoint (see Future extension
  point above) — design accommodates them; none are implemented now.
- Any change to the marketing landing page (already deleted).
