# Manual checks — Spec #7 (legacy parity correction)

What the autonomous run could not verify itself (no browser, no live keys). Do these after pulling.

## Database migrations

**None.** The VOC output (`external_voc`) is stored **inside the existing `brand_extractions.analysis`
JSONB column** (which is `.passthrough()`), so no schema change and no SQL to paste.

## Environment / config

- **VOC needs online web search.** `runCustomerResearch` calls OpenRouter with `:online` using
  `STAGE1_MODEL`. Confirm `OPENROUTER_API_KEY` is set and `STAGE1_MODEL` supports the `:online`
  web-search plugin. If not, VOC silently returns null and the board degrades to
  `customer_voice: "none collected"` (no crash) — i.e. the old behavior.

## Click-through checks (against `legacy/app.html`, side by side)

1. **Rail:** no "Workspace" header; the logo is the PNG mark (`/logo-mark.png`), not the old SVG;
   nav reads Home · Make an ad · My ads · Brands · + Add client.
2. **Home (`/`)** renders the **concept board** for your most-recent brand (not a recent-ads
   dashboard). With no brands yet, it shows the "Let's learn your brand → Get started" CTA.
3. **Brand-DNA strip** appears on the board: brand name, color-role swatches with hex labels,
   fonts, vibe.
4. **Logo auto-capture:** onboard a real site whose logo is a same-origin/CORS-friendly `<img>`;
   the brand logo should pre-fill on the board without manual upload (the "✓ from your site"
   equivalent). Cross-origin/CORS-tainted logos are skipped silently (same as legacy).
5. **VOC actually ran:** after onboarding a brand with keys set, the generated concepts should
   reflect real customer phrasing. (To confirm data: inspect the brand's `analysis.external_voc`
   in Supabase — it should be populated, not absent.)

## Behavior checks

- Re-onboarding the same URL doesn't error (VOC is best-effort; a failure never blocks creation).
- All prior features still work: admin dashboard, daily quota UI, multi-brand `/board/[id]`,
  per-concept batch ("Make my ads"), bulk reference-ads upload.

## Not done in this spec (follow-ups)

- **Screen-by-screen copy sweep** of onboarding / workbench / library / start-modal / toast vs
  legacy was not exhaustively completed — the high-impact divergences (rail, Home, logo, DNA
  strip) were. A finer copy/layout pass remains optional.
- **Angle/color variations** (`generateAngles`) intentionally dropped (unreachable in the
  board-first IA); revive later as a deliberate "make variations" button if wanted.
