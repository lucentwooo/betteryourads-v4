# Backend Read Endpoints — Design

**Date:** 2026-05-28
**Branch:** `feature/backend-read-endpoints` (worktree `C:/Users/jerem/worktrees/bya-backend-reads`, off `feature/jerey-refactor`)
**Status:** Approved (autonomous build authorized); pending implementation plan

## Context

Plan 5 wired persistence (tables `brand_extractions`, `ad_prompts`, `generated_ads`; storage
bucket `ads` with signed URLs). The frontend reads persisted data **through the backend API**
(decided for the web-frontend track), but the backend exposes only the four pipeline POSTs +
`/api/config` — no list/read endpoints. This slice adds them so the frontend's Library, Home,
and saved-brand-reuse screens (Slice D) have real endpoints + typed contracts to build against.

## Endpoints (all `GET`, all behind `requireApprovedUser`, all user-scoped)

| Method/Path | Response | Purpose |
|---|---|---|
| `GET /api/brands` | `BrandSummary[]` | list the user's saved brand extractions (saved-brand reuse, home) |
| `GET /api/brand/:id` | `BrandDetail` (404 if absent) | load one saved brand to reuse without re-analyzing |
| `GET /api/ads` | `AdSummary[]` | the library — the user's generated ads with fresh signed image URLs |

All scoped by `req.user.id` (service-role client bypasses RLS, so every query filters
`user_id` explicitly — matching the existing `getBrandExtraction`/`getAdPrompt` pattern).

## Contracts (new `packages/shared/src/library.ts`, exported from `index.ts`)

```ts
BrandSummary = { id: string; websiteUrl: string; updatedAt: string }
AdSummary    = { id: string; imageUrl: string; aspectRatio: string | null; resolution: string | null; createdAt: string }
BrandDetail  = { id: string; brandExtraction: BrandExtraction; measuredSiteData: unknown }
```

`imageUrl` in `AdSummary` is a freshly-signed URL (7-day TTL, the existing
`SIGNED_URL_TTL_SECONDS`). `BrandDetail.measuredSiteData` is `unknown` (stored as opaque jsonb,
same as the `BrandRequest` contract) so the frontend can feed it straight back into
`/api/ad-prompt` flows when reusing a saved brand. **Brand name is intentionally NOT in
`BrandSummary`** — the frontend shows the domain from `websiteUrl`; pulling the full `analysis`
blob per row just for a name isn't worth it now (can be added later).

## Service additions (`apps/backend/src/services/supabase.ts`)

- `listBrandExtractions(userId)` → `BrandSummary[]` — select `id, website_url, updated_at`,
  order by `updated_at` desc.
- `getBrandDetail(id, userId)` → `BrandDetail | null` — select `id, analysis, measured_site_data`;
  `safeParse` the analysis (return null on parse failure, consistent with `getBrandExtraction`).
- `listGeneratedAds(userId)` → `AdSummary[]` — select `id, image_path, aspect_ratio, resolution,
  created_at` desc; sign each `image_path` via `storage.from("ads").createSignedUrl(...)`; skip
  any row that fails to sign (don't fail the whole list).

Row narrowing follows the file's existing pattern (typed cast on untyped Supabase rows, as in
`assemblePerformanceMemory`). Failures throw `PersistenceError` (mapped to 500), except absent
single-row lookups which return `null` (→ 404 in the route).

## Routing (`apps/backend/src/routes/library.ts`, mounted `app.use("/api", libraryRouter)`)

Thin handlers mirroring the existing route files: call the service, `res.json(...)`; on the
`/brand/:id` null case return `404 { error: { code: "NOT_FOUND", message } }`; wrap in the
shared `toHttpError` catch.

## Testing

`apps/backend/tests/library.routes.test.ts` — supertest against `createServer()`, mocking
`../src/services/supabase.js` (the auth pair + the three new functions), following the existing
`tests/routes.test.ts` style:
- `GET /api/brands`: 401 without token; 200 returns the list for an approved user.
- `GET /api/brand/:id`: 404 when the service returns null; 200 with the detail when found.
- `GET /api/ads`: 200 returns the list (signed URLs already baked by the service mock).

Service functions are thin Supabase queries (brittle to unit-test against a mocked client);
they're covered indirectly by the route tests and exercised for real in the integration E2E.

## Out of scope

- Domain grouping / brand-name enrichment on list rows (frontend groups by `websiteUrl`).
- Pagination (user brand/ad counts are small; add when needed).
- Any write/delete endpoints. Performance-tag editing.
- Frontend consumption — Slice D, at integration.
