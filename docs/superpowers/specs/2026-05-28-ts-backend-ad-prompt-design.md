# TS Backend — Ad Prompt (Stage 2) Slice — Design (Plan 3 of 5)

**Date:** 2026-05-28
**Branch:** `feature/jerey-refactor`
**Status:** Approved (autonomous; user pre-accepted overnight)

Slice spec for the third backend vertical: `POST /api/ad-prompt`. Derived from the master
rebuild spec (`docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md`,
the "[3] AD PROMPT" data-flow row and the `getStage2Prompt({ hasProductAsset })` registry
note) and the proven legacy Stage-2 mechanics in `legacy/bya-pipeline.js` /
`legacy/bya-prompts.js`. Builds on Plan 2 (Brand DNA) and the API auth gate (now on
`feature/jerey-refactor`).

## Goal

Given a `BrandExtraction` + a reference ad image + a brand logo (+ optional product asset
and optional research/memory/direction), run the Stage-2 "Image Generator v4" **vision**
prompt through OpenRouter and return a validated `AdPrompt` JSON
(`reference_ad_analysis` + `reskin_map` + `ad_prompt` + provenance arrays). Stage 2 is the
ad-reproduction planner: it analyzes the reference ad and produces a precise, brand-reskinned
render spec that Stage 3 (Plan 4) feeds to the image model.

## Scope

**In:**
- `AdPrompt` + `AdPromptRequest` zod contracts in `packages/shared` (tolerant, versioned).
- Extend the OpenRouter `chat()` client to accept **multimodal message content** (an array
  of `{type:"text"}` / `{type:"image_url"}` parts) — additive; Stage-1's string content is
  unaffected.
- Two verbatim Stage-2 prompt modules (`image-generator.v4-no-asset`, `…-w-asset`) + registry
  additions: `getStage2Prompt(hasProductAsset)` and `buildStage2Content(...)` (assembles the
  grounded text + attached images into the vision message).
- `runAdPrompt(...)` pipeline: validate → single vision call → LLM-JSON guard (parse →
  validate → **one repair retry** → typed error) → stamp `schema_version`.
- `POST /api/ad-prompt` route, gated by `requireApprovedUser`, wired into the server.
- Manual run script + mocked unit tests + a gated real e2e smoke.

**Out (explicitly):**
- Persistence + `id` + `brandExtractionId` lookup + backend-assembled performance memory →
  **Plan 5**. This slice takes `brandExtraction` inline and returns `{ adPrompt }` (no `id`),
  exactly as Plan 2 returned `{ brandExtraction }`.
- Stage 3 render → **Plan 4**.
- The concept-generation agent / batch composer (master spec "Future extension point").

## Decisions (locked)

- **Inline `brandExtraction`, response `{ adPrompt }`.** No `brandExtractionId` resolution
  (needs Supabase = Plan 5). Mirrors Plan 2's deferral precedent.
- **Variant selection = product-asset presence only.** `productAsset` present →
  `v4-w-asset` prompt; absent → `v4-no-asset`. No `mode` request param (the legacy
  `STAGE2_MODE_RULES`/"exact" knob is not surfaced — the v4 prompts already bake in the
  faithful-reproduction behavior). Matches the master spec's "driven purely by `productAsset`
  presence".
- **Single vision call, not 3 parallel agents.** Stage 2 emits one JSON object. The 3-agent
  split was a Stage-1-only device for the huge 11-section schema.
- **`:online` is OFF for Stage 2.** Web search is a Stage-1-only behavior.
- **Logo is attached at Stage 2.** The master spec lists Logo as a Stage-2 input and the v4
  prompt instructs "Use the attached BRAND_LOGO_IMAGE/brand logo image". Images are attached
  in this order, each labeled in the text: **reference ad → brand logo → [product asset]**.
  (Note: legacy attached the logo only at render; we follow the rebuild spec and thread it at
  Stage 2 as well — strictly more grounding for the vision model, and the request contract
  must carry it regardless for Plan 4.)
- **Optional inputs thread as labeled text sections** when present:
  `=== OPTIONAL_CUSTOMER_RESEARCH_JSON ===`, `=== OPTIONAL_PERFORMANCE_MEMORY_JSON ===`,
  `=== OPTIONAL_USER_DIRECTION ===`. Absent inputs add nothing.
- **Tolerant, versioned `AdPrompt`** (mirrors `BrandExtraction`): every section optional and
  `.passthrough()`, but the pipeline floor requires **`ad_prompt`** to be present in the
  result (the analogue of Stage-1's `brand_identity` floor; Stage 3 reads
  `ad_prompt.canvas.aspect_ratio`). `schema_version` is stamped by the pipeline.
- **Model is config-driven** (`STAGE2_MODEL`, already in `AppConfig`). No config change.
- **No new dependencies.** Vision uses the existing `fetch` path.

## Contracts

`AdPromptRequest` (request body):
```
brandExtraction: BrandExtraction      (validated with the shared tolerant schema)
referenceAdImage: string              (base64 data URL, required)
logoImage: string                     (base64 data URL, required)
productAsset?: string                 (base64 data URL; presence selects the variant)
customerResearch?: unknown            (JSON, threaded if present)
performanceMemory?: unknown           (JSON, threaded if present)
userDirection?: unknown               (JSON or string, threaded if present)
```

`AdPrompt` (top-level keys, all tolerant/passthrough): `schema_version?`,
`reference_ad_analysis?`, `reskin_map?`, `ad_prompt?` (with a typed-but-loose `canvas`
carrying `aspect_ratio`), `assumptions?`, `missing_inputs_that_would_improve_output?`,
`source_fields_used?`. Shape from `legacy/bya-prompts.js` and the two
`docs/extra files/Image Generator v4 *.txt` files (output-format sections).

## Request / response contract

| Condition | Status | Body |
|---|---|---|
| No / invalid / unapproved token | 401/403 | auth error (via `requireApprovedUser`) |
| Missing/malformed body (no `brandExtraction`/images) | 422 | `ValidationError` |
| Stage-2 model returns invalid JSON twice | 422 | `ValidationError` (raw output logged server-side) |
| OpenRouter upstream failure | 502 | `OpenRouterError` (`stage: "ad-prompt"`) |
| Success | 200 | `{ adPrompt }` (with `schema_version`) |

## Error handling

- Reuses the existing typed errors. `Stage` already includes `"ad-prompt"` (added with the
  auth-gate `errors.ts` edit) — no `errors.ts` change.
- LLM-JSON guard identical in spirit to Stage 1: parse (`parseJsonLoose`) → validate against
  `AdPrompt` requiring `ad_prompt` → one repair retry with a "return valid JSON only" nudge →
  else `ValidationError` with the raw output logged (never returned).

## Verification

- **Unit (mocked `openrouter.chat`):** valid vision reply → merged/validated `AdPrompt` with
  `schema_version`; variant selection (asset vs no-asset prompt chosen by `productAsset`);
  optional inputs appear in the message only when provided; images attached in the right order
  with labels; first-try non-JSON → repair retry succeeds; invalid twice → `ValidationError`;
  upstream failure → `OpenRouterError`; malformed request → `ValidationError` before any call.
- **Route (mocked pipeline + supabase service):** 200 `{ adPrompt }` for an approved user;
  401 without token; `ValidationError`→422; `OpenRouterError`→502 with `stage: "ad-prompt"`.
- **Manual run script** (`run-ad-prompt.ts`): reads a brand JSON file + reference-ad image
  file + logo image file (+ optional product asset), base64-encodes, calls the real pipeline,
  prints a summary. Requires user-supplied image files; if none are available in this
  environment, that is reported as DONE_WITH_CONCERNS (not a code defect), same convention as
  Plan 2's network/key path.
- **Gated real e2e** (`BYA_E2E=1` **and** fixture paths via `BYA_REF_AD_PATH`/`BYA_LOGO_PATH`):
  one real Stage-2 call; skipped by default so normal runs are offline and cost-free.

## Self-review (spec)

Covers the master spec's `[3] AD PROMPT` row: brand + reference + logo + optional product
asset + optional research/memory/direction → `AdPrompt` (reference_ad_analysis, reskin_map,
ad_prompt) via Stage-2 vision, variant by `hasProductAsset`, model config-driven, tolerant
versioned contract, LLM-JSON guard with one repair retry, gated endpoint. Defers persistence/
`id`/performance-memory to Plan 5 and render to Plan 4, consistent with the build order.
