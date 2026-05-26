# Product-Screenshot Fidelity in the KIE Prompt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every KIE-bound prompt clearly and non-contradictorily instruct GPT-Image-2 to place the attached product screenshot into the product slot whenever a product asset is selected.

**Architecture:** Add three small pure JS helpers inside `index.html` that rewrite the `ad_prompt` object's product-visual fields to point at the attachment, strip the invented product description, and build a prominent lead directive. Wire them into both KIE paths (single `generateImage`, batch `buildVariantPrompt`) so the JSON body and the directive can no longer disagree. Lightly reinforce the Stage 2 prompt so the JSON is coherent from the start.

**Tech Stack:** Vanilla JS in a single static `index.html` (no framework, no bundler). No build step, no test runner. Pure-logic verification via a standalone Node script that extracts the helpers from `index.html` and asserts on them; DOM glue verified manually in the running app (`npm start`).

---

## File Structure

- **`index.html`** — all production code. Three new pure helpers added near the other prompt builders (just above `buildVariantPrompt`, ~line 2239); two call sites modified (`buildVariantPrompt` ~2243–2309, `generateImage` ~2364–2376); the Stage 2 `PRODUCT_ASSETS` block reinforced (~1757–1763) and `STAGE2_PROMPT_VERSION` bumped (~1287).
- **`scripts/check-product-fidelity.mjs`** — new, standalone Node verification for the three pure helpers. Reads `index.html`, extracts the sentinel-delimited helper block, evals it, and asserts behavior. Run with `node scripts/check-product-fidelity.mjs`. This is not a test framework — it's a single runnable check, consistent with the repo's no-suite convention.

The three helpers (single responsibility each):
- `leadProductDirective(assetCount)` → returns the top-of-prompt directive string (`""` when count is 0).
- `applyProductAssetFidelity(adPrompt, assetCount)` → mutates+returns the ad_prompt object: product fields point at the attachment, invented description stripped, reference-screen guard added. No-op when count is 0.
- `withProductFidelity(adPrompt, assetCount, trailingDirective)` → composes the final prompt string: lead directive + fidelity-applied JSON + optional trailing directive. Used by both call sites.

---

### Task 1: Add the three pure helpers + Node verification

**Files:**
- Modify: `index.html` (insert helpers just before `buildVariantPrompt`, ~line 2239)
- Create: `scripts/check-product-fidelity.mjs`

- [ ] **Step 1: Write the failing verification script**

Create `scripts/check-product-fidelity.mjs`:

```js
// Standalone check for the product-fidelity helpers in index.html.
// Extracts the sentinel-delimited helper block, evals it, and asserts.
// Run: node scripts/check-product-fidelity.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const START = "// === product-fidelity helpers (start) ===";
const END = "// === product-fidelity helpers (end) ===";
const a = html.indexOf(START);
const b = html.indexOf(END);
assert.ok(a !== -1 && b !== -1 && b > a, "helper sentinels not found in index.html");
const block = html.slice(a + START.length, b);

const { leadProductDirective, applyProductAssetFidelity, withProductFidelity } =
  new Function(block + "\nreturn { leadProductDirective, applyProductAssetFidelity, withProductFidelity };")();

const fixture = () => ({
  product_visual_direction: {
    visual_type: "Iconic product mockup",
    source_asset_to_use: "Birdie voice interface mockup (orange microphone + transcript examples)",
    what_it_should_show: "Orange microphone symbol with transcript-like UI",
    avoid: "Do not invent UI elements",
  },
  negative_prompt: "no extra text",
  elements: [
    { name: "brand_logo", type: "image", content: {} },
    { name: "product_visual", type: "image", content: { source_asset_to_use: "Birdie voice interface mockup (orange microphone + transcript examples)" } },
    { name: "headline_text", type: "text", content: { text: "Hi" } },
  ],
});

// leadProductDirective
assert.equal(leadProductDirective(0), "", "lead is empty when count is 0");
assert.match(leadProductDirective(2), /2 real product\/UI screenshot/, "lead names the count");
assert.match(leadProductDirective(1), /attached/i, "lead mentions the attachment");

// applyProductAssetFidelity — no-op at 0
const untouched = fixture();
const before = JSON.stringify(untouched);
applyProductAssetFidelity(untouched, 0);
assert.equal(JSON.stringify(untouched), before, "count 0 is a no-op");

// applyProductAssetFidelity — count 1
const f = fixture();
applyProductAssetFidelity(f, 1);
assert.match(f.product_visual_direction.source_asset_to_use, /attached/i, "pvd.source points at attachment");
assert.match(f.product_visual_direction.what_it_should_show, /attached/i, "pvd.what_it_should_show points at attachment");
assert.doesNotMatch(JSON.stringify(f.product_visual_direction), /voice interface mockup/i, "invented pvd text removed");
const logo = f.elements.find((e) => e.name === "brand_logo");
assert.deepEqual(logo.content, {}, "logo element left untouched");
const prod = f.elements.find((e) => e.name === "product_visual");
assert.match(prod.content.source_asset_to_use, /ATTACHED_PRODUCT_IMAGE/, "product element points at attachment");
assert.doesNotMatch(JSON.stringify(prod.content), /voice interface mockup/i, "invented product element text removed");
const txt = f.elements.find((e) => e.name === "headline_text");
assert.deepEqual(txt.content, { text: "Hi" }, "text elements left untouched");
assert.match(f.negative_prompt, /reference ad's own/i, "reference-screen guard appended");

// applyProductAssetFidelity — missing product_visual_direction is created
const g = { elements: [] };
applyProductAssetFidelity(g, 1);
assert.ok(g.product_visual_direction && /attached/i.test(g.product_visual_direction.source_asset_to_use), "pvd created when absent");

// withProductFidelity
const w1 = withProductFidelity(fixture(), 1, "TRAILING_X");
assert.ok(w1.startsWith("IMPORTANT — PRODUCT VISUAL"), "lead directive is at the top");
assert.match(w1, /TRAILING_X\s*$/, "trailing directive appended at end");
assert.match(w1, /attached/i, "JSON body now references the attachment");
const w0 = withProductFidelity(fixture(), 0, "");
assert.ok(!w0.startsWith("IMPORTANT"), "no lead directive when count is 0");

console.log("OK — product-fidelity helpers pass all checks");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/check-product-fidelity.mjs`
Expected: FAIL with an `AssertionError` on "helper sentinels not found in index.html" (the helpers don't exist yet).

- [ ] **Step 3: Add the helpers to `index.html`**

Insert the following immediately before the `// Build the full KIE prompt string for a single angle variation.` comment that precedes `function buildVariantPrompt` (~line 2239), keeping the file's 2-space indentation inside the IIFE:

```js
  // === product-fidelity helpers (start) ===
  // When real product/UI screenshots are attached, KIE must place THOSE into the
  // product slot — not draw an invented interface. These rewrite the ad_prompt so
  // its product fields point at the attachment, and build a prominent directive,
  // so the JSON body and the directive can't contradict each other.
  function leadProductDirective(assetCount) {
    if (!assetCount) return "";
    return "IMPORTANT — PRODUCT VISUAL: " + assetCount +
      " real product/UI screenshot image(s) are attached after the reference ad and logo. " +
      "Place the attached screenshot into the product slot exactly. Reproduce its real UI, text, and layout faithfully. " +
      "Do NOT draw, invent, relabel, recolor, or replace it with any other interface — no microphones, waveforms, " +
      "chat bubbles, dashboards, or fake screens unless they appear in the attached image.";
  }

  function applyProductAssetFidelity(adPrompt, assetCount) {
    if (!adPrompt || typeof adPrompt !== "object" || !assetCount) return adPrompt;

    // 1. Point product_visual_direction at the attachment (create it if missing).
    var pvd = adPrompt.product_visual_direction;
    if (!pvd || typeof pvd !== "object") { pvd = {}; adPrompt.product_visual_direction = pvd; }
    pvd.visual_type = "attached real product screenshot";
    pvd.source_asset_to_use = "THE ATTACHED PRODUCT/UI SCREENSHOT image(s), attached after the reference ad and logo. Use them exactly as provided.";
    pvd.what_it_should_show = "Exactly the attached product/UI screenshot, placed into the product slot.";
    // pvd.avoid is left intact — it already forbids invented UI.

    // 2. Point the product element(s) at the attachment. Any image element that is
    // not the logo is the product slot. Over-applying is safe; under-applying
    // reintroduces the invented-UI bug.
    if (Array.isArray(adPrompt.elements)) {
      adPrompt.elements.forEach(function (el) {
        if (!el || typeof el !== "object") return;
        var name = String(el.name || "");
        if (el.type === "image" && !/logo/i.test(name)) {
          el.content = { source_asset_to_use: "ATTACHED_PRODUCT_IMAGE — use the real attached screenshot exactly; do not draw or invent any UI." };
        }
      });
    }

    // 3. Guard against copying the reference ad's own on-device screen.
    var guard = "Do not copy, transcribe, or reproduce any UI, text, or screen contents from the reference ad's own device/screen — the only product screen shown is the attached screenshot.";
    var neg = typeof adPrompt.negative_prompt === "string" ? adPrompt.negative_prompt.trim() : "";
    adPrompt.negative_prompt = neg ? neg + " " + guard : guard;

    return adPrompt;
  }

  function withProductFidelity(adPrompt, assetCount, trailingDirective) {
    applyProductAssetFidelity(adPrompt, assetCount);
    var jsonStr = JSON.stringify(adPrompt, null, 2);
    var lead = leadProductDirective(assetCount);
    var out = lead ? lead + "\n\n" + jsonStr : jsonStr;
    var trail = (trailingDirective || "").trim();
    if (trail) out += "\n\n" + trail;
    return out;
  }
  // === product-fidelity helpers (end) ===

```

- [ ] **Step 4: Run the verification to confirm it passes**

Run: `node scripts/check-product-fidelity.mjs`
Expected: `OK — product-fidelity helpers pass all checks`

- [ ] **Step 5: Commit**

```bash
git add index.html scripts/check-product-fidelity.mjs
git commit -m "feat(web): add product-fidelity helpers for KIE prompt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire the single-image path (`generateImage`)

This is the primary fix — the single "Generate" button currently sends the raw Stage 2 JSON with no screenshot directive at all.

**Files:**
- Modify: `index.html` — `generateImage`, lines ~2364–2376

- [ ] **Step 1: Replace the prompt assembly at the top of `generateImage`**

Find (lines ~2364–2366):

```js
  async function generateImage() {
    const prompt = stage3PromptEl.value.trim();
    if (!prompt) { setStage3("No image prompt yet. Run Stage 2 (it auto-fills this), or type one in.", "error"); return; }
```

Replace with:

```js
  async function generateImage() {
    const raw = stage3PromptEl.value.trim();
    if (!raw) { setStage3("No image prompt yet. Run Stage 2 (it auto-fills this), or type one in.", "error"); return; }
    // When product assets are attached, rewrite the ad_prompt so it points at the
    // attached screenshot (and prepend a lead directive) — otherwise KIE follows
    // any invented product description left in the JSON. Non-JSON prompts still
    // get the lead directive so the instruction is never lost.
    let prompt = raw;
    const productCount = productAssetDataUrls.length;
    if (productCount) {
      let obj = null;
      try { obj = parseJsonLoose(raw); } catch (e) {}
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        prompt = withProductFidelity(obj, productCount, "");
      } else {
        prompt = leadProductDirective(productCount) + "\n\n" + raw;
      }
    }
```

(The `refImage3DataUrl` / `logoImage3DataUrl` guard lines immediately below remain unchanged.)

- [ ] **Step 2: Re-run the helper check (no regression in pure logic)**

Run: `node scripts/check-product-fidelity.mjs`
Expected: `OK — product-fidelity helpers pass all checks`

- [ ] **Step 3: Manually verify the single path in the running app**

Run: `npm start`, open the printed `http://localhost:<port>` URL.
1. Run Stage 1 on a URL, then Stage 2 with a reference ad — the Stage 3 prompt box fills with the `ad_prompt` JSON.
2. Select a product asset (e.g. `brief-me.png`) so the product-assets list shows it selected.
3. In your browser DevTools console, set a one-off breakpoint or temporarily add `console.log(prompt)` is NOT needed — instead, click **Generate** and inspect the **Network** tab → the `POST /kie/generate` request body `prompt` field.
   Expected: the prompt **starts with** `IMPORTANT — PRODUCT VISUAL:` and the JSON body's `product_visual_direction.source_asset_to_use` and the `product_visual` element both reference the attachment; the string `voice interface mockup` is **absent**.
4. Confirm the generated image places the real screenshot (or a faithful rendering) rather than an invented voice UI.
5. Regression: deselect all product assets and Generate again — the `POST /kie/generate` `prompt` must equal the raw Stage 3 textarea text (no `IMPORTANT — PRODUCT VISUAL` lead, unchanged behavior).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix(web): single Generate path now tells KIE to use the attached screenshot

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire the batch / variations path (`buildVariantPrompt`)

Replace the append-only product directive (which contradicts the JSON body) with the shared helper that also neutralizes the JSON.

**Files:**
- Modify: `index.html` — `buildVariantPrompt`, lines ~2282 and ~2296–2309

- [ ] **Step 1: Remove the stale `jsonStr` line**

Find (line ~2282):

```js
    const jsonStr = JSON.stringify(clone, null, 2);

    let directive = `VARIATION DIRECTIVE: headline=${JSON.stringify(variation.headline)};`;
```

Replace with (drop the `jsonStr` line; `withProductFidelity` stringifies `clone` itself):

```js
    let directive = `VARIATION DIRECTIVE: headline=${JSON.stringify(variation.headline)};`;
```

- [ ] **Step 2: Remove the contradictory product block and update the return**

Find (lines ~2296–2309):

```js
    // Re-assert product-asset fidelity for the renderer. The same product/UI
    // images are attached to every variation's KIE call (runKieGeneration sends
    // productAssetDataUrls), but the base ad_prompt JSON can be stale relative to
    // the current selection — so spell it out here, mirroring the Stage 2
    // PRODUCT_ASSETS directive, instead of relying on the base JSON's
    // product_visual_direction.
    if (productAssetDataUrls.length) {
      directive +=
        " " + productAssetDataUrls.length + " real product/UI asset image(s) are attached as additional inputs AFTER the reference ad and logo — these ARE the product visual. " +
        "Reproduce them faithfully in the ad's product slot; do NOT redraw, relabel, recolor, crop, blur, or invent any UI, text, charts, or data inside them. " +
        "This overrides any visual tweak above: any tweak applies ONLY to decorative/mascot/background elements, never to the product asset(s).";
    }

    return jsonStr + "\n\n" + directive;
  }
```

Replace with:

```js
    // Product-asset fidelity: rewrite the ad_prompt's product fields to point at
    // the attached screenshot AND prepend the lead directive, so the JSON body
    // can't contradict the instruction. The VARIATION DIRECTIVE rides at the end.
    return withProductFidelity(clone, productAssetDataUrls.length, directive);
  }
```

- [ ] **Step 3: Re-run the helper check**

Run: `node scripts/check-product-fidelity.mjs`
Expected: `OK — product-fidelity helpers pass all checks`

- [ ] **Step 4: Manually verify the variations path**

Run: `npm start`. With a product asset selected and a Stage 2 prompt loaded, trigger the angle/color variations flow. In the Network tab, inspect each variation's `POST /kie/generate` `prompt`.
Expected per variation: starts with `IMPORTANT — PRODUCT VISUAL:`; contains the `VARIATION DIRECTIVE:` (with the per-variation headline and color treatment) at the **end**; `product_visual_direction` references the attachment; `voice interface mockup` is absent. Confirm the color-only swap still applies to background/text and not to the product screenshot.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "fix(web): variations path neutralizes invented product UI in KIE prompt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reinforce the Stage 2 prompt (defense-in-depth)

Make Stage 2 write the attachment reference into the JSON from the start, so the prompt is coherent even before the code helper runs. The helper remains the deterministic backstop.

**Files:**
- Modify: `index.html` — `STAGE2_PROMPT_VERSION` (~line 1287) and the `PRODUCT_ASSETS` directive in `runStage2` (~lines 1757–1763)

- [ ] **Step 1: Strengthen the `PRODUCT_ASSETS` directive**

Find (lines ~1757–1764):

```js
    if (productAssets.length) {
      text += "\n\n=== PRODUCT_ASSETS ===\n" +
        productAssets.length + " real product/UI asset image(s) are attached as additional inputs AFTER the reference ad. " +
        "These ARE the product visual — they must be used in the ad's product slot, and the same files are passed to the image renderer. " +
        "Describe ONLY their placement and treatment (size, position, device framing) to match how the reference ad depicts its product — do NOT transcribe, summarize, or invent any UI text, labels, charts, numbers, or screen contents. " +
        "This OVERRIDES any instruction to represent the product abstractly: do not produce an abstract/iconic stand-in. " +
        "The generated ad_prompt's product_visual_direction MUST instruct the renderer to reproduce the attached product asset(s) faithfully and place them in the product slot, and its negative_prompt MUST forbid altering, relabeling, redrawing, recoloring, cropping, blurring, or inventing any UI, text, charts, or data inside the attached product asset(s).";
    }
```

Replace with:

```js
    if (productAssets.length) {
      text += "\n\n=== PRODUCT_ASSETS ===\n" +
        productAssets.length + " real product/UI asset image(s) are attached as additional inputs AFTER the reference ad. " +
        "These ARE the product visual — they must be used in the ad's product slot, and the same files are passed to the image renderer. " +
        "Describe ONLY their placement and treatment (size, position, device framing) to match how the reference ad depicts its product — do NOT transcribe, summarize, or invent any UI text, labels, charts, numbers, or screen contents. " +
        "This OVERRIDES any instruction to represent the product abstractly: do not produce an abstract/iconic stand-in, and do NOT invent any product interface (no microphones, waveforms, chat bubbles, dashboards, or fake screens). " +
        "In the generated ad_prompt you MUST write the literal phrase \"the attached product screenshot\" into product_visual_direction.source_asset_to_use and product_visual_direction.what_it_should_show, and set the product element's content.source_asset_to_use to \"ATTACHED_PRODUCT_IMAGE\" — never describe an imagined product UI in those fields. " +
        "The negative_prompt MUST forbid altering, relabeling, redrawing, recoloring, cropping, blurring, or inventing any UI, text, charts, or data inside the attached product asset(s), and MUST forbid copying any UI or screen contents from the reference ad's own device.";
    }
```

- [ ] **Step 2: Bump the prompt version so stale saved prompts refresh**

Find (line ~1287):

```js
  const STAGE2_PROMPT_VERSION = "4";
```

Replace with:

```js
  const STAGE2_PROMPT_VERSION = "5";
```

Note: this bump targets the baked `STAGE2_PROMPT` editor cache (`or_stage2_prompt`). The `PRODUCT_ASSETS` block edited in Step 1 is appended at runtime in `runStage2`, so it takes effect regardless; the bump is here because `STAGE2_PROMPT_VERSION` is the established mechanism for signalling "Stage 2 prompting changed" and keeps the convention intact.

- [ ] **Step 3: Manually verify Stage 2 output**

Run: `npm start`. With a product asset selected, run Stage 1 → Stage 2.
Expected: the Stage 2 `ad_prompt` JSON's `product_visual_direction.source_asset_to_use` contains "the attached product screenshot" and the product element's `content.source_asset_to_use` is `ATTACHED_PRODUCT_IMAGE` — not an invented description. (Even if the model partially disobeys, Tasks 2–3 will correct it before KIE; this step just confirms the reinforcement landed.)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(web): Stage 2 writes attachment reference into product fields

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification (no code)

- [ ] **Step 1: Reproduce the original failure scenario and confirm the fix**

Run: `npm start`. Recreate the reported case: Stage 1 on the brand, Stage 2 with the same reference ad, `brief-me.png` selected as the product asset, then Generate via the single button.

Confirm all of the following:
1. The `POST /kie/generate` `prompt` begins with `IMPORTANT — PRODUCT VISUAL:` and contains no `voice interface mockup` / `orange microphone` text.
2. The generated image shows the real `brief-me.png` UI (budget / stakeholder / next-step cards), not an invented voice interface with a mic and waveforms.
3. The output does not copy text off the reference ad's own phone screen (no "Nick Reyes" bleed from the reference).
4. No-asset regression: with no product asset selected, the prompt and output match pre-change behavior (abstract/iconic product, no lead directive).
5. `node scripts/check-product-fidelity.mjs` prints `OK`.

- [ ] **Step 2: Final commit (if any verification tweaks were needed)**

```bash
git add -A
git commit -m "test(web): verify product-screenshot fidelity end-to-end

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Skip if nothing changed in Task 5.)
