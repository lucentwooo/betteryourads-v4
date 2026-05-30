# Manual checks — Spec #5 (Quotas & Per-Brand)

## Schema / migrations
- None. (Logo reuses `brand_assets` kind='logo'; ad scoping uses existing joins.)

## Environment variables
- **`GENERATION_TZ`** — default `Australia/Sydney`. The daily creative quota resets at local
  midnight in this zone. Set/confirm on the backend (and deploy env).
- **`DAILY_GENERATION_LIMIT`** — default `10`. Per-user daily creative cap (admin unlimited).

## Ops dependency
- **CORS on the `brand-assets` Supabase Storage bucket** must allow the app origin — the workbench
  pre-fills the saved logo by fetching its signed URL in the browser and converting to a data URL.
  If logo pre-fill silently fails, check the bucket CORS config. (Reads/writes are RLS-scoped to
  the user's `<uid>/` prefix already.)

## Click-through smoke (verify manually)
- **Quota:** generate up to the limit → further renders/batches are blocked with a clear message;
  the "X of Y creatives left today" count shows on the board + workbench; admin is unlimited.
  (Confirm reset behavior around AEST midnight, or temporarily set `DAILY_GENERATION_LIMIT=1`.)
- **Scoping:** open `/library?brandId=<id>` (or a brand from the rail) → only that brand's ads;
  `/library` (no brandId) → all ads grouped by brand hostname.
- **Per-brand logo:** upload a logo on the board → it appears as the brand's logo; start an ad for
  that brand → the workbench logo is pre-filled (no re-upload), still overridable per concept.

## Known limitations (acknowledged in review)
- **TOCTOU:** two simultaneous `POST /api/batch` requests can each pass the quota check before
  either completes, marginally exceeding the daily cap. Low impact at current scale; would need a
  DB-level counter to fully close.
- The `brand_assets.brand_id` FK was authored against the pre-rename `brands` table; Postgres
  follows it by OID so it works at runtime — just don't re-run the baseline migration from scratch.
