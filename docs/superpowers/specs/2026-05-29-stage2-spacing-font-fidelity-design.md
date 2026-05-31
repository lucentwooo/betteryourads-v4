# Stage 2 spacing + font fidelity — design

**Date:** 2026-05-29
**Branch:** ad-copy-brevity-reference-fidelity
**Status:** approved, ready to implement

## Problem

Generated ads (KIE `gpt-image-2-image-to-image`, fully generative) drift from the
reference in two visible ways:

1. **Spacing is loose** — headline-to-visual gap, element scale, and margins don't match
   the reference's composition.
2. **Typography isn't faithful** — the headline/logo read as an approximation of the brand
   font rather than the brand font, even when the reference is the brand's own ad.

Root cause: the render is fully generative, so the **reference image is the strongest
spacing/typography signal available**, but the `art_direction` prose that drives layout is
only asked for as a loose "1–3 sentence" vibe, and the typography instruction always tells
the model to *describe/substitute* a font — even in the same-brand case where it should just
copy the reference's letterforms.

## Constraints (hard)

- **Keep the architecture.** Stage 1 (brand DNA) → Stage 2 (reference breakdown) → Stage 3
  (personalized recreation) stays exactly as built. No slimming the JSON spec, no structural
  change, no compositing, no model swap. See memory `pipeline-architecture-is-intentional`.
- **Stay fully generative.** No deterministic text/logo overlay.
- **Additive only.** No removal of fields or behavior; both edits are prose-only and capped so
  they cannot run away.

## Non-goals / accepted ceiling

Fully-generative rendering cannot produce a pixel-exact brand font (especially for a
different-brand reference or an exotic typeface) and will still partially redraw the logo.
These edits raise fidelity meaningfully but do not eliminate that ceiling. Compositing is the
only thing past it and is explicitly out of scope.

## Design

Two **additive prose edits** in `bya-prompts.js`, plus a version bump. No edits to
`bya-pipeline.js` or `server.js`.

Why no code change: `prepareStage3` and `withProductFidelity` already hoist `ad_prompt.art_direction`
to the top of the render prompt for both the base render and copy/color variants, and
`buildVariantPrompt` clones it forward. Enriching the *content* of `art_direction` therefore
flows through the existing plumbing automatically.

### Edit 1 — `art_direction` instruction (~line 607): make it measured

Change the instruction so the model emits **approximate percentages read off the reference**
instead of a loose vibe, capped at 4 sentences so it can't balloon. It must state, as approx
% of canvas: (a) headline top margin, height share, alignment; (b) each major visual's
on-canvas scale, exact crop, vertical position; (c) gap between stacked elements; (d) margins
to preserve.

### Edit 2 — typography block (~lines 563–568): add the same-brand shortcut

Add one bullet at the **top** of the typography block (replacing nothing): instruct the model
to first compare the reference's visible letterforms to `visual_brand_system.typography`. If
they match (the reference is the brand's own ad), **replicate the reference's exact letterforms**
and record that in `typography_relationship` instead of substituting a font. If they differ,
fall through to the existing swap-to-brand-font path unchanged.

### Edit 3 — bump `STAGE2_PROMPT_VERSION`

`"5"` → `"6"`, per the existing convention of versioning prompt changes.

## Risk

- Edit 1: only failure mode is an over-long/over-prescriptive string — mitigated by the hard
  ≤4-sentence cap. Writes to an already-consumed field; cannot break the pipeline.
- Edit 2: guidance only, evaluated from images the model already receives. Worst case it is
  ignored and behavior matches today.
- Untouched: subheadline gate, `reference_has_subheadline`, product-fidelity logic.

## Verification

Manual: regenerate the Chirp ad (same-brand reference) and a different-brand reference, and
eyeball spacing/type fidelity against the reference vs. the current output. No automated tests
exist in this repo.
