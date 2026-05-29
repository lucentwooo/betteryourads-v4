# Spec #6 — Admin Reference Ads (bulk) + Cleanup

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Depends on:** Specs #1–#5. **Status:** Design. **This is the final spec.**

## Goal

1. Make the admin **reference-ads** upload a **bulk drag-and-drop** (drop N files → all upload),
   with **no per-file label**.
2. **Remove all now-unused files** across the project after the refactor.
3. Produce the single consolidated **`docs/superpowers/MANUAL-CHECKS.md`** (the program's final
   deliverable), aggregating every per-spec manual-checks note.

## Scope

### 1. Bulk reference-ads upload (no label)

- Web: replace the Spec #1 `/admin/reference-ads` stub with the real admin screen, restyled to
  legacy. Two variant tabs ("with product asset" / "no product asset"). A **drag-drop zone that
  accepts multiple files**; dropping (or selecting) N images uploads all of them to the active
  variant — no label input. Thumbnail grid with delete (legacy/confirm pattern).
- Backend: `reference_ads.label` is already nullable, so **no migration**. Update the upload path
  to accept a batch — either `POST /api/admin/reference-ads` called once per file by the client, or
  a new `POST /api/admin/reference-ads/bulk` accepting `{ variant, dataUrls: string[] }`. Prefer
  per-file calls (simplest, reuses the existing endpoint with `label: null`); choose at plan time.
- The `label` field stops being collected in the UI; existing labels remain harmless.

### 2. Cleanup — remove unused files

After Specs #1–#5, sweep the repo for files no longer referenced and delete them. Candidates
(verify each is truly unimported before deleting):
- Orphaned SPA artifacts not already removed (any leftover from the Vite app).
- Dead concept code/schema remnants if any slipped past Spec #2.
- Unused `react-router-dom` remnants (dependency removed in Spec #3 — confirm zero imports).
- Any `apps/web` components/util/tests that nothing imports after the rebuild.
- Unused exports in `packages/shared` (e.g. types only the old concepts flow used).
- **`legacy/` is reference-only and untracked — leave it** unless the owner says otherwise (flag,
  don't delete).
Method: build + typecheck + test must stay green after each removal; use import-graph checks
(grep for the symbol/file) before deleting. Update `docs/FEATURES.md` for anything removed.

### 3. Final MANUAL-CHECKS.md

Create `docs/superpowers/MANUAL-CHECKS.md` aggregating `docs/superpowers/manual-checks/spec-0*.md`
into one owner-facing checklist, organized as: Migrations (SQL to paste, in order, + verify
queries) · Environment variables · Deployment notes · Click-through smoke tests · Behavior checks ·
Cleanup confirmation (list of removed files).

## Non-goals

- No new product features beyond bulk upload.
- No removal of `legacy/` or of applied migration files.

## Testing

- Web: dropping multiple files triggers an upload per file (or one bulk call) with `label: null`;
  grid reflects all; delete works. (Mock `api`.)
- Backend (if a bulk endpoint is added): validates `variant`, uploads each, returns created rows.
- Whole-repo: `npm run build` (web + backend) and `npm test` green after cleanup.

## Acceptance criteria

1. Admin can drag in multiple reference ads and they all upload with no label step.
2. Unused files are removed; build + typecheck + tests pass; `FEATURES.md` updated.
3. `docs/superpowers/MANUAL-CHECKS.md` exists and consolidates all manual steps.

## Manual checks (for final MANUAL-CHECKS.md — this spec writes that file)

- No schema/env changes for bulk upload (`label` already nullable).
- Confirm dropping 8 files uploads 8 reference ads.
- Review the removed-files list to confirm nothing needed was deleted.
- Decide whether to keep or delete `legacy/` (owner call).
