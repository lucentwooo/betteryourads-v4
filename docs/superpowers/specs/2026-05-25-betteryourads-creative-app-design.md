# betteryourads-v4 — Stage-One-Driven Creative App

- **Date:** 2026-05-25
- **Status:** Design (approved, pending written-spec review)
- **Author:** Jeremia Yovinus (with Claude)

## 1. Goal

Build a fresh, lean Next.js app inside the `betteryourads-v4` repo that:

1. Onboards a brand by running v4's existing Playwright **website-DNA extraction** ("stage one") and stores the result in Supabase.
2. Generates **5 ad concepts** from that extraction — one per Eugene Schwartz awareness stage — and classifies an overall **brand vibe**.
3. Lets the user **batch-generate creatives**: pick concepts + upload one inspiration image; for each concept it builds a concept-specific Stage-2 ad prompt and renders it through KIE (Stage 3).
4. Collects every creative in a single **Library** screen where they can be **kept or dismissed**.

The visual language and dashboard IA are ported from the reference repo
`github.com/lucentwooo/betteryourads` (cloned locally to a sibling folder
`../_betteryourads-ref` for reference only — not a dependency).

## 2. Context

Two existing codebases inform this build:

- **`betteryourads-v4`** (this repo, current state): a single `index.html` +
  `server.js` (Express). It already implements the three pipeline stages we
  reuse the *logic* of:
  - **Stage 1** — `/extract` loads a URL in headless Chromium (Playwright) and
    reads exact computed colors, CSS color variables, fonts, logos, and page
    text; then `/chat` runs 3 parallel OpenRouter agents against a baked-in
    strategist prompt to produce a large brand-extraction JSON (which already
    includes 5 `ad_concepts`).
  - **Stage 2** — a vision model turns a reference ad image + the brand JSON
    into a render-ready `ad_prompt` JSON.
  - **Stage 3** — KIE GPT-Image-2 (image-to-image) renders the ad from the
    Stage-2 prompt + reference ad + brand logo.
- **`betteryourads`** (reference, `../_betteryourads-ref`): a mature Next.js 16 /
  React 19 / Tailwind v4 / shadcn / Supabase app. We port its **look** (design
  tokens in `globals.css`: cream/ink/coral/ultra palette, `display`/`eyebrow`
  type, `btn-chunk`), its **app shell** (`AppHeader` + `BrandSwitcher`), and its
  onboarding/awareness/concept UI patterns. We do **not** carry over its Meta
  integration, recommendations, weekly briefs, Reddit VOC, style-quiz, style
  references, or product assets.

`index.html` and `server.js` become reference material; their Playwright and KIE
logic is ported into the new app rather than kept running.

## 3. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Foundation | Fresh Next.js build; port the reference look, re-implement only the screens we need. |
| Auth | One **shared password** gate → signed httpOnly session cookie checked in middleware. Supabase accessed **server-side only** with the service-role key. Single tenant. |
| Runtime | **Local Node** (`next dev` / `next start`) so Playwright headless Chromium extraction runs as in v4 today. Not Vercel/serverless. |
| Concepts | The Stage-1 strategist already emits **5 ad concepts**. Keep those 5; extend the schema so each carries an `awareness_stage` (instructed: one per stage) plus a top-level `brand_vibe`. |
| Batch output | One creative **per selected concept**. Each concept builds its own Stage-2 prompt from (that concept + brand JSON + inspiration image + logo), then renders via KIE. |
| Long-running work | Synchronous route handlers + **status rows the client polls** (same pattern v4 uses for KIE). No queue/worker. |
| Image persistence | KIE URLs expire (~24h), so logos, inspiration images, and generated creatives are **downloaded into Supabase Storage**; the DB stores the storage path. |

## 4. Architecture & stack

- **Next.js 16 (App Router) + React 19 + TypeScript**, run on local Node.
- **Tailwind v4 + shadcn/ui**, with the reference `globals.css` design tokens.
- **Supabase** (`@supabase/supabase-js`) accessed server-side with the
  service-role key from route handlers / server components. Storage for binary
  assets.
- **Playwright** (headless Chromium) for extraction, ported from `server.js`.
- **OpenRouter** for Stage-1 (3 parallel agents) and Stage-2 (vision) chat
  completions, proxied server-side so keys never reach the browser.
- **KIE** GPT-Image-2 image-to-image for Stage-3 rendering, proxied server-side.

All third-party keys stay server-side, mirroring v4's proxy design.

## 5. Screens & navigation

**App shell** (ported): sticky `AppHeader` — wordmark, breadcrumb,
`BrandSwitcher` (multiple brands supported), Sign out. Nav: **Dashboard ·
Library**.

1. **Onboarding** (`/onboarding`) — ported multi-step shell:
   - *Business:* company name, website URL, business type (captured, lightly
     used), **brand logo upload**.
   - *Researching:* runs the Playwright stage-one extraction + 3-agent analysis
     (animated loading screen).
   - *Confirm:* trimmed to logo + the 5 colors + brand vibe; save → brand row.
2. **Dashboard** (`/dashboard/brand/[id]`) — **Home + Production combined**:
   - Brand overview: logo, the 5 named colors, brand vibe + one-line note.
   - **Extraction JSON preview** (small snippet) with a "view full extraction"
     link.
   - **Production workspace:** the 5 awareness-stage concepts as cards;
     multi-select concepts to start a batch.
3. **Extraction JSON** (`/dashboard/brand/[id]/extraction`) — **separate page**
   showing the entire stored extraction JSON (read-only, formatted).
4. **Generate / Batch** (`/dashboard/brand/[id]/batch/[batchId]`) — **separate
   generation screen**: upload one inspiration image, run the batch, watch each
   creative load in place (Stage-2 prompt → KIE Stage-3 render), with
   per-creative loading / done / failed states.
5. **Library** (`/dashboard/brand/[id]/library`) — **one screen with every
   generated creative**, both kept and still-in-inbox, each with **Keep /
   Dismiss**. Dismissed creatives are hidden.

Removed vs. reference: Integrations (Meta), Ops, weekly briefs, recommendations,
the separate inbox screen.

## 6. Data model (Supabase)

Single tenant; RLS enabled but effectively permissive (all access is via the
server-side service-role key). Tables:

- **brands**
  `id, name, url, business_type, logo_path, brand_vibe, brand_vibe_note,
  color_primary, color_secondary, color_accent, color_background, color_text,
  extraction_json (jsonb, full Stage-1 output), created_at`
- **concepts**
  `id, brand_id (fk), awareness_stage (unaware|problem_aware|solution_aware|
  product_aware|most_aware), name, headline, subheadline, cta, angle, hook,
  proof_point, visual_metaphor, suggested_layout, rationale, raw (jsonb),
  created_at`
- **batches**
  `id, brand_id (fk), inspiration_image_path, status (running|done|partial),
  created_at, completed_at`
- **creatives**
  `id, batch_id (fk), brand_id (fk), concept_id (fk), status (generating|done|
  failed), state (inbox|kept|dismissed), stage2_prompt (jsonb), image_path,
  aspect_ratio, resolution, error, created_at, completed_at`

Library query: `state in ('inbox','kept')`. Keep → `kept`; Dismiss → `dismissed`.

**Storage buckets:** `logos`, `inspiration`, `creatives`.

## 7. Data flow (the three v4 stages, rewired)

1. **Stage one — extraction** (`POST /api/extract`, run from onboarding):
   port `server.js`'s Playwright `extractFromPage` verbatim → assemble the
   grounded prompt (measured site data + page text + strategist prompt) → fire
   the 3 parallel OpenRouter agents → merge into the brand-extraction JSON.
   Persist `brands` row (identity, 5 colors, brand_vibe, full `extraction_json`)
   and 5 `concepts` rows. **The concepts are not generated separately** — they
   are parsed straight out of the extraction JSON at
   `static_ad_creative_recommendations.ad_concepts` (the strategist prompt already
   produces 5 of them), each tagged with its `awareness_stage`.
2. **Stage two — concept → prompt** (inside the batch worker): for each selected
   concept, call the vision model with `(Stage-2 prompt + brand extraction JSON +
   that concept + inspiration image + logo)` → render-ready `ad_prompt`. Stored
   on the creative's `stage2_prompt`.
3. **Stage three — render** (`POST /api/batch` → per-creative): KIE
   image-to-image with `(ad_prompt, inspiration image, logo)` → poll
   `recordInfo` → download the result → upload to the `creatives` bucket → mark
   the creative `done`. Client polls batch/creative status.

## 8. Prompt adaptations

- **Stage-1 strategist prompt:** extend the output schema so each of the 5
  `ad_concepts` includes an `awareness_stage` (instruct it to produce exactly one
  concept per stage), and add a top-level `brand_vibe` (single primary label +
  one-line note). Reuse v4's parallel-agent grouping. Drop nothing else from the
  extraction (the full JSON is still stored and viewable).
- **Stage-2 prompt:** v4's Stage-2 is driven purely by a reference image; here it
  is **concept-driven** — the selected concept supplies the angle/copy/awareness
  framing, while the inspiration image supplies layout/composition. The prompt is
  adjusted to take the concept as primary intent and the inspiration image as the
  layout template.
- Visual DNA simplified per request: **only** the 5 named colors
  (primary/secondary/accent/background/text) and the logo are surfaced; typography
  references and the full palette are not.

## 9. Secrets (`.env`, server-only)

`APP_PASSWORD`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, `STAGE1_MODEL`,
`STAGE2_MODEL`, `KIE_API_KEY`, `KIE_IMAGE_MODEL`, `KIE_IMAGE_RESOLUTION`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 10. Out of scope (explicitly removed)

Typography references, full color palette (keep only the 5 named colors), style
references, product assets, Meta/Facebook integration, competitors, Reddit VOC,
recommendations, weekly briefs, the AI "team" personas, style-quiz, Ops, and any
per-user auth beyond the single shared password.

## 11. Build phases (for the implementation plan)

1. **Scaffold** — Next.js + Tailwind v4/shadcn + design tokens + Supabase
   server client + shared-password gate (middleware) + schema migrations +
   storage buckets + app shell (`AppHeader`/`BrandSwitcher`).
2. **Onboarding + stage-one extraction** — port Playwright extractor + 3-agent
   analysis; onboarding flow; persist brand + concepts; confirm step.
3. **Dashboard** — combined Home + Production: overview (logo/colors/vibe), JSON
   preview, full-extraction page, concept cards with multi-select.
4. **Batch (Stage 2 + 3)** — inspiration upload, batch creation, per-creative
   Stage-2 prompt + KIE render, polling + in-place loading states.
5. **Library** — single screen of all creatives (kept + inbox), Keep/Dismiss.

## 12. Testing

- Unit-test pure helpers (JSON-loose parsing, aspect-ratio mapping, awareness
  mapping, color extraction shaping) with Vitest.
- Manual end-to-end smoke against a real URL for the extraction → concepts →
  batch → library happy path, given the external API + browser dependencies.

## 13. Risks / open considerations

- **Playwright reliability** on arbitrary sites (timeouts, anti-bot) — keep v4's
  tolerant `domcontentloaded` + settle-timeout approach.
- **LLM JSON validity** — keep v4's tolerant fence-stripping / outermost-object
  parsing; partial-agent-failure handling (merge what succeeds).
- **KIE latency/timeouts** — batches may take minutes; polling with generous
  deadlines and a `failed` state per creative.
- **Local-only runtime** — documented as a constraint; a hosted-browser swap is a
  later concern if deployment is ever wanted.
