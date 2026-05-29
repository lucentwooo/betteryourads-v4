# Make brand DNA authoritative in the Stage 2 prompt

**Date:** 2026-05-26
**Branch:** feature/auth-and-saving
**Status:** Implemented (prompt-only; `STAGE2_PROMPT_VERSION` bumped 2 → 3)

## Problem

Generated ads (Chirp test, Exact and Vibe) ignore the brand's visual identity:
the brand font isn't used, colors aren't applied well, and the result looks like
generic green-gradient "AI SaaS slop." The brand vibe should dominate the output.

## Root cause

Stage 1 already extracts rich brand DNA (exact hex colors, font families, ui_style,
mood) and that JSON is passed to Stage 2 as `BRAND_EXTRACTION_JSON`. The data is
fine. The problem is the Stage 2 prompt treats the **reference ad as the authoritative
look** and the brand as a surface swap, so the model anchors on the reference + its
own generic-SaaS priors instead of the brand.

(Separately: the image model is never fed a *picture* of the brand — only the
reference ad + logo. Feeding a brand visual anchor is the strongest lever but was
deferred. This spec is **prompt-only**, no pipeline/code change.)

## Decisions

- **Prompt-only** for now. No overlay, no visual anchor, no pipeline change.
- **Single AI image** retained; we explicitly name + describe the brand font and
  trust GPT-Image-2 to render it (good enough for common fonts; approximate for
  proprietary ones).
- **Brand look is authoritative in BOTH Exact and Vibe modes.** The Exact/Vibe
  toggle controls only how closely we follow the reference's *layout* — never its
  colors or fonts.

## Changes (all within `index.html`: `STAGE2_PROMPT` + `STAGE2_MODE_RULES`)

1. **Top-priority directive:** reference ad = structure/composition only ("the
   breakdown"); ALL color, typography, shapes, texture, lighting, finish, and mood
   come from the brand's visual system. On conflict, the brand always wins.
2. **Typography:** render all visible text in the brand's actual font from
   `visual_brand_system.typography.font_families`, named explicitly and reinforced
   with the brand's heading/body style + casing. Forbid generic default sans-serif.
3. **Color:** use ONLY the brand's extracted hex values; write those exact hexes
   into the generated `ad_prompt` color fields. No invented/off-brand colors.
4. **Vibe / ui_style:** corner radius, shadow style, icon style, card style,
   illustration style, and overall mood from Stage 1 drive every shape/card/icon.
5. **Anti-slop negatives:** generic glassmorphism, random/rainbow gradients, default
   "AI SaaS" aesthetic, off-brand colors, generic Helvetica/Arial-looking text when
   a brand font is named.
6. **Mode clarification:** both `STAGE2_MODE_RULES.exact` and `.vibe` state the
   brand look is authoritative; modes govern layout fidelity to the reference only.
7. **Checklist additions:** every color from the brand palette? all text in the
   brand font? look matches the brand's mood, not a generic AI aesthetic?

## Out of scope (possible follow-ups)

- Visual brand anchor (feed brand website screenshot/swatch to the image model).
- Real-font text overlay / compositing.
- Improving Stage 1 brand extraction.

## Verification

- Inline `<script>` still parses (Function-constructor check).
- Headless load: no JS errors; bump `STAGE2_PROMPT_VERSION` so the new prompt
  replaces any stale cached copy.
- Manual: regenerate the Chirp Exact/Vibe comparison and confirm brand font +
  palette + mood are visibly applied.
