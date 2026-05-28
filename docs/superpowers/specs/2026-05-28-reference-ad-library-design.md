# Reference Ad Library — design

**Date:** 2026-05-28
**Status:** Approved (design)
**Branch:** dev

## Problem

Today, creating an ad requires the user to **upload** a reference ad (Stage 2, required) that
the image generator copies for layout/composition. Two prompt variants already exist —
`IMAGE_GENERATOR_V4_W_ASSET` and `IMAGE_GENERATOR_V4_NO_ASSET` — selected automatically by
whether a `productAsset` is present. Users have to find a good reference themselves, and a
reference that wasn't designed around a product slot makes asset-based generations "stuff up."

## Goal

Give users two curated **reference ad libraries** to pick from instead of hunting for a file:

- **With product asset** — references designed to feature a product image.
- **No product asset** — references that don't use a product image.

Uploading a one-off reference stays available as a fallback.

## Decisions (from brainstorming)

- **Source:** curated by admin **+** users may still upload their own.
- **Curation:** an **admin upload UI** (lives in the existing admin dashboard).
- **Library switching:** **auto, follows product-asset state** — show the with-asset library
  when a product asset is present, otherwise the no-asset library.
- **Organization:** **flat grid of thumbnails**, optional label per item. No tags, no
  per-user libraries, no reordering (YAGNI — can extend later).
- **Stage 2 layout:** **library first, upload secondary** — grid is prominent; "upload your
  own instead" is a smaller secondary option.
- **Hint:** even though switching is automatic, surface a line telling the user a different
  library appears when a product asset is added.

## Architecture

### Storage

- New private Supabase Storage bucket **`reference-ads`**.
- Object paths: `with-asset/<uuid>.png`, `no-asset/<uuid>.png`.
- Curated/global — **not** namespaced per user (unlike the `ads` bucket).

### Database

New table **`reference_ads`**:

| column        | type        | notes                                            |
|---------------|-------------|--------------------------------------------------|
| `id`          | uuid PK     | `default gen_random_uuid()`                       |
| `variant`     | text        | check in (`'with_asset'`, `'no_asset'`)          |
| `label`       | text null   | optional display name                            |
| `storage_path`| text        | path within the `reference-ads` bucket           |
| `created_at`  | timestamptz | `default now()`                                  |
| `created_by`  | uuid null   | admin who uploaded (auth user id)                |

RLS:
- `SELECT`: any approved user (matches how other read endpoints gate). Writes never happen
  through the anon/user key.
- `INSERT`/`DELETE`: performed server-side with the service-role key via the admin route, so
  no user-facing write policy is needed.

Migration is **authored as a file in `supabase/migrations/`** and applied **by hand** (SQL
pasted into the Supabase dashboard), per project rule. Idempotent where possible
(`create table if not exists`, `drop policy if exists` then `create`). Bucket creation SQL
(or a dashboard step) included in the hand-off notes.

### Shared (`@bya/shared`)

- `ReferenceAdVariant = 'with_asset' | 'no_asset'`.
- `ReferenceAd` type / zod schema: `{ id, variant, label, url, createdAt }` (`url` = signed URL
  returned to the client; `storage_path` stays server-side).

### Backend (`@bya/backend`)

New router `reference-ads.ts` (read) + admin endpoints (mirrors `admin.ts` pattern):

- `GET /api/reference-ads?variant=with_asset|no_asset` — `requireApprovedUser`. Lists rows for
  the variant, each with a signed URL. Validate the `variant` query param.
- `POST /api/admin/reference-ads` — `requireApprovedUser` + `requireAdmin`. Accepts an image
  (base64 data URL, consistent with how the app already moves images) + `variant` + optional
  `label`. Uploads to the bucket, inserts the row, returns the created `ReferenceAd`.
- `DELETE /api/admin/reference-ads/:id` — `requireApprovedUser` + `requireAdmin`. Deletes the
  storage object then the row.

New service functions in `services/supabase.ts`: `listReferenceAds(variant)`,
`createReferenceAd({ variant, label, dataUrl, createdBy })`, `deleteReferenceAd(id)`.

### Admin UI (`apps/web/src/admin/AdminDashboard.tsx`)

Add a **Reference ads** section to the dashboard (alongside Accounts):

- Two tabs: **With product asset** / **No product asset** (the two variants).
- Flat thumbnail grid of that variant's references.
- **Upload** button (file → base64 → `POST /api/admin/reference-ads`), optional label field.
- Per-item **delete** with confirm.
- Reuses existing admin styles (`admin-table`, badges, modal scrim) where sensible.

### Workbench (`apps/web/src/workbench/`)

In Stage 2's `PickRef`, the reference-ad slot becomes **library-first**:

1. **Library grid (primary):** fetches `GET /api/reference-ads?variant=…` where variant is
   derived from whether `productAsset` is set in workbench state. Clicking a thumbnail fetches
   that image and sets `refImage` as a base64 data URL — **the same shape the upload already
   produces**, so Stage 2 (`/api/ad-prompt`) and Stage 3 (`/api/render`) need **no changes**.
2. **Upload (secondary):** the existing `Dropzone` stays, presented as a smaller "upload your
   own instead" affordance below the grid.
3. **Hint line** above the grid, contextual on product-asset state:
   - no asset: *"Showing references that don't use a product image. Add a product asset to
     unlock references built around your product."*
   - with asset: *"Showing references designed to feature your product asset."*

Selecting a library reference and selecting an uploaded file are mutually exclusive for the
`refImage` slot (last action wins) — both ultimately just set `refImage`.

UI work uses the **ui-ux-pro-max** skill.

## Data flow

```
Admin: file → base64 → POST /api/admin/reference-ads → bucket + reference_ads row
User (Stage 2): productAsset? → variant → GET /api/reference-ads?variant
             → grid of signed URLs → click → fetch image → base64 → refImage
             → (unchanged) /api/ad-prompt → /api/render
```

## Error handling

- `GET /api/reference-ads` with a bad/missing `variant` → 400 validation error.
- Admin upload: reject non-image / oversized payloads with a clear message; on storage-upload
  failure, do **not** insert the row (no orphan rows).
- Admin delete: remove storage object then row; if the object is already gone, still remove the
  row (don't block on a missing file).
- Workbench: if the library fails to load, show an inline error and fall back to the upload
  option (user is never blocked from creating an ad).

## Out of scope (YAGNI)

- Tags / categories / search within a library.
- Per-user or per-brand reference libraries.
- Reordering / featured ordering.
- Migrating existing uploaded references into the library.

## Affected files

- `supabase/migrations/<ts>_reference_ads.sql` (new, hand-applied)
- `packages/shared/src/reference-ad.ts` (new) + export
- `apps/backend/src/routes/reference-ads.ts` (new) + admin endpoints (here or in `admin.ts`)
- `apps/backend/src/services/supabase.ts` (new functions)
- `apps/backend/src/app.ts` (mount router) — verify mount point
- `apps/web/src/api/client.ts` (new API methods)
- `apps/web/src/admin/AdminDashboard.tsx` (reference-ads section)
- `apps/web/src/workbench/PickRef`/`state.ts` (library picker + hint)
