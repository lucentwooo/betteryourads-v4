# TS Backend — Render (Stage 3) Slice — Design (Plan 4 of 5)

**Date:** 2026-05-28
**Branch:** `feature/jerey-refactor`
**Status:** Approved (autonomous; user pre-accepted overnight)

Slice spec for the fourth backend vertical: `POST /api/render`. Derived from the master
rebuild spec ("[4] RENDER" row + the `services/kie.ts` note) and the proven legacy KIE
mechanics in `legacy/server.js` / `legacy/bya-pipeline.js`. Builds on Plan 3 (Ad Prompt).

## Goal

Given an `AdPrompt` + a reference ad image + a brand logo (+ optional product asset),
render the final static ad via **KIE** (GPT-Image image-to-image) and return the generated
image URL. KIE flow: **upload base64 images → createTask → poll until done**. Aspect ratio
is auto-detected from the Stage-2 `ad_prompt.canvas.aspect_ratio`; resolution is config-driven.

## Scope

**In:**
- `RenderRequest` zod contract in `packages/shared` (tolerant; wraps `AdPrompt`).
- `services/kie.ts` — three thin clients: `uploadBase64`, `createTask`, `pollResult`.
- Typed `KieError` (502, stage `render`) in `lib/errors.ts`.
- `runRender(...)` pipeline: validate → derive aspect/resolution → upload images → createTask
  → bounded poll loop (3s interval, 120s ceiling) → return image URL.
- `POST /api/render` route, gated by `requireApprovedUser`, wired into the server.
- Manual run script + mocked unit tests (service + pipeline + route) + a gated real e2e smoke.

**Out (explicitly):**
- Persistence + `id` + downloading the image into Supabase Storage + signed library URLs →
  **Plan 5**. This slice takes `adPrompt` inline and returns `{ imageUrl }` (the KIE-hosted
  result URL), mirroring Plan 2/3's deferral precedent. (KIE result URLs are temporary —
  Plan 5 downloads + persists them; acceptable for this verify-the-pipeline slice.)
- `adPromptId` lookup (needs Supabase = Plan 5).
- Batch / async job handling (master spec "Future extension point").

## Decisions (locked)

- **Inline `adPrompt`, response `{ imageUrl }`.** No `adPromptId` resolution, no Supabase.
- **KIE two-host flow** (from legacy, unchanged):
  - Upload: `POST https://kieai.redpandaai.co/api/file-base64-upload` →
    `{ base64Data, uploadPath: "images/ad-stage3", fileName }` → `data.downloadUrl`.
  - Create: `POST https://api.kie.ai/api/v1/jobs/createTask` →
    `{ model, input: { prompt, input_urls, aspect_ratio, resolution } }` → `data.taskId`
    (require `data.code === 200`).
  - Poll: `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…` → `data.state` /
    `data.resultJson` (a JSON string holding `resultUrls`) / `data.failMsg`.
  - All three use `Authorization: Bearer ${KIE_API_KEY}`.
- **Images uploaded as hosted URLs**, in order **reference ad → brand logo → [product asset]**;
  data-URL prefix (`data:…;base64,`) is stripped before upload (KIE wants raw base64).
- **Prompt sent to KIE** = `JSON.stringify(adPrompt.ad_prompt)`, capped at 20 000 chars.
- **Aspect ratio** = `mapAspectRatio(adPrompt.ad_prompt.canvas.aspect_ratio)` — ported
  verbatim; normalizes to `1:1 | 16:9 | 9:16 | 4:3 | 3:4 | auto`.
- **Resolution** = `KIE_IMAGE_RESOLUTION` (config, default `1K`); the legacy guard "`1:1` +
  `4K` → `2K`" is preserved.
- **Polling:** poll-then-sleep, 3s interval, 120s ceiling. `success` → first URL; `fail` →
  `KieError`; ceiling exceeded → `KieError` (task may still finish). Interval/ceiling are
  injectable for fast tests (test seam only; defaults hardcoded).
- **Model** = `KIE_IMAGE_MODEL` (config, default `gpt-image-2-image-to-image`).
- **`ad_prompt` required** to render (the prompt + aspect come from it) → else `ValidationError`.
- **No new dependencies** (KIE is plain `fetch`).

## Contracts

`RenderRequest`: `{ adPrompt: AdPrompt, referenceAdImage: string, logoImage: string, productAsset?: string }`.
Response: `{ imageUrl: string }`.

## Request / response contract

| Condition | Status | Body |
|---|---|---|
| No / invalid / unapproved token | 401/403 | auth error |
| Missing/malformed body, or no `ad_prompt` | 422 | `ValidationError` |
| KIE upload / createTask / poll failure, task `fail`, or timeout | 502 | `KieError` (`stage: "render"`) |
| Success | 200 | `{ imageUrl }` |

## Verification

- **Unit — `services/kie.ts`** (fetch mocked): `uploadBase64` strips the data-URL prefix,
  returns `downloadUrl`, throws `KieError` on failure; `createTask` posts `model` + `input`,
  returns `taskId`, throws when `code !== 200`; `pollResult` parses `resultJson.resultUrls`,
  returns `state`, throws on HTTP error.
- **Unit — pipeline** (kie service mocked): malformed request / missing `ad_prompt` →
  `ValidationError` before any call; happy path uploads reference+logo, createTask, poll
  success → first URL; product asset → third upload; aspect derived from canvas;
  processing-then-success polls twice; `fail` → `KieError`; timeout → `KieError`; upstream
  upload/create error → `KieError`.
- **Route** (pipeline + supabase mocked): 401 without token; 200 `{ imageUrl }` approved;
  `ValidationError`→422; `KieError`→502 with `stage: "render"`.
- **Manual run script** (`run-render.ts`): ad-prompt JSON + reference + logo (+ asset) files →
  real KIE render → prints the image URL. Requires `KIE_API_KEY` + image files.
- **Gated real e2e** (`BYA_E2E=1` + `KIE_API_KEY` + `BYA_REF_AD_PATH`/`BYA_LOGO_PATH`):
  one real render; skipped by default.

## Self-review (spec)

Covers the master spec's `[4] RENDER` row: AdPrompt + reference + logo + optional asset →
KIE upload→createTask→poll→image URL, aspect auto-detected, resolution config-driven, typed
`KieError`, gated endpoint, bounded polling. Defers Supabase storage / signed URLs / `id` /
library persistence to Plan 5, consistent with the build order.
