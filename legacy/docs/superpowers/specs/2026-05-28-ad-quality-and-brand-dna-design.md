# Ad quality & Brand DNA visibility — design

**Date:** 2026-05-28
**Branch:** feature/lucent-model

## Problem

Reviewing a generated ad (Briefcase / sales-rep deal-intelligence reference) surfaced four issues:

1. **No way to confirm the brand DNA.** Stage 1 extracts a full `visual_brand_system` (colors, fonts, UI style, mood), but the customer app only surfaces a 3-swatch chip + positioning line. The user can't verify the extraction is correct, and the visible board is driven by the *customer research* half — so it feels like brand DNA was dropped.
2. **Uploaded UI screenshot looks pasted-in.** The product-visual prompt says "place the screenshot faithfully, don't redraw it" and says nothing about its background, so the screenshot carries its own page background into the ad and clashes.
3. **Font isn't the brand font.** Stage 2 names the brand font, but image models approximate named typefaces poorly, and we have no check that the right font was even extracted.
4. **Renders time out and are lost.** The client polls KIE for 120s, then shows "Timed out after 2 minutes. The render may still finish — check My ads shortly." But `saveAd` only fires *after* a successful client poll — a render that finishes after timeout is never saved, so "check My ads" is a false promise.

## Scope

All four, display-only Brand DNA panel, client-resume timeout fix. Brand DNA editing and server-side auto-save are explicitly out of scope this round.

## Relevant code

- `app.html` — customer app: concept board (`boardBodyHTML` ~550), reference step / brand chip (`brandChipHTML` ~862), `derivePalette` (200), library / "My ads" (`renderLibrary` ~1131), `saveAdSilently` (~1091), state object (~143).
- `bya-prompts.js` — `STRATEGIST_PROMPT` (Stage 1, ~6–522) including `visual_brand_system` schema; `STAGE2_PROMPT` (~525+) including product-visual section (~576–583) and typography rules (~565–568).
- `bya-pipeline.js` — `leadProductDirective` (81–88), `buildVariantPrompt` (120–157), `generateImage` (449–487, deadline at 471), `saveAd` (490).
- `server.js` — `/kie/result` (~414), `/library/ads` (download temp KIE image → Storage + DB row).

---

## 1. Brand DNA overview panel (display-only)

A reusable `brandDnaHTML(analysis)` component rendering the already-extracted `visual_brand_system`, with the same defensive fallbacks `derivePalette` uses (handle `color_palette` vs `colors`, missing fields, string/object shapes).

**Contents:**
- Brand name + positioning (`brand_identity.brand_name` / `.positioning` || `.tagline`).
- **Colors:** labeled swatches with hex for the key roles present — background, text, primary, accent, cta, secondary. Skip roles that aren't extracted; never render a blank swatch.
- **Fonts:** heading + body family names from `typography.font_families`, plus casing (`casing_style`). If only descriptors exist, show those.
- **Vibe:** the mood/tone descriptor (`ui_style.mood` or equivalent) + a short tone line.

**Placement:**
- Collapsible card at the top of the concept board (home view). Compact summary always visible (swatches + font names + one vibe line); expand reveals hex labels and full descriptors.
- Replaces the small `brandChipHTML` on the reference step with the same component (compact form).

**Out of scope:** editing. Confirming only. No persisted overrides, no feedback into prompts.

**Failure handling:** if `analysis` or `visual_brand_system` is missing, render nothing (or a quiet "brand details unavailable") rather than throwing — the board must still load.

---

## 2. UI screenshot clean integration (prompt change)

Update the product-visual directives so the model integrates the attached screenshot cleanly instead of carrying its background.

- **`leadProductDirective` (bya-pipeline.js):** keep "use the attached screenshot, reproduce its real UI/text/layout faithfully, do not invent," but add: treat it as **screen content only** — mask out / drop its surrounding page background, and composite the screen into a clean device frame or floating card the way the reference depicts its product. Never carry the screenshot's original page/background color into the ad.
- **`STAGE2_PROMPT` product section (~576–583) and the product-asset context block:** same rule. The generated `product_visual_direction` must describe cropping the screenshot to its screen/card and placing it on the ad's surface; `negative_prompt` must forbid the screenshot's original page background bleeding into the ad.
- Preserve the existing "never invent UI / no fake data" guarantees — this only changes background treatment, not UI fidelity.

**Caveat (not built this round):** prompt-only background removal is bounded by model reliability. If output isn't clean enough, the reliable fallback is real background-removal preprocessing before compositing — flagged for a later round.

---

## 3. Font fidelity (prompt change)

Image models honor *visual descriptors* better than font names.

- **Stage 2 typography rule (~565–568):** instruct the model to emit **both** the brand font name **and** a visual descriptor (classification + weight + tracking, e.g. "geometric sans-serif, medium weight, slightly tight tracking"), derived from `visual_brand_system.typography`. The renderer instruction leads with the descriptor and reinforces with the name + casing/heading/body styles.
- The Brand DNA panel (#1) is the verification surface that the correct font was extracted.
- **Expectation:** this gets closer; exact typeface reproduction stays approximate. Documented, not promised.

---

## 4. Render timeout reliability (client-resume)

- **Raise the deadline** in `generateImage` (bya-pipeline.js:471) from `120000` to `240000` (4 min).
- **Persist pending renders so "My ads" promise is true:**
  - On timeout, write the pending render to `localStorage` (e.g. key `bya_pending_renders`): `{ taskId, save-metadata (brand id, concept/angle, anything saveAd needs) }`.
  - On app load and when the library ("My ads") view opens, read pending renders, poll `/kie/result` for each; on `success` call the existing `saveAd`, then remove that entry; on `fail` remove it; otherwise leave it for the next check.
  - Reuses existing `/kie/result` + `/library/ads`; survives navigation and page reloads (not closing the tab mid-render — acceptable for the demo case).
- Update the timeout message to reflect the new behavior ("Still rendering — it'll appear in My ads automatically when it finishes" rather than implying the user must do something).

**Out of scope:** server-side independent polling/auto-save (survives a closed tab) — heavier, deferred.

---

## Testing / verification

No automated test suite in this repo. Verify manually in the running app (`npm start`, open the printed URL):

1. **Brand DNA panel:** onboard a brand → board shows the panel with correct-looking colors/fonts/vibe; reference step shows the compact form; missing fields don't break the board.
2. **Screenshot integration:** upload `brief-me.png`, generate → screenshot appears in a clean frame/card without its original background bleeding in.
3. **Font:** generated ad text reads closer to the brand's typeface style than before.
4. **Timeout:** force/observe a >2-min render → no hard failure; reopening My ads resume-polls and the finished ad appears.
