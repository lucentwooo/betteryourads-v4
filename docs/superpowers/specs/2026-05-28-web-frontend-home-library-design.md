# Web Frontend — Home + Library + Saved-Brand Reuse — Design

**Date:** 2026-05-28
**Branch:** `feature/web-frontend` (now rebased onto Plan 5 + backend read endpoints)
**Status:** Approved (autonomous build authorized); pending implementation plan
**Builds on:** Foundation, Workbench, Auth slices

## Context

The frontend branch is now rebased onto the backend line, so the real read endpoints
(`GET /api/brands`, `/api/brand/:id`, `/api/ads`) and their `@bya/shared` contracts
(`BrandSummary`, `AdSummary`, `BrandDetail`) are available. This final slice builds the
persistence-backed screens against them: the **Home dashboard**, the **Library**, and
**saved-brand reuse**, and reorganizes routing so the Workbench launches from Home.

## API client additions (`apps/web/src/api/client.ts`)

```ts
getBrands() → BrandSummary[]            // GET /api/brands
getBrand(id) → BrandDetail              // GET /api/brand/:id
getAds() → AdSummary[]                   // GET /api/ads
```

Also reconcile the existing `brand()` return type to `{ id: string; brandExtraction: BrandExtraction }`
(the backend now returns `id` after Plan 5). `render()` already tolerant (`{ imageUrl }` is a
subset of the backend's `{ id, imageUrl }`); leave as-is or add `id?` — additive only.

The `request()` helper already issues GET when no body is passed, so the read functions are
one-liners. `getBrand` builds the path with the id.

## Routing (reorganized)

| Path | Screen |
|---|---|
| `/` | **Home** dashboard |
| `/create` | **Workbench** (was at `/` in Slice C) |
| `/library` | **Library** |

`AppShell` rail nav: Home, Library (+ a "Make an ad" affordance → `/create`). Slice C's
Workbench moves from `/` to `/create`; the route swap is the only Workbench change besides the
preset support below.

## Screens

### Home (`apps/web/src/home/Home.tsx`)
- Greeting (time-of-day + email from `useAuth`).
- Primary CTA "Make today's ad" → `/create`.
- Stats: count of saved brands (`getBrands().length`) and total ads (`getAds().length`).
- Recent ads: first ~4 from `getAds()` (thumbnail via signed `imageUrl` + `createdAt`).
- Saved brands: list from `getBrands()`, each a pill linking to `/create?brandId=<id>` (reuse).
- Loads `getBrands()` + `getAds()` on mount; loading + empty states.

### Library (`apps/web/src/library/Library.tsx`)
- Loads `getAds()` on mount; renders a responsive grid of ad cards (signed `imageUrl`,
  `aspectRatio`, `createdAt`); each image links/opens in a new tab. Empty state "No ads yet —
  generate one →" linking to `/create`. (Domain grouping deferred — `AdSummary` carries no
  website url yet.)

### Saved-brand reuse (Workbench preset)
- `Workbench` reads `?brandId=` via `useSearchParams`. On mount, if present, calls
  `getBrand(id)` and dispatches a new `PRESET_BRAND` reducer action → jumps straight to
  `pick-ref` with the loaded `brandExtraction` (skips analyze; no `measuredSiteData` needed
  downstream — ad-prompt/render use `brandExtraction` only). On `getBrand` failure → `FAILED`.

## Reducer change (`apps/web/src/workbench/state.ts`)

Add `{ type: "PRESET_BRAND"; brandExtraction: BrandExtraction; url?: string }` →
`{ ...initialState, stage: "pick-ref", brandExtraction: action.brandExtraction, url: action.url ?? "" }`.
This avoids casting the `unknown` `measuredSiteData` from `BrandDetail` into `MeasuredSiteData`
(it isn't used past the analyze step).

## Testing

- API client: `getBrands`/`getAds` GET the right paths; `getBrand(id)` builds `/api/brand/:id`
  (extend `client.test.ts`).
- Reducer: `PRESET_BRAND` → pick-ref with brandExtraction (extend `state.test.ts`).
- Home: mock `api` + `useAuth`; renders stats, recent ads, and brand pills from mocked data;
  CTA + brand pills have correct hrefs; empty state when no data.
- Library: mock `api`; renders ad grid from mocked `getAds`; empty state.
- Workbench preset: mock `api.getBrand` + render at `/create?brandId=b1` (MemoryRouter); asserts
  it lands in pick-ref showing the loaded brand.

## Out of scope

- Domain grouping in the library; ad deletion; performance-tag editing; "ship to Meta".
- Angle variations (still no backend endpoint).
- Real E2E against live Supabase — documented as a manual owner step (needs `.env` +
  `supabase db push` to apply Plan 5 migrations).
