# Design: Reuse Saved Brand Instead of Re-analyzing

**Date:** 2026-05-25
**Branch:** `feature/auth-and-saving`
**Status:** APPROVED by user, ready to implement. NOT yet built.

## Goal

Avoid re-running the paid Stage 1 brand analysis when a website has already been analyzed
and saved for the current user. Reuse the saved breakdown instantly; only re-analyze when
the user explicitly asks.

## Behavior

On clicking **Send** (Stage 1) in `index.html`:
1. Normalize the typed website URL and look for a match among the user's already-loaded
   saved brands (the in-memory list populated by `loadBrands`).
2. **If a saved brand matches** (and the user did NOT request a forced refresh): load the
   saved `analysis` into the Stage 1 result without any network/AI call — set
   `lastStage1Output`, `currentBrandId`, update `localStorage`, call `setResult(...)` and
   `updateStage1Status()`, select the matching option in `brandSwitcherEl`. Show a note:
   `✓ Loaded your saved brand — no re-analysis needed.` followed by a clickable
   **"Re-analyze this site"** link. Then return early (skip `/extract` and `/chat`).
3. **If no match** (or forced refresh): run the existing analysis flow exactly as today
   (extract → 3 parallel agents → `saveBrand` upsert).

The **"Re-analyze this site"** link sets a `forceReanalyze = true` flag and re-invokes the
analysis path, which overwrites the saved brand via the existing upsert. Reset the flag to
`false` after a real analysis completes.

## Implementation notes (for the implementer)

- File: `index.html` only. Touch `send()` (~line 1279) and the brand-helper block added near
  the brand switcher (`loadBrands`, `saveBrand`, `brandSwitcherEl`).
- Add a module-scoped `let savedBrands = [];` and have `loadBrands` store the fetched rows
  into it (in addition to populating the dropdown), so `send()` can match without a refetch.
- Add a module-scoped `let forceReanalyze = false;`.
- Add a `normalizeUrl(u)` helper: prepend `https://` if no scheme, then return
  `hostname` (strip a leading `www.`) + `pathname` with any trailing slash removed, lowercased.
  Compare `normalizeUrl(typedUrl)` against `normalizeUrl(brand.website_url)`.
- The reuse note + "Re-analyze this site" link render into the existing `#result` area (or a
  small status line); the link's click handler sets `forceReanalyze = true` and calls `send()`.
- Keep it all client-side; no server or schema changes.

## Accepted trade-off

Matching is by normalized URL. If a site silently redirects to a different path than what was
saved, it may not be recognized as the same brand and will re-analyze (worst case: one extra
paid analysis, possibly a second brand row). Acceptable; the dropdown still lets the user pick
an exact saved brand. No change to `brands` uniqueness (still `user_id` + `website_url`).

## Out of scope (YAGNI)

- Server-side / post-`/extract` matching on the final (post-redirect) URL.
- Normalizing URLs at save time / de-duplicating existing brand rows.
- Any admin or bulk-management UI.

## Verification (manual; no test framework in repo)

1. Analyze a new site → saved + breakdown shown as today.
2. Click Send again on the same URL → saved breakdown loads instantly, with the reuse note;
   no "Analyzing (3 agents)…" step occurs.
3. Click "Re-analyze this site" → full analysis runs and overwrites the saved brand.
4. Analyze a different site → still analyzed fresh (no false match).
