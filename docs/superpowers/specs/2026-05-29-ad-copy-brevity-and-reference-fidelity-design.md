# Ad Copy Brevity & Reference Fidelity — Design

**Date:** 2026-05-29
**Status:** Approved for implementation

## Problem

Generated ads are visually dense and off-template compared to the reference ad they're
supposed to recreate. Using the Chirp reference (short, centered, airy, minimal screen) vs. the
three StatDoctor outputs, the concrete failures are:

1. **Headlines too long** — multi-sentence value props ("BUILT DIFFERENT. Built for doctors, by
   doctors. Not another middleman.") instead of short hooks. This is the root cause of the
   whole-ad density: too much text. Chirp works because the copy is short.
2. **Phantom subheadline** — a constant blue tagline ("Highest rates. Zero commission. Paid in
   48 hours.") appears on all three ads even though the reference has **no subheadline**.
3. **Layout not faithful to the reference** — outputs are left-aligned when the reference is
   centered; spacing/whitespace is cramped; the phone is oversized and stretched. The rule must
   be: **copy the reference** (center→center, left→left, match spacing and element sizing) — not
   a fixed layout.

## Root-cause map (verified against the code)

The rendered ad's text comes from three copy-producing places, and only one was patched:

| Symptom | Source | File / location |
|---|---|---|
| Long rendered headline | Selected board concept headline is rendered verbatim (BATCH path: `wb.angles = wb.selectedConcepts`) | `bya-pipeline.js` `generateConcepts` → `app.html:1143-1152` → `buildVariantPrompt:127` |
| Long headline (fallback path, no selection) | `generateAngles` has **zero** brevity rules | `bya-pipeline.js:283-322` |
| Phantom subheadline | Stage-2 emits a `copy.subheadline` though the reference has none; it rides along into every variant unchanged | `bya-prompts.js` STAGE2 text-budget (`:585-596`) → `buildVariantPrompt:129-134` |
| Left-align / cramped spacing / oversized phone | Stage-2 captures `layout.alignment/cropping/whitespace` and element sizing as JSON fields but does not *force faithful reproduction*; GPT-Image-2 ignores nested JSON and defaults to left-align + canvas-fill + enlarged hero object | `bya-prompts.js` STAGE2 layout (`:651-684`, schema `:905-918`) + Stage-3 KIE prompt |

**Note on aspect ratio:** the reference is 600×600 (1:1), identical to the output canvas — so
aspect ratio is **not** a cause and is explicitly out of scope.

## Scope

In scope (prompt-only, no new pipeline stages):

1. **Brevity across every copy path** — strengthen `generateConcepts`, add the same discipline
   to `generateAngles`, and reinforce it in Stage-2's base copy.
2. **Kill the phantom subheadline** — make Stage-2's "subheadline only if the reference has one"
   a hard, unmissable gate, plus a programmatic safety net.
3. **Faithful layout reproduction** — Stage-2 must reproduce the reference's alignment, spacing/
   whitespace, and element sizing (esp. phone scale/crop), and emit a short, forceful natural-
   language ART DIRECTION string that the image model actually honors.

Out of scope (deferred):

- **Render → verify-against-reference → auto-retry loop** (the only true fix for image-model
  drift). User said "the rest are pretty okay" — revisit if Phases above don't hold.
- **Product-screen density** (dense real screenshot vs minimal reference screen). Density is
  being treated as a *copy* problem per user direction; screenshot cropping is deferred.
- **Aspect ratio / two-tone headline color** — not causes / by-design.

## Design

### Change 1 — Brevity in `generateConcepts` (strengthen existing)
`bya-pipeline.js`, the HEADLINE CRAFT block already added. Strengthen so it cannot be ignored:
move the hard constraints to the top of the prompt's output instructions, keep the banned-verb
list and calibration examples, and keep the self-revise step. Strong guidance, rhythm exceptions
allowed (per earlier decision) — not a hard cap.

### Change 2 — Brevity in `generateAngles` (new)
`bya-pipeline.js:283-322`. Add a compact HEADLINE CRAFT block mirroring `generateConcepts`:
2–6 words / ~40 chars strong target, one idea, banned filler-verb openers, lead with benefit/
number/tension/customer language, self-revise before emitting. Applies to the `headline` (and
`subheadline` when present) fields.

### Change 3 — Subheadline hard gate (Stage-2)
`bya-prompts.js` text-budget section (`:585-596`). Elevate the existing rule into an explicit
gate: if the reference has no subheadline, `copy.subheadline` MUST be `""` — never a brand
tagline, never a value prop. Add a sibling boolean to the `ad_prompt` output
(`reference_has_subheadline`) so the client can enforce it.
**Safety net:** in `prepareStage3` (or `buildVariantPrompt`), if `reference_has_subheadline`
is false, force `copy.subheadline = ""`. This guarantees the phantom subheadline cannot render
even if the model disobeys.

### Change 4 — Faithful layout + forceful art direction (Stage-2)
`bya-prompts.js` STAGE2 layout analysis (`:651-684`) and the final KIE-facing prompt.
- Reframe alignment/spacing/sizing as **"reproduce the reference exactly"**: match its text
  alignment (centered→centered, left→left), its negative space / margins, and its element
  proportions — specifically the device's on-canvas scale and crop (e.g. "the reference shows
  only the top third of the phone with generous whitespace above; reproduce that scale and
  crop").
- Emit a short, plain-language **ART DIRECTION** line (1–3 sentences) appended to the KIE prompt
  that restates the few highest-leverage spatial facts in prose, because image models follow
  forceful prose far better than nested JSON: alignment, device scale/crop, and "keep generous
  negative space; do not enlarge the product to fill the canvas."

## Testing

Manual, against the same brand (research is cached, so iteration is fast):
1. Hard-refresh the app (`Cmd+Shift+R`) so the new client JS loads.
2. On the concept board, click **↻ regenerate** → confirm headlines are short (2–6 words,
   single idea, no banned-verb openers).
3. Select 1–2 concepts, render → confirm: short headline on canvas, **no** subheadline (for a
   no-subheadline reference like Chirp), alignment matches the reference, phone is reasonably
   sized with breathing room.
4. Spot-check the fallback path (render without pre-selecting concepts) for the same brevity.

No automated tests exist in this repo (per CLAUDE.md). Verification is visual.

## Risks

- **Image-model disobedience** — Phase-4 (verify loop) is the real fix; prompt-only changes
  reduce but won't eliminate layout drift. Set expectations accordingly.
- **Over-tightening copy** — strong-guidance-not-hard-cap framing preserves rhythmic headlines
  like "No agencies · zero commission · keep 100%".
