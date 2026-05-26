# Product / UI image integration — design spec

**Date:** 2026-05-26
**Branch:** feature/auth-and-saving
**Status:** Approved (brainstorming). Ready for implementation plan.

## Problem

Users want to attach their own product assets — product screenshots, dashboard UI,
an iPhone mockup — and have them appear in the generated ad instead of the abstract,
iconic product stand-in the pipeline produces today. Faithfully preserving the
attached UI matters a lot to the user (they are demoing to real customers).

## What we know about the constraints (grounded)

- **KIE GPT-Image-2 image-to-image** (`/kie/generate`) accepts `input_urls` of **up to
  16 images**. Today we send exactly 2: `[referenceImage, logoImage]`. Plenty of room.
- The endpoint has **no mask / inpainting parameter** — every call is a *full
  regeneration* of the whole canvas. Anything routed through the model (including a
  screenshot) is **re-drawn by the AI**, not copied. Therefore pixel-perfect UI is
  **not achievable** through the generator alone.
- This is an accepted trade-off. We are building **Approach A: native placement with
  maximum-fidelity prompting** — the model is told, as forcefully as possible, to
  reproduce the attached asset faithfully and never relabel/redraw/invent UI text.
  Expectation-setting copy in the UI makes the "very close, not pixel-perfect" reality
  explicit. (A future "exact paste / composite" path was explicitly deferred.)

## Existing pipeline (do not break)

- **Stage 2** (`/chat`, vision model) currently attaches only the reference ad image +
  Stage 1 brand JSON, and emits a render-ready `ad_prompt` JSON.
- **Stage 3** (`/kie/generate`) uploads `referenceImage` + `logoImage` via
  `kieUploadBase64`, builds `input_urls = [reference, logo]`, creates the task, polls.
- Module-level vars `refImage3DataUrl` / `logoImage3DataUrl` feed **both** the single
  "Generate image" path (`generateImage`) **and** the batch angle-variations path
  (`batchGenerate` → `runKieGeneration`). Anything added there reaches both for free.
- The Stage 2 prompt **already anticipates this** (index.html ~line 826): *"If a real
  product screenshot or UI asset is attached as an input image, place it faithfully in
  the product slot and do not redraw, relabel, or invent its contents."* The current
  default branch (line 827) represents the product abstractly. We flip that on when
  assets are present.
- Auth/secret-keeping invariant: every external call goes through a server endpoint
  behind `requireApprovedUser`; the KIE/OpenRouter/service-role keys never reach the
  browser. New endpoints must follow this.

## Scope decisions (from brainstorming)

1. **Integration mode:** Approach A — model places the asset, instructed hard to not
   alter the UI. No compositing.
2. **Asset count:** up to **3** product assets selectable per generation.
3. **Persistence:** **saved per brand** in Supabase (not session-only).

## Design

### 1. UX (index.html, Stage 3)

A new optional block below "Brand logo": **"Product / UI images (optional)"**.

- Lists thumbnails of product assets **saved for the currently-selected brand**
  (`currentBrandId`). Each thumbnail has a **select checkbox** ("include in this
  generation") and a **delete (×)**.
- An **"Add image"** control (file picker, `accept="image/*"`). On add: the file is
  downscaled client-side (longest side ≤ 1600px, re-encoded) to keep request bodies
  small, **uploaded + saved to the current brand immediately**, then appears as a new
  thumbnail (selected by default).
- **Selection cap: 3.** Selecting a 4th is prevented with an inline hint.
- **Expectation-setting hint:** *"The AI places these into the ad's product area and is
  told to reproduce them faithfully — but generated images are never pixel-perfect, so
  fine UI text may soften."*
- **Graceful fallback when no brand is saved:** the block shows *"Save a brand first to
  attach product images,"* the Add control is disabled, and the rest of Stage 3 works
  exactly as today (product asset feature is purely additive/optional).

The selected assets are held in memory as base64 in a module-level array
`productAssetDataUrls` (parallel to `refImage3DataUrl` / `logoImage3DataUrl`), so both
the single and batch generation paths pick them up automatically.

### 2. Data model (Supabase — supabase/schema.sql, idempotent)

Mirror the existing `ads` table + `ads` bucket pattern.

- **Table `public.brand_assets`:**
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`
  - `brand_id uuid not null references public.brands(id) on delete cascade`
  - `image_path text not null`  (storage path `<uid>/<assetId>.<ext>`)
  - `kind text not null default 'product'`
  - `label text`  (e.g. original filename)
  - `created_at timestamptz not null default now()`
  - RLS enabled; policy `"own brand_assets" for all using (auth.uid() = user_id) with
    check (auth.uid() = user_id)` (same shape as `own brands`).
- **Storage bucket `brand-assets`** (private), created idempotently like `ads`.
  Read policy scoped to the `<uid>/` prefix, identical in shape to
  `"own ad files read"`.

### 3. Server endpoints (server.js — all behind `requireApprovedUser`)

- **`POST /library/brand-assets`** — body `{ brandId, image (base64 data URL or raw
  base64), label }`. Verify the brand belongs to `req.user` (select the brand row by id
  + user_id). Decode → upload to `brand-assets` bucket at `<uid>/<assetId>.<ext>` →
  insert `brand_assets` row → return `{ asset, signedUrl }` (signed URL ~1h for the
  thumbnail).
- **`GET /library/brand-assets?brandId=`** — list the brand's assets for the user,
  newest first, each with a fresh signed URL.
- **`DELETE /library/brand-assets/:id`** — verify ownership, remove the storage object,
  delete the row.

Reuse the existing base64-decode/upload approach already used by `/library/ads`
(`Buffer.from`, `supabaseAdmin.storage.from(...).upload`). Content-type/extension
detection mirrors `/library/ads`.

### 4. Generation wiring

**`/kie/generate` (server.js):** accept an optional `productImages` array of base64
strings. After uploading reference + logo, upload each product image (cap to first 3)
via `kieUploadBase64` and **append** them so
`input_urls = [reference, logo, ...products]`. Reference stays first, logo second —
preserving the order the prompt language already assumes; products follow.

**Browser side:** `runKieGeneration` adds `productImages: productAssetDataUrls` to the
POST body. Used by both `generateImage` and `batchGenerate` unchanged otherwise. When
the user selects a *saved* asset (loaded from `GET`), the browser fetches its signed URL
and converts to base64 so the same uniform "everything is base64" contract to
`/kie/generate` holds (no server contract split, minimal change). Freshly-added assets
are already base64 in memory.

### 5. Prompt changes (runtime injection — no baked-template edit, no version bump)

When ≥1 product asset is selected, **`runStage2`**:

- Attaches each selected product asset as an additional `image_url` input in the message
  (after the reference ad image).
- Appends a **PRODUCT_ASSETS directive** to the text (alongside the existing
  REFERENCE_AD_IMAGE / BRAND_EXTRACTION_JSON blocks). The directive instructs the model:
  - *N real product asset image(s) are attached as additional inputs after the reference
    ad. These ARE the product visual — use them in the product slot.*
  - *Describe only their PLACEMENT and TREATMENT (size, position, device framing to match
    the reference), NOT their internal contents — do not transcribe or invent any UI text.*
  - *The generated `ad_prompt` `product_visual_direction` and `negative_prompt` must
    instruct the renderer to reproduce the attached product asset(s) faithfully and to
    never alter, relabel, redraw, recolor, crop, or invent any UI, text, charts, or data
    inside them.*
  - This **overrides** the "represent the product abstractly" default for this run.

We do **not** edit the baked `STAGE2_PROMPT` template (so users' edited prompts in
localStorage are untouched and no `STAGE2_PROMPT_VERSION` bump is needed). The directive
is appended at request time, exactly like the existing REFERENCE_AD_IMAGE block.

Rationale for "placement/treatment, not contents": if the vision model transcribes UI
text into the prompt, KIE is more likely to *re-render* fake UI text. Keeping the prompt
about placement + a hard "reproduce the attached image, don't invent UI" instruction
gives the best fidelity Approach A can offer.

### 6. Request-size safety

The Express body limit is 25 MB. Client-side downscale (longest side ≤ 1600px, JPEG/PNG
re-encode via a canvas) keeps reference + logo + 3 product images comfortably under it.
Apply the same downscale to product uploads. (Reference/logo handling is unchanged.)

## Out of scope / deferred

- Exact-paste compositing (Approach B) — explicitly deferred.
- Per-asset "kind" UI (dashboard vs mockup vs photo) — `kind` column exists for future
  use but the UI just calls them "product / UI images" and defaults `kind='product'`.
- Orphaned storage cleanup when a brand row is deleted (brands aren't deletable in the
  current UI; row cascade handles the DB side; storage GC is a future chore).
- Editing/reordering assets beyond add/select/delete.

## Risks & mitigations

- **Fidelity:** generated UI is never pixel-perfect → mitigated by hard prompt language
  + honest UI copy. Accepted.
- **Placement of multiple assets:** the model decides where 2–3 assets go → mitigated by
  capping at 3 and instructing it to use the reference's product slot(s).
- **Payload size:** → client-side downscale.
- **Supabase changes require manual SQL run** in the dashboard (same as the existing
  schema). The implementer updates `schema.sql`; the user must run it before the feature
  works end-to-end. This will be called out in the final hand-off.
- **No-brand state:** feature must never block the existing Stage 3 flow → graceful
  fallback specified.

## Acceptance

1. With a saved brand selected, a user can add up to 3 product images; they persist and
   reappear (as thumbnails) after reload / brand re-selection; they can be deleted.
2. Selected product images are passed to KIE as additional `input_urls` and appear in
   the generated ad's product area in both single and batch generation.
3. The Stage 2 ad prompt's `product_visual_direction` / `negative_prompt` reference
   faithful reproduction of the attached asset and forbid invented UI.
4. With no saved brand, Stage 3 behaves exactly as before; the product block shows the
   "save a brand first" fallback and the Add control is disabled.
5. No API keys reach the browser; all new endpoints are behind `requireApprovedUser`.
