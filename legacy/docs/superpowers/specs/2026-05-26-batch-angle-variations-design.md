# Batch angle variations (Phase 1)

**Date:** 2026-05-26
**Branch:** feature/auth-and-saving
**Status:** Approved, implementing

## Goal

Help the user test many ad **angles** for message-/product-market fit. From one
reference + brand, produce N variations that keep the format/structure/brand
identical and vary only the **angle → headline (+ subheadline)**, optionally with a
small mascot-expression note. Select which to render, generate them concurrently,
and view a results grid to judge consistency and pick winners.

Per the user: angle ≈ copy. The angle drives the headline; the visual format stays
the same (at most the mascot's pose/expression shifts with the mood).

## Decisions

- **Phase 1 only:** one reference, N angle/copy variations. No multi-format (Phase 2
  = multiple references), no angles×formats matrix (Phase 3).
- **Placement:** off the base prompt. User runs Stage 2 once to get the base
  ad_prompt (in the Stage 3 prompt box), then clicks "Generate N angle variations."
- **Cards:** each variation card shows angle label + editable headline + checkbox;
  "Generate selected" batch-renders the checked ones.
- **Count:** default 5, selector 3–8.
- **No server changes.** The existing `/chat`, `/kie/generate`, `/kie/result`, and
  `/library/ads` endpoints cover everything; batch is N browser-side calls.
- **Consistency by construction:** base structure generated once; only copy fields
  are swapped per variant — not relying on the model to "remember" the layout.

## Data flow

```
reference + brand
  -> Stage 2 (existing) -> base ad_prompt (locks format/brand/layout)
  -> generateAngles(base copy + brand, N) -> [{angle, headline, subheadline?, visual_note}]
  -> buildVariantPrompt(base, variation) x N -> N full ad_prompts
  -> user selects -> batchGenerate(selected) -> N concurrent KIE renders
  -> results grid + auto-save each to Library (with angle label)
```

## Components (index.html, client-side)

1. **`generateAngles(baseCopy, brandJson, n)`** — one text-only `/chat` (stage 2)
   call. Prompt asks for N DISTINCT angles spread across pain / outcome / promise /
   proof / objection / status / urgency, each returning `{angle, headline,
   subheadline (only if base has one), visual_note}`. Only brand-supported claims.
   Returns parsed array.
2. **`buildVariantPrompt(baseAdPromptObj, variation)`** — clones the base ad_prompt,
   overwrites `copy.headline` / `copy.subheadline`, and appends a belt-and-suspenders
   directive string after the JSON: `VARIATION DIRECTIVE: headline = "…"; subheadline
   = "…"; <visual_note>. Keep everything else identical.` (Guards against stale
   headline text lingering in `elements[]`.)
3. **`renderVariationCards(variants)`** — a grid of cards: angle label, editable
   headline (and subheadline if present), checkbox. "Select all" + "Generate
   selected (N)".
4. **`runKieGeneration(promptText)`** — refactor of the generate+poll core out of
   `generateImage()`; returns `{ ok, urls, error }`. Both single-image and batch use
   it.
5. **`batchGenerate(selectedVariants)`** — concurrency pool (max 3 in flight) calling
   `runKieGeneration` per variant; updates each result tile's status
   (queued/generating/done/failed); saves each success to Library with its angle.
6. **`renderResultsGrid(items)`** — tiles with per-item status + image + link.

## UI placement

In the Stage 3 area, below the prompt box: a "Variations" block with a count
selector + "Generate N angle variations" button, the cards grid, and the results
grid. Hidden/empty until used; does not disturb the existing single-image flow.

## Out of scope (future)

- Phase 2: multiple reference formats; batch across them.
- Phase 3: angles × formats matrix board.
- Aspect-ratio variation; per-variant logo/reference overrides.

## Verification

- Inline `<script>` parses (Function-constructor check).
- Headless load: no JS errors; new controls present.
- Manual: run base Stage 2, generate 5 angles, confirm headlines differ and
  structure/brand identical; select 2–3, batch generate, confirm grid + Library save.
