# BetterYourAds — Pipeline (current app)

The product turns a website URL into on-brand ad creative. This is the **new app's** end-to-end
pipeline after Spec #7 (legacy parity correction): VOC research restored, the angle-variations
fallback intentionally dropped, the per-concept batch kept as the primary render path.

Stack: `apps/web` (Next.js App Router) → proxies `/api/*` → `apps/backend` (Express). LLM calls
go through OpenRouter; images through the KIE image backend; persistence is Supabase.

## Flow (journey order)

```
① ONBOARDING ─ "learn the brand"   (/onboarding)
   extract ................ Playwright reads the live page .......... no LLM        [backend]
   runBrand (Stage 1) ..... STRATEGIST extraction prompt ........... 3 parallel agents (A/B/C) → 1 merged brand JSON
   runCustomerResearch .... VOC "market researcher" prompt ......... 1 online web-search → external_voc   ← restored (Spec #7)
   (logo auto-capture) .... deriveLogoFromUrls(measured.logos) ..... best-effort, client-side             [web]

② BOARD / HOME ─ "what should we make?"   (/  and  /board/[id])
   runConceptBoard ........ "Meta ads strategist" prompt ........... 1 call → 10–16 concepts (reads external_voc)

③ WORKBENCH ─ "make the ad"   (/create)
   makeAdPrompt (Stage 2) . image-generator prompt (vision) ........ 1 call → base ad-prompt JSON
   batch render ........... one ad per selected concept ............ 1 KIE render per concept
   (Stage 3) .............. KIE image model ....................... no LLM · 1 per image
   saveAd ................. persist to Supabase
```

## Triggers table

| # | Step | Prompt / file | Trigger | Frequency / caching | Model calls | Workspace |
|---|---|---|---|---|---|---|
| 1 | **Stage 1** — `runBrand` | `prompts/extract-brand-dna.v3` | URL submitted (onboarding) | every analysis | **3 parallel** agents, merged | backend |
| 2 | **VOC** — `runCustomerResearch` | `prompts/customer-research.v1` | after Stage 1, in `POST /brand` | **once per brand** (lazy: only if `external_voc` absent); persisted in the `analysis` JSONB blob | 1 (online) | backend |
| 3 | **Board** — `runConceptBoard` | `prompts/concept-board.v1` | opening the board / regenerate | **once per brand+goal**, cached in DB (`ad_concept_sets`) | 1 (+1 repair on bad JSON) | backend |
| 4 | **Stage 2** — `makeAdPrompt` | `prompts/image-generator.v4-{no,w}-asset` | "Make my ads" in workbench | **once per workbench run** (base reused across concepts) | 1 (vision) | backend |
| 5 | **Render** — batch worker | KIE backend | concepts selected → `/batch` | 1 render **per selected concept** | 0 LLM | backend |
| 6 | **Stage 3** — image | KIE image model | per render | per image | 0 LLM | backend |

## Notes

- **No standalone angle-variations step.** Legacy's `generateAngles` was a workbench *fallback*
  (only when no concepts were pre-selected). The new app is board-first, so that path is
  unreachable and was intentionally not ported. The primary path — one ad per selected concept —
  is the `/batch` worker (step 5).
- **`external_voc` grounds the board.** `runConceptBoard` reads `facts.customer_voice` from the
  brand's `external_voc`. Before Spec #7 nothing wrote it (it silently ran "none collected");
  now `runCustomerResearch` produces it at brand creation (step 2). Requires `STAGE1_MODEL` to
  support OpenRouter `:online` web search and a valid `OPENROUTER_API_KEY`; otherwise it degrades
  to "none collected" without blocking.
- **Caching = "instant reopen."** The board is read from `ad_concept_sets` (DB) on revisit, not
  regenerated. Brand analysis (incl. `external_voc`) lives in `brand_extractions.analysis`.
- **Home = the board.** `/` renders the concept board for the most-recent brand (legacy parity);
  `/board/[id]` renders any saved brand's board.
