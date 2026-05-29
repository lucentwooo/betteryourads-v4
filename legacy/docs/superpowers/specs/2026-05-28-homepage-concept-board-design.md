# Homepage concept board — design

**Date:** 2026-05-28
**Branch:** feature/lucent-model
**Status:** Draft for review (v2 — decisions resolved, research grounding added)

## Summary

Redesign the **customer app homepage** (`app.html` → `renderHome`) from a generic
"greeting + Make-an-ad hero + recent ads" dashboard into an **ad-concept board**: a clean,
editorial list of ad concepts — organized by customer **awareness stage**, tailored to the
founder's **goal**, and grounded in **real customer research** — that the founder
**batch-selects** and then carries into the **existing, unchanged** ad-creation flow.

The image pipeline, the Stage 1/2 prompts, and the create-flow (drop reference → logo →
product image → generate → render) are **not changed**. The only behavioral change downstream
is that the variations rendered are the **concepts the founder picked on the homepage**, instead
of five angles auto-generated after the reference is dropped.

## Goals

- Make the **homepage the strategic entry point**: "what should I make?" answered by concepts,
  not a bare "drop a reference" CTA.
- Make concepts feel like a **senior Meta ads strategist** wrote them — grounded in what the
  ICP actually says and complains about, not generic AI filler.
- Teach the founder *why* (awareness stages / goal) in plain language — credibility with a
  marketer buyer.
- Support **batch selection** of multiple concepts → carry them all into the create flow.
- Default to a **single brand** in the primary experience.
- Keep the working engine **100% intact**.
- **Reuse research we already have; spend external-research tokens at most once per brand.**

## Non-goals / explicitly out of scope (v1)

- **No changes to prompts or the pipeline** (`bya-prompts.js` `STRATEGIST_PROMPT` /
  `STAGE2_PROMPT`; `bya-pipeline.js` generation functions `makeAdPrompt`, `prepareStage3`,
  `buildVariantPrompt`, `generateImage`). Untouched. New work is **additive** functions only.
- **No curated swipe-file library** of real proven competitor ads.
- **No events/analytics "data foundation"** table in v1. (`saveAd` to the library is the only
  generated-output persistence.) Re-ranking the board by real results is a future layer.
- **No goal-driven changes to generation.** The goal shapes the *concept list and its framing
  only*; it does not alter the render prompts.
- **No removal of multi-brand support.** Multi-brand stays in the data model and is reachable;
  it is de-emphasized so the single-brand founder sees one brand by default.
- **No recurring/continuous research.** External research runs **once per brand** (cached),
  refreshed only when the founder explicitly asks. (Continuous learning = future.)

## What customer research ALREADY exists (and must be reused, not re-derived)

Stage 1 brand analysis (`analyzeBrand` → 3 parallel agents) writes a rich JSON object to
`brands.analysis` (jsonb), persisted in Supabase and loaded on every visit via `loadBrands()`.
It already contains, **per brand**:

- `customer_dna_from_website` — `pains`, `desired_outcomes`, `objections`, `buying_triggers`,
  `alternatives`, `decision_criteria`, `real_customer_quotes`, `exact_phrases`.
- `messaging_foundation` — `pain_points_mentioned`, `objections_addressed`, `customer_segments`,
  `value_props`, `repeated_phrases` (brand voice).
- `proof_library` — `testimonials`, `case_study_metrics`, `roi_claims`, `safe_ad_proof_points`.
- `competitor_intelligence` — competitors, differentiators, category norms.
- `claim_constraints` — `allowed_claims` / `claims_requiring_proof` / `forbidden_claims`
  (the "never fake numbers" guardrail, already structured).
- `static_ad_creative_recommendations.ad_concepts[]` — the strategist agent **already
  pre-generates structured concepts** (concept_name, target_customer, pain_point, hook,
  main_promise, proof_point, suggested headline/subheadline/cta, `why_this_should_work`).
- `external_customer_research_plan` — `recommended_subreddits`, `review_sites`,
  `search_queries`, `what_to_extract`. **This is a *plan* (where to look), not collected data.**

**Conclusion:** concept ideation must **read this stored analysis** as authoritative ground
truth (especially `customer_dna_from_website`, `proof_library`, `messaging_foundation`,
`competitor_intelligence`, `claim_constraints`, and the existing `ad_concepts[]` as seeds).
It must **not** re-run Stage 1.

## What does NOT exist yet (the gap we are closing)

Genuine **external voice-of-customer** — what the ICP actually complains about on Reddit /
review sites — is not collected. The `:online` web-search capability exists server-side
(`/chat` appends OpenRouter's `:online` plugin when `online` is true and `stage !== 2`), but
the app calls `analyzeBrand(..., { online: false })`, so it never runs. We will add a
**one-time external research pass** that fills this gap and caches the result.

## The redesign

### A. Onboarding (brand + goal + research) — one-time

Shown when the primary brand has no `goal` set. Steps:

1. **Site URL** → existing extraction/analysis (`extractSite` + `analyzeBrand` (online:false) +
   `saveBrand`). This is the founder's single primary brand.
2. **External customer research pass** (NEW, see §C2) — runs once here, results cached into
   `analysis.external_voc` and re-saved with `saveBrand`. UI shows a "researching what your
   customers actually say…" stage. Best-effort: if it fails or returns nothing, onboarding
   still completes (concepts fall back to website-derived DNA).
3. **Goal** — one of: **Grow a waitlist · Get signups/trials · Convert to paid** — saved to the
   new `brands.goal` column.

After onboarding, land on the concept board.

For existing test accounts with brands but no goal: onboarding shows a **goal-only** step for
the primary (most-recent) brand, and runs the research pass once to backfill `external_voc`.

### B. Home = concept board (the redesign's center)

Replaces `renderHome`'s body. Editorial layout on the existing tokens (cream/ink, **one**
electric-blue signal per screen, DM Sans). **Acceptance constraints (per founder feedback):**
no monospace eyebrow labels, **no wall of identical cards** — typographic hierarchy, generous
whitespace, hairline rules, simple lists.

- **Header:** "What should we make this week?" + a one-line strategist intro tied to the goal.
- **Funnel strip:** the five awareness stages as one slim text line; the goal-relevant stages
  underlined in blue, the rest muted.
- **Stage sections** (typographic headings, not boxes): each goal-relevant stage shows its name,
  a quiet "Your focus" marker, and a one-line plain-English "where their head is" description.
  Off-focus stages collapse to a single quiet line ("Show N more").
- **Concept rows** under each stage (hairline-separated, whole row taps to toggle): a checkbox
  tick, the concept name (the angle, e.g. "Transformation", "Risk reversal"), and an example
  hook in the brand's voice. No fabricated performance metrics.
- **Sticky footer bar** (the only solid surface): "N concepts selected" + **"Next →"**.
- **`↻ Regenerate`** affordance to refresh the concept set (forces a new ideation call).

**Goal → focus stages** (lights up two, mutes three):

| Goal | Focus stages |
|---|---|
| Grow a waitlist | Problem-aware + Solution-aware |
| Get signups/trials | Solution-aware + Product-aware |
| Convert to paid | Product-aware + Most-aware |

The five stages: **Unaware · Problem-aware · Solution-aware · Product-aware · Most-aware.**

The `my ads` library remains a **separate** view (`renderLibrary`), unchanged, reachable via
the rail.

### C1. Concept generation (new, additive)

A new `BYA.generateConcepts(analysis, goal)`:

- A single **text-only `/chat` `stage:2`** call (same transport `generateAngles` already uses —
  proven, no server change).
- **Persona:** a senior direct-response Meta ads strategist with decades of experience.
- **Inputs (all from stored `brands.analysis` — reuse, no re-research):**
  `customer_dna_from_website`, `messaging_foundation`, `proof_library`,
  `competitor_intelligence`, `claim_constraints`, the existing
  `static_ad_creative_recommendations.ad_concepts[]` (as seeds to expand/refine), and the new
  `external_voc` (§C2) as the strongest signal for pains/phrasing.
- **Grounding rule:** invent NO numbers, testimonials, guarantees, or claims not present in the
  provided facts (mirror `generateAngles`' constraint and `claim_constraints`).
- **Output:** concepts grouped/tagged by awareness stage. Each concept object:

```
{ angle: "<short label, e.g. 'Risk reversal'>",
  headline: "<example hook in brand voice>",
  stage: "<unaware|problem|solution|product|most>",
  rationale: "<one short line: why this works for this ICP>",   // board only, optional
  color_treatment: { background: "<brand hex>", text: "<brand hex>" } }   // optional
}
```

- `stage` and `rationale` are board-only fields; the render path ignores them.
  `headline` + optional `color_treatment` are exactly what `buildVariantPrompt` consumes.
- **Caching:** the generated set is cached in `localStorage` keyed by `brandId + goal`, so
  re-opening Home does not re-hit the model. `↻ Regenerate` clears the cache key and re-calls.

### C2. External customer research pass (new, additive, one-time, cached)

A new `BYA.researchCustomers(analysis)`:

- A single **`/chat` `stage:1` with `online:true`** call (server appends `:online`), driven by
  the freshly-produced `external_customer_research_plan` (`recommended_subreddits`,
  `review_sites`, `search_queries`, `what_to_extract`). Focused VOC prompt — **not** the 3-agent
  strategist run.
- **Output** stored at `analysis.external_voc`, e.g.:
  `{ top_complaints: [], recurring_phrases: [], desired_outcomes: [], objections: [],
     switching_triggers: [], competitor_gripes: [], sources: [] }`.
- **Persisted by re-saving the brand** (`saveBrand` upsert) — lives inside the existing
  `analysis` jsonb, so **no schema change** for this. Done once at onboarding; reused on every
  later board load. Refreshed only via an explicit "refresh research" action (future/manual).
- Best-effort: failures are non-fatal; the board degrades to website-derived DNA.

### D. Integration with the (unchanged) create flow

When the founder taps **"Next"** with concepts selected:

1. Open the workbench for the primary brand, going straight to `pick-ref` (skip the
   "Which brand?" modal — brand is known).
2. **Add a product/UI image upload control** to the `pick-ref` step (restores the missing input;
   feeds the existing `wb.productAssets`). Reference + logo behave exactly as today.
3. Store the selected concepts on `wb.selectedConcepts`.
4. In `runPipeline` **when `wb.selectedConcepts` is present:**
   - Run **Stage 2 once** (`makeAdPrompt` + `prepareStage3`) to obtain `baseAdPromptObj`
     (needed by `buildVariantPrompt`). **Skip `generateAngles`.**
   - Set `wb.angles = wb.selectedConcepts`;
     `wb.results = wb.angles.map(() => ({ loading: true }))`; `wb.selIdx = 0`.
   - **Eagerly render the whole selected batch.** For each selected concept `i`, build its prompt
     via `buildVariantPrompt(baseAdPromptObj, wb.angles[i], productCount)` and call `generateImage`;
     kick the renders off concurrently and fill each tile in as it completes (per-tile loading →
     image/error). **No base/reference-only image is rendered** — every tile IS a selected
     concept. If a concept lacks `color_treatment`, the variant uses the base treatment (existing
     `buildVariantPrompt` behavior).
   - **Only the founder's selected concepts are ever rendered.** The board's full concept list is
     text-only and triggers no image generation; image spend happens once, for the chosen subset,
     on **Next**.
5. **Backward compatibility:** if the workbench is entered with **no** `selectedConcepts` (via
   the rail "make an ad" → "Which brand?" modal), fall back to **today's exact behavior**
   (`generateAngles(5)` + eager base render, lazy per-angle). Unchanged.
6. Results save to the library via the existing `saveAd` path.

## Design language

Reuse `styles/tokens.css` / `styles/app.css` exactly: cream surfaces, ink type, **one**
`--bya-blue` signal per screen, DM Sans, hairlines over shadows, modest radii. New homepage:
**no monospace eyebrow labels, no per-element card grid** — editorial typographic hierarchy.

## State / data changes (minimal)

- **Schema (one migration, idempotent, user runs in Supabase):**
  `alter table public.brands add column if not exists goal text;`
- **No schema change** for research: `analysis.external_voc` lives inside the existing
  `analysis` jsonb.
- `loadBrands` select must add `goal` (currently `id,name,website_url,analysis,updated_at`).
- `saveBrand` must accept/preserve `goal` and the enriched `analysis` (incl. `external_voc`).
- `localStorage`: concept-set cache keyed by `brandId + goal`; onboarding-complete is derived
  from `brands.goal` (DB) — no separate flag needed.
- `state`: add `state.goal` (from primary brand); concept-board view state; `wb.selectedConcepts`.

## Open decisions — RESOLVED

1. **Concept source:** AI-generated per brand+goal. ✔
2. **Goal storage:** new `brands.goal` column (not `profiles`, whose RLS is select-only). ✔
3. **Batch render:** eager batch of the **selected subset only**. On **Next**, render ALL ticked
   concepts at once (concurrent), each via the variant path. The board itself is text-only and
   renders no images; concepts the founder did not select are never generated. ✔
4. **Research depth:** reuse stored analysis **+ one-time external VOC pass** (`:online`),
   cached in `analysis.external_voc`. ✔
5. **When research runs:** once at onboarding, cached; board reads the cache. ✔

## Risks / notes

- **External research is best-effort.** `:online` results vary in quality and the pass can
  return little; concept ideation must degrade gracefully to website-derived DNA. Keep the VOC
  prompt tightly scoped (it drives concept quality, not raw volume of text).
- **Grounding discipline:** the ideation prompt must forbid claims not present in the provided
  facts (`claim_constraints` + "invent nothing"), or the "senior strategist" framing will
  produce fabricated proof — the exact thing the brief forbids.
- **Single-brand assumption:** primary brand = most-recent (`loadBrands` is `updated_at desc`);
  multi-brand switch stays in the rail.
- **Backward compatibility:** the workbench must still function when entered without
  `selectedConcepts` (rail "make an ad" path).
- **Token / image-spend cost:** onboarding makes one extra (online) research call per brand;
  concept ideation is one (text) call per board generation, then cached. **The board itself
  generates no images regardless of how many concepts it lists** — image spend occurs only when
  the founder hits Next, and only for the concepts they ticked (one render each). Many concurrent
  KIE renders for a large selection is the main spend to watch; the count is bounded by what the
  founder chose.
