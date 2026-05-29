# Spec #5 — Quotas & Per-Brand Behavior

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Depends on:** Spec #1, #2, #3. **Status:** Design.

## Goal

Three related product behaviors:
1. **Daily quota:** 10 creative generations per user per day, **reset at AEST (Australia/Sydney)
   midnight**, with a visible **remaining-count** for normal users.
2. **Per-brand ad scoping:** "Your brands" (a selected brand) shows **only that brand's** ads;
   "My ads" shows **all** of the user's ads.
3. **Per-brand logo:** uploaded once on the concept-board page, **saved per brand** (in
   `brand_assets`, `kind='logo'`), and auto-loaded on the make-ad page so it isn't re-uploaded.

## Decisions (locked)

- Logo stored in **`brand_assets` (kind='logo')** — table + bucket exist; no schema migration
  (no CHECK constraint on `kind`).

## Scope

### 1. Daily quota with AEST reset + remaining UI

- Backend: the daily count currently uses a UTC day boundary. Port the legacy timezone logic
  (`legacy/usage.js` `startOfDayInTz` / `tzOffsetMs`) into the backend so "today" is computed in
  **`GENERATION_TZ` (default `Australia/Sydney`)**. The limit is **`DAILY_GENERATION_LIMIT`
  (default 10)**. Apply to `routes/render.ts` and `routes/batch.ts` enforcement and to
  `GET /api/usage` (`used / limit / remaining`, `unlimited` for admin).
- Web: show "X of Y creatives left today" (and a blocked state at 0) on the board and the workbench,
  reading `GET /api/usage` via the Spec #1 cache (`usage` resource). Refresh after a render/batch.

### 2. "Your brands" vs "My ads"

- `generated_ads` links to a brand via `ad_prompt_id → ad_prompts.brand_extraction_id`. Add the
  brand id to the ads query so each `AdSummary` carries `brandId`, and support
  `GET /api/ads?brandId=<id>` (server-side filter via the join). No migration (existing columns).
- Web: the **rail "your brands"** entries and the board's "my ads" link open the library scoped to
  that brand (`/library?brandId=…`), showing only its ads; the top-level **"my ads"** shows all.
  The cache keys ads by scope (`ads` all vs `ads:<brandId>`), each stale-while-revalidate.

### 3. Per-brand logo on the board

- Backend: `POST /api/brand/:id/logo` (body: data URL) uploads to the `brand-assets` bucket under
  the user prefix and upserts a `brand_assets` row with `kind='logo'` for that brand (one logo per
  brand — replace existing). `GET /api/brand/:id` (or the brand summary) returns the logo's signed
  URL. Reuses existing storage helpers + RLS.
- Web: the board page gains a logo dropzone; on upload it saves to the brand. The workbench
  pick-reference step **pre-fills** the logo from the saved brand logo (still overridable), so the
  user doesn't re-upload. Falls back to the existing site-logo auto-detect when no saved logo.

## Non-goals

- New concept logic (Spec #2) or workbench shell (Spec #3) — this spec adds quota/scoping/logo on
  top of them.
- Reference-ads admin (Spec #6).

## Architecture notes

- TZ math: port legacy `usage.js` as a small backend util (`services` or `lib`); unit-test DST
  edges. No new dependency (legacy did it with plain `Intl`/Date math).
- Ad→brand join lives in the existing supabase ads query (`services/supabase.ts` `listAds`); extend
  to select brand id and accept an optional `brandId` filter.
- Logo reuses `brand-assets` bucket + RLS already defined in `schema.sql`.

## Testing

- Backend: `startOfDayInTz('Australia/Sydney', ...)` boundary + DST; `countAdsToday` respects TZ;
  `/api/usage` shape (used/limit/remaining/unlimited); render/batch blocked at limit; admin
  unlimited. Ads query returns `brandId`; `?brandId` filters. Logo upload upserts kind='logo' and
  is returned on brand read. (Mock supabase/storage.)
- Web: usage badge renders remaining + blocked-at-0; library scoped by `brandId` shows only that
  brand's ads while unscoped shows all; board logo upload → workbench logo pre-filled.

## Acceptance criteria

1. Quota enforced per `GENERATION_TZ` day at `DAILY_GENERATION_LIMIT`; remaining-count visible;
   admin unlimited.
2. "Your brands" scope shows only that brand's ads; "My ads" shows all.
3. A logo saved on the board is reused on the make-ad page (no re-upload); stored in `brand_assets`.
4. `npm test` passes for web + backend.

## Manual checks (for final MANUAL-CHECKS.md)

- **Env:** set/confirm `GENERATION_TZ=Australia/Sydney` and `DAILY_GENERATION_LIMIT=10` on the
  backend (and the deployment env).
- No schema migration (logo reuses `brand_assets`; ad scoping uses existing joins).
- Click-through: generate to the limit → blocked; confirm reset behavior near AEST midnight (or by
  temporarily setting a low limit); scope a brand → only its ads; upload a logo on the board →
  appears pre-filled in the workbench.
