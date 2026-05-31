# Ad Copy Brevity & Reference Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated ads short-copy and faithful to the reference's layout by adding brevity discipline to every copy path, hard-gating the phantom subheadline, and forcing faithful reproduction of the reference's alignment/spacing/sizing.

**Architecture:** Prompt-only changes to two files (`bya-pipeline.js` client pipeline, `bya-prompts.js` Stage-2 template) plus two small client-side safety nets. No new pipeline stages. The render headline comes from the selected board concept (`generateConcepts`); the fallback render uses `generateAngles`; the subheadline and layout come from Stage-2 (`makeAdPrompt`). All three must enforce brevity, and Stage-2 must reproduce the reference layout and emit forceful prose art-direction the image model will honor.

**Tech Stack:** Vanilla JS (no framework/bundler), Node for syntax checks. No test suite — verification is `node -c` parse checks, `grep` text assertions, and manual visual testing in the running app.

**Spec:** `docs/superpowers/specs/2026-05-29-ad-copy-brevity-and-reference-fidelity-design.md`

---

## Verification conventions (read first)

- There is **no test suite, build, or linter**. After every edit to a `.js` file, run `node -c <file>` to confirm it still parses.
- Confirm each text change landed with `grep`.
- Final acceptance is **visual** — see the "Manual Verification" section at the end.
- All work happens on branch `ad-copy-brevity-reference-fidelity` (already created).

---

### Task 1: Strengthen the brevity gate in `generateConcepts`

The HEADLINE CRAFT block already exists in `generateConcepts`. Add a final, unmissable gate at the very end of the prompt so the model self-corrects before returning. This is the function whose headlines render in the BATCH path (selected concepts).

**Files:**
- Modify: `bya-pipeline.js` (the line ending the `generateConcepts` prompt)

- [ ] **Step 1: Apply the edit**

Find this exact line:

```javascript
      "Produce 10–16 concepts total. No extra keys.";
```

Replace with:

```javascript
      "Produce 10–16 concepts total. No extra keys.\n" +
      "FINAL CHECK before returning: every headline must be ≤6 words (rhythmic exceptions aside), carry one idea, and not open with a banned filler verb. If any headline reads like a sentence or a full value proposition, rewrite it shorter — short copy is the #1 driver of a clean, scroll-stopping ad.";
```

- [ ] **Step 2: Verify it parses**

Run: `node -c bya-pipeline.js`
Expected: no output, exit 0.

- [ ] **Step 3: Verify the text landed**

Run: `grep -c "FINAL CHECK before returning" bya-pipeline.js`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add bya-pipeline.js
git commit -m "Strengthen generateConcepts brevity with a final self-check gate"
```

---

### Task 2: Add brevity discipline to `generateAngles`

`generateAngles` (the fallback render copy path, `bya-pipeline.js:283-322`) currently has no length rules. Add a compact HEADLINE CRAFT block before its OUTPUT CONTRACT.

**Files:**
- Modify: `bya-pipeline.js` (`generateAngles` prompt, just before `"OUTPUT CONTRACT — return ONLY a JSON object..."`)

- [ ] **Step 1: Apply the edit**

Find this exact block (the FIRST occurrence — inside `generateAngles`, immediately following the color-variation rules):

```javascript
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"variations\": [\n" +
```

Replace with:

```javascript
      "HEADLINE CRAFT — every headline must read like a scroll-stopping Meta ad headline, NOT a value proposition:\n" +
      "- Aim for 2–6 words, under ~40 characters. Strong default, not a hard cap — run longer ONLY for rhythm (e.g. three parallel chunks). Never two sentences. Never a full value prop.\n" +
      "- One idea per headline. If you're joining two thoughts with \"and\", a comma splice, or a second sentence, cut to one.\n" +
      "- Lead with the benefit, a concrete number, a tension, or the customer's own words. Banned openers (filler verbs): Gives, Helps, Lets, Allows, Provides, Enables, Makes, Offers.\n" +
      "- Before returning, re-read every headline and tighten any that run long, open with a banned verb, or carry two ideas. When in doubt, cut words.\n\n" +
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"variations\": [\n" +
```

- [ ] **Step 2: Verify it parses**

Run: `node -c bya-pipeline.js`
Expected: no output, exit 0.

- [ ] **Step 3: Verify the text landed**

Run: `grep -c "HEADLINE CRAFT" bya-pipeline.js`
Expected: `2` (one already in `generateConcepts`, one new in `generateAngles`)

- [ ] **Step 4: Commit**

```bash
git add bya-pipeline.js
git commit -m "Add headline brevity rules to generateAngles (fallback copy path)"
```

---

### Task 3: Hard-gate the subheadline + add layout-fidelity directives (Stage-2 prose)

`bya-prompts.js` STAGE2 template. Two prose edits: (a) turn the subheadline rule into a hard gate that also sets a boolean, and (b) add a LAYOUT FIDELITY block plus an instruction to emit a prose `art_direction` string.

**Files:**
- Modify: `bya-prompts.js` (text-budget section ~`:593`, and the block right after it ~`:596`)

- [ ] **Step 1: Replace the subheadline rule**

Find this exact line:

```
- Subheadline: include one ONLY if the reference has one, and keep it to a single short line. Never a paragraph, never multiple stacked sentences.
```

Replace with:

```
- Subheadline: HARD GATE — include a subheadline ONLY if the reference ad itself shows one. If the reference has NO subheadline, "copy.subheadline" MUST be "" (empty string). Never substitute a brand tagline, slogan, or value proposition for an absent subheadline. When the reference does have one, keep it to a single short line — never a paragraph or stacked sentences.
- Set the boolean "reference_has_subheadline" in the ad_prompt: true only if the reference ad itself shows a subheadline, otherwise false.
```

- [ ] **Step 2: Add the LAYOUT FIDELITY block**

Find this exact line (the last bullet of the text-budget section):

```
- The generated ad_prompt's negative_prompt must forbid excess text, paragraphs, and cluttered small text.
```

Replace with (the original line, then the new block):

```
- The generated ad_prompt's negative_prompt must forbid excess text, paragraphs, and cluttered small text.

=== LAYOUT FIDELITY — REPRODUCE THE REFERENCE EXACTLY ===

Copy the reference ad's composition; do not impose a default layout.
- ALIGNMENT: match the reference. If its text is centered, center the recreation's text; if left-aligned, left-align. Never default to left-aligned when the reference is centered.
- NEGATIVE SPACE: reproduce the reference's whitespace and margins. If the reference is airy with generous empty space, keep that breathing room — do NOT fill the canvas.
- ELEMENT SIZING: match the reference's proportions. Render the device/product at the SAME relative scale and the SAME crop as the reference. If the reference shows only the top third of a phone with space above it, show only the top third at that size — never enlarge the device to fill the canvas, and never stretch or distort it.
- Record these decisions in layout.alignment, layout.cropping, layout.visual_balance, and the element position/width values.

Then write a short "art_direction" string (1–3 plain-language sentences, NOT JSON) for ad_prompt.art_direction that restates the highest-leverage spatial facts for the image model: text alignment, the device's on-canvas scale and crop, and the whitespace to preserve. Example shape: "Center all headline text. Show only the top ~40% of the phone, centered in the lower half, with wide empty margins above and around it. Keep generous negative space; do not enlarge or stretch the device."
```

- [ ] **Step 3: Verify it parses**

Run: `node -c bya-prompts.js`
Expected: no output, exit 0.

- [ ] **Step 4: Verify both texts landed**

Run: `grep -c "HARD GATE" bya-prompts.js && grep -c "LAYOUT FIDELITY — REPRODUCE THE REFERENCE EXACTLY" bya-prompts.js`
Expected: two lines, each `1`.

- [ ] **Step 5: Commit**

```bash
git add bya-prompts.js
git commit -m "Stage-2: hard-gate subheadline and force faithful reference layout + art_direction"
```

---

### Task 4: Add `reference_has_subheadline` and `art_direction` to the Stage-2 output schema

The prose in Task 3 references two new fields; the JSON schema in the prompt must declare them so the model emits them.

**Files:**
- Modify: `bya-prompts.js` (the `"ad_prompt": {` schema block, ~`:874-875`)

- [ ] **Step 1: Apply the edit**

Find this exact block:

```
"ad_prompt": {
  "goal": "",
  "canvas": {
```

Replace with:

```
"ad_prompt": {
  "goal": "",
  "reference_has_subheadline": false,
  "art_direction": "",
  "canvas": {
```

- [ ] **Step 2: Verify it parses**

Run: `node -c bya-prompts.js`
Expected: no output, exit 0.

- [ ] **Step 3: Verify the fields landed**

Run: `grep -c "reference_has_subheadline" bya-prompts.js && grep -c '"art_direction": ""' bya-prompts.js`
Expected: two lines — `reference_has_subheadline` = `2` (prose bullet in Task 3 + schema here), `"art_direction": ""` = `1` (the schema line only).

- [ ] **Step 4: Commit**

```bash
git add bya-prompts.js
git commit -m "Stage-2 schema: declare reference_has_subheadline and art_direction fields"
```

---

### Task 5: Client safety net — enforce subheadline gate + hoist art_direction to prose

Even if Stage-2 disobeys, the client guarantees no phantom subheadline renders, and surfaces `art_direction` as a leading plain-text line (image models follow forceful prose over nested JSON) for BOTH the base render (`prepareStage3`) and variant renders (`withProductFidelity`).

**Files:**
- Modify: `bya-pipeline.js` — `prepareStage3` (`:272-280`) and `withProductFidelity` (`:113-121`)

- [ ] **Step 1: Update `prepareStage3`**

Find this exact block:

```javascript
    if (parsed && parsed.ad_prompt) {
      const ar = parsed.ad_prompt.canvas && parsed.ad_prompt.canvas.aspect_ratio;
      return { adPromptObj: parsed.ad_prompt, adPromptStr: JSON.stringify(parsed.ad_prompt, null, 2), aspect: mapAspectRatio(ar) };
    }
```

Replace with:

```javascript
    if (parsed && parsed.ad_prompt) {
      const ap = parsed.ad_prompt;
      // Safety net: never let a phantom subheadline render when the reference has none.
      if (ap.reference_has_subheadline === false && ap.copy && typeof ap.copy === "object") {
        ap.copy.subheadline = "";
      }
      // Hoist art-direction prose to the top — image models honor forceful prose over nested JSON.
      const art = typeof ap.art_direction === "string" ? ap.art_direction.trim() : "";
      const ar = ap.canvas && ap.canvas.aspect_ratio;
      const json = JSON.stringify(ap, null, 2);
      const str = art ? "ART DIRECTION (follow precisely): " + art + "\n\n" + json : json;
      return { adPromptObj: ap, adPromptStr: str, aspect: mapAspectRatio(ar) };
    }
```

- [ ] **Step 2: Update `withProductFidelity`**

Find this exact block:

```javascript
  function withProductFidelity(adPrompt, assetCount, trailingDirective) {
    applyProductAssetFidelity(adPrompt, assetCount);
    const jsonStr = JSON.stringify(adPrompt, null, 2);
    const lead = leadProductDirective(assetCount);
    let out = lead ? lead + "\n\n" + jsonStr : jsonStr;
    const trail = (trailingDirective || "").trim();
    if (trail) out += "\n\n" + trail;
    return out;
  }
```

Replace with:

```javascript
  function withProductFidelity(adPrompt, assetCount, trailingDirective) {
    applyProductAssetFidelity(adPrompt, assetCount);
    const art = adPrompt && typeof adPrompt.art_direction === "string" ? adPrompt.art_direction.trim() : "";
    const jsonStr = JSON.stringify(adPrompt, null, 2);
    const lead = leadProductDirective(assetCount);
    let out = lead ? lead + "\n\n" + jsonStr : jsonStr;
    if (art) out = "ART DIRECTION (follow precisely): " + art + "\n\n" + out;
    const trail = (trailingDirective || "").trim();
    if (trail) out += "\n\n" + trail;
    return out;
  }
```

- [ ] **Step 3: Verify it parses**

Run: `node -c bya-pipeline.js`
Expected: no output, exit 0.

- [ ] **Step 4: Verify both edits landed**

Run: `grep -c "ART DIRECTION (follow precisely)" bya-pipeline.js && grep -c "Safety net: never let a phantom subheadline" bya-pipeline.js`
Expected: two lines — `2` then `1`.

- [ ] **Step 5: Commit**

```bash
git add bya-pipeline.js
git commit -m "Client: enforce subheadline gate and hoist art_direction prose for base + variant renders"
```

---

## Manual Verification (final acceptance — visual)

The only real test. Research is cached per brand, so iteration is fast.

- [ ] Restart the server if needed (`npm start`) and hard-refresh the app (`Cmd+Shift+R`) so the new client JS loads.
- [ ] On the concept board, click **↻ regenerate**. Confirm headlines are short (2–6 words, one idea, no "Gives/Helps/Lets/..." openers). No multi-sentence value props.
- [ ] Select 1–2 concepts and render. Confirm on the generated image:
  - Headline is short.
  - **No subheadline** (for a no-subheadline reference like Chirp) — the "Highest rates. Zero commission. Paid in 48 hours." tagline must be gone.
  - Text alignment matches the reference (centered reference → centered output).
  - Phone is reasonably sized with breathing room — not oversized/stretched/canvas-filling.
- [ ] Spot-check the fallback path (render without pre-selecting concepts) for the same brevity.
- [ ] If layout drift persists, that's the known image-model limitation (spec Risks) — the deferred render→verify→retry loop is the follow-up, not a bug in this plan.
