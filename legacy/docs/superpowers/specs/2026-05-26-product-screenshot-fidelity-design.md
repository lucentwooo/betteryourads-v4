# Product-Screenshot Fidelity in the KIE Prompt — Design

**Date:** 2026-05-26
**Branch:** `feature/auth-and-saving`
**Status:** Approved design, ready for implementation plan

## Problem

When a user attaches a real product/UI screenshot (e.g. `brief-me.png`) as a
product asset and generates an ad, KIE (GPT-Image-2) ignores the screenshot and
draws an invented interface instead. In the reported case it rendered a
fictional "voice assistant" UI — an orange microphone, audio waveforms, and chat
transcript bubbles — none of which exist in the attached screenshot.

### Root cause

The screenshot is **attached as an image** to the KIE call (`productImages:
productAssetDataUrls` in `runKieGeneration`, line ~2324), but the **prompt text
never tells KIE to use it** — and on one path actively tells KIE to draw
something else. There are two KIE paths, and they differ:

| Path | Prompt builder | Tells KIE to use the screenshot? |
|---|---|---|
| **Single "Generate" button** — `generateImage()` (line ~2364) | Sends `stage3PromptEl.value` **raw** — the unmodified Stage 2 `ad_prompt` JSON loaded at `prepareStage3` (line ~1959) | **No.** The JSON says "draw a voice interface mockup." The screenshot is attached but unreferenced in text. |
| **Batch / angle variations** — `buildVariantPrompt` → `composeKiePrompt` (line ~2302) | Appends a fidelity directive after the JSON | **Partially** — but the appended directive contradicts the JSON body above it, and the longer/more-specific JSON wins. |

Both failures trace to the same source: the Stage 2 `ad_prompt` JSON contains an
**invented product-visual description** that survives into the KIE prompt:

- `ad_prompt.product_visual_direction.source_asset_to_use`: `"Birdie voice interface mockup (orange microphone + transcript examples)"`
- `ad_prompt.product_visual_direction.what_it_should_show`: `"Orange microphone symbol with transcript-like UI"`
- the product `elements[]` entry's `content.source_asset_to_use`: same invented mockup

The single path passes this JSON through untouched with **no** counter-directive.
The batch path appends a directive but never **removes** the contradiction. In
both cases KIE follows the detailed invented spec over the attached image.

A secondary leak: KIE also transcribed text ("Champion is Nick Reyes, CFO…") off
the **reference ad's own embedded phone screen**, because nothing forbids copying
the reference's screen contents.

## Goal

Make every KIE-bound prompt **clearly and non-contradictorily** instruct the
renderer to place the attached product screenshot into the product slot, when
(and only when) a product asset is selected. This tests the hypothesis that
GPT-Image-2 will reproduce the screenshot once the prompt unambiguously says to.

### Non-goals (YAGNI)

- No server-side image compositing.
- No HTML/CSS + Playwright deterministic rendering.
- No new dependencies.
- No change to how product assets are selected, saved, or transmitted (they
  already reach KIE as attached images).

## Design

### Single shared helper

Add one function that rewrites an `ad_prompt` object to point its product visual
at the attached screenshot, applied at **every** KIE call so both paths behave
identically.

```
applyProductAssetFidelity(adPrompt, assetCount) -> adPrompt (mutated/returned)
```

Behavior, only when `assetCount > 0`:

1. **Rewrite `product_visual_direction`:**
   - `source_asset_to_use` → `"THE ATTACHED PRODUCT/UI SCREENSHOT image(s), attached after the reference ad and logo. Use them exactly as provided."`
   - `what_it_should_show` → `"Exactly the attached product/UI screenshot, placed into the product slot."`
   - `visual_type` → `"attached real product screenshot"`
   - Preserve `treatment` placement/sizing language if present; otherwise leave it.
   - Leave the existing `avoid` text intact (it already forbids invented UI).

2. **Rewrite the product element in `elements[]`:**
   - Find entries where `type === "image"` and `name` does **not** match `/logo/i`
     (the logo element is handled separately and must be left untouched).
   - For each match, replace `content` with
     `{ source_asset_to_use: "ATTACHED_PRODUCT_IMAGE — use the real attached screenshot exactly; do not draw or invent any UI." }`
     and strip any invented mockup description.

3. **Guard `negative_prompt`** against reference-screen bleed: append
   `"do not copy, transcribe, or reproduce any UI, text, or screen contents from the reference ad's own device/screen — the only product screen shown is the attached screenshot."`

When `assetCount === 0`, the helper is a no-op (the existing abstract/iconic
behavior in the baked prompt is correct for the no-asset case).

### A prominent lead directive

In addition to mutating the JSON, prepend a short, high-priority directive to the
**top** of the final prompt string (not appended at the end where it currently
loses to the JSON body):

> `IMPORTANT — PRODUCT VISUAL: {N} real product/UI screenshot image(s) are attached after the reference ad and logo. Place the attached screenshot into the product slot exactly. Reproduce its real UI, text, and layout faithfully. Do NOT draw, invent, relabel, recolor, or replace it with any other interface — no microphones, waveforms, chat bubbles, dashboards, or fake screens unless they appear in the attached image.`

### Wiring

- **Single path (`generateImage`, ~2364):** currently sends raw
  `stage3PromptEl.value` with no directive — this is the primary fix. Route it
  through a shared compose step that (a) parses the textarea JSON leniently
  (reuse `parseJsonLoose`), (b) runs `applyProductAssetFidelity`, (c)
  re-stringifies, (d) prepends the lead directive. If the textarea is not
  parseable JSON (user free-typed), skip the JSON mutation but still prepend the
  lead directive.

- **Batch path (`composeKiePrompt`, ~2302):** run `applyProductAssetFidelity` on
  `clone.ad_prompt` **before** `JSON.stringify`, and replace the current
  append-only product directive (lines ~2302–2307) with the shared lead
  directive. This removes the contradiction instead of merely adding to it. The
  existing per-variation color/copy directives are unaffected.

- **Stage 2 prompt (`STAGE2_PROMPT`, the `PRODUCT_ASSETS` block ~1757–1763):**
  light reinforcement so the generated JSON references the attachment from the
  start — instruct the model to write the attachment reference into
  `product_visual_direction.source_asset_to_use` and the product element's
  `content`, and to never emit an invented product description when an asset is
  attached. This is defense-in-depth; the helper is the deterministic backstop
  that does not depend on the Stage 2 model obeying. Bump
  `STAGE2_PROMPT_VERSION` (currently `"4"`) so stale saved prompts in
  `localStorage` refresh.

### Why a code-level backstop, not prompt-only

The Stage 2 model already received a directive to reproduce the attached asset
(line ~1761) and disobeyed, emitting the invented mockup anyway. Relying on the
model to behave is therefore insufficient. Mutating the `ad_prompt` JSON in code
guarantees KIE receives a coherent, non-contradictory prompt regardless of what
Stage 2 produced.

## Components and boundaries

- **`applyProductAssetFidelity(adPrompt, assetCount)`** — pure-ish function over
  the ad_prompt object. Input: ad_prompt object + count. Output: same object with
  product fields normalized to the attachment. No I/O, no globals. Independently
  inspectable and testable.
- **A lead-directive builder** — given `assetCount`, returns the directive
  string (empty when 0). Pure.
- **Single-path and batch-path call sites** — thin glue that parses/stringifies
  and concatenates the lead directive. They depend on the two helpers above.

## Data flow (after change)

```
Stage 2 ad_prompt JSON
   │  (textarea: stage3PromptEl, editable)
   ▼
[at generate time, if assetCount > 0]
   parseJsonLoose → applyProductAssetFidelity → stringify
   │
   ▼
leadDirective(assetCount) + "\n\n" + jsonStr   ──►  runKieGeneration
   │                                                  attaches productImages
   ▼
KIE: coherent prompt ("use the attached screenshot") + the screenshot image
```

## Error handling

- **Unparseable Stage 3 textarea** (user free-typed non-JSON): skip JSON
  mutation, still prepend the lead directive. Never throw from the generate path.
- **Missing `product_visual_direction` or product element** in the JSON: the
  helper creates/sets `product_visual_direction` if absent; if no product
  `elements[]` entry exists, it leaves elements alone (the lead directive still
  carries the instruction). Never throw.
- **`assetCount === 0`:** helper and directive are both no-ops; existing
  behavior preserved exactly.

## Testing / verification

No automated test suite exists in this repo, so verification is manual via the
running app:

1. **Repro the bug:** select `brief-me.png` as a product asset, run Stage 1 → 2,
   inspect the Stage 3 prompt — confirm it now references the attached screenshot
   and no longer contains the invented "voice interface mockup" text.
2. **Single path:** click Generate; confirm the output places the real screenshot
   (or a faithful rendering of it), not an invented voice UI.
3. **Batch path:** run angle/color variations; confirm each variation also uses
   the screenshot and the color-only directive still works.
4. **No-asset regression:** with no product asset selected, confirm the prompt
   and output are unchanged from current behavior (abstract/iconic product).
5. **Reference bleed:** confirm the output no longer copies text from the
   reference ad's own on-device screen.

## Open question deferred to implementation

Exact heuristic for identifying "the product element" in `elements[]`. Starting
rule: `type === "image"` AND `name` does not match `/logo/i`. If a deck has
multiple non-logo image elements, apply to all of them — over-applying the
"use the attached screenshot" instruction is safe; under-applying reintroduces
the bug.
