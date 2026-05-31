# BetterYourAds — Definitive Research Brief

*Pre-revenue, solo-founder, hybrid (managed-now → SaaS-later). Synthesized from a multi-agent research workflow (pain map · competitor map · Meta API feasibility · adversarial verification). Where data is thin, it's flagged.*

*Generated 2026-05-30.*

---

## 1. Executive summary

**1. "Why not just use ChatGPT?" — the answer is the closed learning loop + brand grounding, and it's structurally defensible.** ChatGPT is stateless and blind: it never sees your live Meta numbers, can't launch, has no memory of what won last week, and produces generic, off-brand pixels. The moat is a *compounding, account-specific "why" memory* that improves every concept — diagnose business (from URL) → generate on-brand concepts tied to an angle hypothesis → launch → measure → **explain in plain language why a hook/angle/visual won** → auto-write that learning into the next brief. A chat prompt cannot do this by construction. Pixel generation is *table stakes and already commoditized at $20–45/mo* (Pomelli is free, from Google); the moat is everything *after* generate.

**2. The market tailwind is real and large.** Meta's Andromeda shift (fully rolled out Oct 2025) made creative *volume + diversity* the #1 performance lever — creative now drives 70–80% of outcome (AppsFlyer), and Meta *limits reach* for low-diversity creative (SearchEngineLand). Teams need 10–20 concepts/campaign and ~50 new ads/month per $25k spend (MagicBrief), while a designer delivers ~4 of 10 requested per week (AdRiseLab). The platform now rewards exactly what AI does well.

**3. Nobody owns the full SaaS loop — that's the white space.** The market splits into four clusters that each break the loop at a different seam: autonomous launchers (AdStellar, AdAmigo) optimize *budget not creative reasoning*; generators (AdCreative.ai, Pencil, Creatify) die at generation; analytics (Motion, Atria, Foreplay) explain but don't generate or launch; causal-AI (INCRMNTAL) is enterprise attribution. **Atria is the closest and the real benchmark to beat** — but it's ecommerce-DTC-tuned, library/competitor-derived (not brand-faithful from your site), and doesn't demonstrably re-generate the next creative from the *measured outcome of the last*. **No one is purpose-built for the SaaS funnel** (trial/demo/awareness stages, abstract value props with nothing to photograph).

**4. Feasibility verdict: read+analyze first, launch second, autonomous last — and the blocker is not the API, it's the gate.** The Meta Marketing API technically supports everything (full CRUD launch, rich creative-level CTR/CVR insights). The real wall for a pre-revenue founder is **Business Verification (needs a real legal entity + documents) + App Review for Advanced Access on `ads_management`**. Budget *several weeks*, not days. Read-only `ads_read` analytics is the lowest-friction approvable path and aligns with the moat.

**5. ICP + WTP: target the painful, expensive middle.** Lean SaaS performance teams / founders who can't afford an agency ($2k–30k/mo) or fractional CMO ($5k–15k/mo) but need agency-grade volume + angle strategy *and proof it works*. Proven self-serve WTP: ~$49/mo for AI creative gen, ~$129/mo once campaign automation/performance is added (AdStellar tiers). WTP is highest for **outcomes** (lower CAC, faster time-to-winner), not pixels — anchor to "a fraction of an agency retainer."

---

## 2. Pain map

Ranked by *severity × how well BYA can own it*. Generic pains cut.

| Rank | Pain | Severity | BYA ownership | WTP signal |
|---|---|---|---|---|
| **1** | **Creative volume/velocity gap.** Algorithm demands 10–20 concepts + ~50 ads/mo per $25k; teams deliver ~4 of 10/week. Hard capacity wall, recurs weekly. | High (existential, platform-level) | **High** — core pipeline job; lean into volume *and angle diversity* (the "70–80% cluster on one concept" problem) | Replaces $100–400/asset freelancer + $2k+/mo agency |
| **2** | **No closed feedback loop / "which angle is winning & why."** Teams guess; winners rarely feed back. The differentiator vs commodity generators. | Med-High (survivable today, highest *leverage*) | **High (moat) — not built yet.** Ingest Meta data → attribute to angle/hook → bias next batch | Premium tier; this is what lifts WTP above the $29 anchor |
| **3** | **"Why did it convert?" diagnosis (CTR-vs-CVR).** Platforms report *what*, never *why*. High-CTR/low-CVR is the most common misdiagnosed pattern. | High (every downstream decision depends on it) | **High** — pair creative artifact + metric pattern → ranked causal hypothesis + prescribed next change. LP-mismatch detection reuses the existing `/extract` Playwright crawl | Core value prop; "explain" is the rarest capability in the market |
| **4** | **Creative fatigue treadmill.** Winners decay in 2–4 weeks; 15–25% of spend wasted on fatigued creative ($90k–150k/yr at $50k/mo). | High (recurring, quantified $) | **High, with a caveat** — must vary *concepts not cosmetics* (net-new angles beat cosmetic refreshes 2×). Fatigue trigger = bridge into the performance loop | Clear ROI story (kill the preventable waste) |
| **5** | **Brief-to-live is a 2-week black hole.** Top ad decays by Day 10, replacement lands Day 14 = 4–5 days of premium CPC every cycle; designers lack strategic context. | High (wasted spend + burnout) | **High** — collapse brief-to-live to minutes; Stage-1 extraction + Stage-2 strategist *bakes context in* | Headline value prop |
| **6** | **Freelancer/agency dependence: slow + expensive + inconsistent.** Static = $100–400; retainers $2k–10k+; revision rounds bill extra. | High (direct, quantified, easy ROI) | **Partial → strong for statics; NO for video/UGC** (often outperforms 3–5×, out of scope for an image tool) | The head-to-head per-asset benchmark |
| **7** | **Tests too many variables at once** → inconclusive results; teams "think they're learning but aren't." | High (silently invalidates most tests) | **High** — generate *single-variable* variant families (hook-only, headline-only, visual-only); enforces clean-test design at generation time | Differentiated, defensible, cheap to build |
| **8** | **Funnel/awareness mismatch.** Bottom-funnel CTAs ("book a demo") at cold audiences. SaaS-specific structural error. | High (silently caps performance) | **High** — tag each creative with funnel stage, gate mismatched CTAs. The repo already has `meta-funnel-*` skills encoding Schwartz's 5 awareness levels | SaaS-native differentiation |

**Explicitly de-prioritized (partial/out-of-scope):** Ads Manager onboarding overwhelm (pulls toward media-buying tool); full cross-platform attribution reconciliation (Meta/GA4/Shopify mismatch — heavy data plumbing, crowded); multi-touch B2B pipeline attribution (needs CRM/MMM); rebuilding server-side CAPI tracking. Note these as adjacent, not wedge.

**WTP headline:** concrete and modest at self-serve — **~$49/mo creative gen, ~$129/mo with automation** (AdStellar), Canva Pro $13 as the cheap baseline. But the *value ceiling* is the human alternative being displaced: agencies $2k–30k/mo, fractional CMOs $5k–15k/mo, freelancers $100–400/asset. Outcome-based pricing is rising (Gartner: 40% of enterprise SaaS contracts include outcome components by 2026).

---

## 3. Competitive landscape & white space

| Player | What it does | Pricing | Loop gap (where it breaks) |
|---|---|---|---|
| **AdCreative.ai** | Highest-volume static generator + predictive "Creative Score" | ~$39 → $249–599 | Generate + *predicted* score only. No launch, no real measurement, no "why." Community pairs it with Revealbot/Marpipe |
| **Pencil** (Brandtech) | Generative + predictive scoring on $2B spend (~84% acc.) | $14–55/mo; service $119–999+ | Front-loaded *prediction*, not closed. Ranks vs a global model, not your live account |
| **Creatify / Arcads** | URL/script → AI UGC video | $19–99 / ~$11/video | Pure generate. Credits *expire*, penalizing the iteration a loop needs |
| **Creatopy** | Design/production automation (sizes, languages) | $32–45/mo | Production throughput, not performance. Entirely upstream of measure |
| **AdGen AI** | URL → ads **+ multi-platform publish** | $19–199/mo | Gets to generate→launch, then breaks. Publishing is one-way; no measure→explain→iterate |
| **Omneky** | Generate→launch→optimize across channels | $29–99 + $99 insights add-on | Most complete self-serve loop, but **"explain" is thin/black-box** and a *paid add-on*, not default |
| **Motion / Triple Whale / Foreplay** | Creative analytics / attribution / swipe | $99–349 / GMV-based / $49–99 | **Measure+explain only.** Don't generate, don't launch. Human carries insight back |
| **Atria** ⭐ | Research + analytics + AI generation + **one-click batch launch** ("Raya") | $159/$329/mo | **The benchmark.** Closes generate→launch best, but open at **explain→iterate**: conditioned on $5B library/competitor data, *not your prior asset's measured outcome*. Ecommerce-tuned, templated (not brand-faithful from your site) |
| **AdStellar / AdAmigo** | Autonomous Meta launch in <60s, agentic | $44–222 / $99–295 | Optimize *budget/bid*, not creative causality. Tell you *which* won, never *why* at angle level. Generic, weakly-on-brand |
| **Marpipe** | Multivariate element-level testing (rare true "explain") | from $199/mo | Tests *existing* assets; doesn't generate; DTC-oriented; no business diagnosis |
| **Smartly.io / Superside / AdScale** | Enterprise DCO / managed creative / managed ecom | $1M+/mo / $10–100k/mo / $149+ | Wrong ICP (enterprise/ecom). Loop closed by *headcount*, not product |
| **Pomelli** (Google) | URL → "Business DNA" → on-brand assets, **free** | Free | **Same wedge as BYA, from Google.** Generate-only, no ad-account connection. *Commoditization threat to the generate step — proves the moat is everything after generate* |
| **Meta Advantage+ / GEM** | Native auto-gen + auto-optimize | Free w/ spend | Black box, won't explain in plain language, not brand-grounded from your site, single-channel-locked |
| **ChatGPT** | Copy/angle/mockup from a prompt | $0–20 | Stateless, blind, can't launch/measure, off-brand. *The baseline the moat exploits* |

**The gap BYA can own:** a **brand-grounded, SaaS-funnel-native closed loop** — diagnose from URL (where BYA already lives) → strategy/angle-tagged on-brand concepts → launch → **plain-language causal "why this angle/hook won" → auto-write into the next brief.** Two compounding edges no incumbent combines: (1) **the explain→feed-back seam** (Atria's open seam, everyone else's missing half), and (2) **SaaS-funnel purpose-building** — Motion/Marpipe/Atria concentrate on ecommerce-DTC; nobody is built around free-trial/demo/awareness stages and abstract value props with no product to photograph.

**Be honest where BYA has NO edge:** raw pixel/video quality (Arcads/Creatify/Pencil win, often with more funding); pure generation volume (AdCreative.ai); predictive pre-launch scoring (Pencil's $2B dataset, Atria's $5B — BYA has *zero* performance data today); enterprise scale/DCO (Smartly). BYA must **not** compete as "a better generator." Image quality is currently *inconsistent* — a liability, not a moat. Win on the loop + brand grounding + SaaS specificity, treat pixels as good-enough table stakes.

---

## 4. Meta API feasibility — go/no-go

**Verdict: GO, sequenced. The API surface is not the blocker — the gating is.**

| Capability | Technically feasible? | Friction |
|---|---|---|
| **(b) Read + analyze creative-level performance** | **Yes — lowest friction.** `ads_read` + Insights gives impressions, CTR (and unique/outbound), CPC, CPM, spend, the `actions[]` array (purchases, leads, LPVs), `cost_per_action_type`, plus demographic/placement/time breakdowns. CTR comes directly; **CVR you compute** (actions ÷ clicks/impressions — there's no canonical CVR field). | Conversion data is **partly modeled** and on **shorter post-iOS14 windows** (default 7-day click + 1-day view; 28-day deprecated). ~20–30% of iOS conversions unobserved. Caveat your "why it converts" conclusions; CAPI is the standard mitigation. |
| **(a) Launch ads** | **Yes — full CRUD** via `ads_management`: `POST /act_{id}/campaigns,/adsets,/ads,/adcreatives`. Workflow: create PAUSED → review → set ACTIVE. | Needs Advanced Access + client ad-account access. **Adversarial corrections (incorporate):** (1) **Batch is capped at 50 operations per request, NOT "hundreds at once"** — chunk larger volumes across batches, subject to BUC rate limits. (2) Ad review begins/completes regardless of PAUSED vs ACTIVE; PAUSED prevents *spend*, it's not strictly a review prerequisite. (3) Meta favors **ARCHIVE/PAUSE over hard DELETE**. |
| **(c) Full autonomous management** | **Yes in code** (bid/budget/status automation, batch ops) | Heaviest operationally — BUC rate limits (read=1pt, write=3pts), token/access fragility, trust surface. |

**The real gate (two doors, both before any production client account):**
1. **Business Verification** — verify a *legal entity* with documents/registration/domain. **This is the hardest blocker for a pre-revenue startup: no registered company / no docs = no Advanced Access = you literally cannot touch real client accounts.** Register the entity early.
2. **App Review for Advanced Access on `ads_management`** — needs a working screencast of the *live feature* (chicken-and-egg: build it before you can demo it), privacy policy, clear per-permission justification. ~1–5 business days nominal, **practically 2–7+ days, each rejection +3–5 days; multiple rounds common.** Budget *several weeks end-to-end.*

*Verification note:* "AMSA" (raises rate limits/quotas) is **being renamed to "Marketing API Access Tier"** (Meta blog, May 2026); qualification threshold lowered to 500 API calls in 15 days. Doesn't change the sequencing.

**Recommended sequencing (matches the corrections and the moat):**
1. **Read-only `ads_read` + Insights analytics first** — fastest to approve, lowest risk, and it's the "measure + explain" half of the moat. Architect on **System Users + partner asset sharing from day one** (OAuth user tokens expire ~60 days and break unattended jobs).
2. **Register entity → pass Business Verification** (do this in parallel with #1; it's the long pole).
3. **`ads_management` Advanced Access for launch** — once you have a live feature to screencast.
4. **Autonomous management last.**

**Access pattern:** client "Adds Partner" (your Business Manager) with *Create-and-Edit* (advertiser) access — **not Full Control** — then a System User in your BM holds the long-lived token. Requires `business_management` + Advanced Access.

---

## 5. Recommended ICP

**Primary: lean B2B-SaaS performance teams and technical founders running (or wanting to run) Meta at $5k–25k/mo, who feel the creative-volume wall acutely and have no in-house designer/media-buyer they can scale.** Concretely the "painful expensive middle": can't justify an agency ($2k–30k/mo) or fractional CMO ($5k–15k/mo), but the volume/velocity demand is real and CAC is high enough ($2 per $1 of new ARR, up 14% in 2024) that a $129–500/mo tool is a rounding error if it works.

**Why this ICP:**
- **Most acute, payable pain:** creative volume (#1) + fatigue treadmill + wasted spend on a "handful of generic ads." Recurring weekly, quantified, emotionally charged ("every dollar has to have a job").
- **WTP is proven** at exactly the band BYA can serve ($49 → $129 → $499 tiers convert).
- **SaaS-specific white space:** nobody is funnel-native for trials/demos/awareness and abstract value props — and BYA already has the `meta-funnel-*` and `generateAngles` machinery.
- **The loop matters most here:** high CAC + long B2B cycles mean "which angle actually works" is worth real money, and SaaS teams are analytically minded enough to value a *causal explanation*.

**De-prioritize:** ecommerce/DTC (Motion, Marpipe, Triple Whale, AdScale, Smartly already crowd it, and it's product-photo-centric — away from BYA's URL-extraction strength); pure solo bootstrappers who **avoid paid ads entirely** when faced with ~$2k spend (the data shows many simply opt out — weak urgency for a paid-ads tool). Solo founders are a *self-serve expansion* tier later, not the design-partner wedge.

*Honest caveat:* the research strongly characterizes the *pain* and *WTP band* but contains **no direct ICP-fit data on Chirp or StatDoctor specifically** — treat Chirp as the lab to *validate* this ICP, not proof of it.

---

## 6. Prioritized product roadmap

Scoped to a pre-revenue solo founder with Chirp as the lab. Ruthless YAGNI.

### NOW (next 4–8 weeks) — earn the right to the loop
1. **Fix angle-diversity in generation (not pixel polish).** *Job:* turn "30 cosmetic dupes" into a *controlled family of distinct angle bets* (pain-led / outcome-led / status-quo-attack / social-proof / mechanism). *Effort:* M (prompt + structure on existing `generateAngles`). *Moat:* this is what separates BYA from a commodity generator; pixels are table stakes.
2. **Single-variable variant discipline + funnel-stage tagging.** *Job:* generate hook-only / headline-only / visual-only families and tag each creative with a funnel/awareness stage; gate mismatched CTAs (no "book a demo" to cold). *Effort:* S–M (reuse `meta-funnel-*` skills). *Moat:* makes generated tests *actually attributable* and SaaS-funnel-native — both differentiated and cheap.
3. **Stabilize render fidelity to "good enough."** *Job:* kill the *inconsistency* (current liability) — on-brand, legible text overlay, logo present (logo → +108% CVR per Reddit study). *Effort:* M. *Moat:* none directly, but inconsistency kills trust with Chirp. Don't chase pixel-perfection; chase *reliability*.
4. **Register the legal entity + start Business Verification.** *Job:* unlock the long-pole Meta gate. *Effort:* S (admin, but slow externally). *Moat:* prerequisite for everything in NEXT.

### NEXT (after Chirp is live) — build the measure+explain half
5. **`ads_read` Insights ingestion (read-only).** *Job:* pull creative-level CTR, actions, cost-per-result for Chirp's account. *Effort:* M (System Users + partner sharing from day one). *Moat:* the data that makes the loop possible — and the lowest-friction Meta approval.
6. **The "Explain" engine — plain-language CTR-vs-CVR diagnosis.** *Job:* read each creative + its metric pattern → ranked causal hypothesis ("high CTR + low CVR → ad-to-LP message mismatch; here's the fix"). Reuse `/extract` Playwright to crawl the LP and check ad-promise vs LP-hero match. *Effort:* M–L. *Moat:* **this is the rarest capability in the market and the core differentiator.** Build it next, not last.
7. **Attribute performance → feed winners back into the next batch.** *Job:* tag creative attributes (hook type, logo, headline uniqueness, funnel stage), correlate with *this account's* CVR, bias the next generation toward proven winners. *Effort:* L. *Moat:* **the closed loop itself** — the compounding "why" memory that ChatGPT structurally can't have.

### LATER — only after the loop is proven on Chirp
8. **`ads_management` Advanced Access → assisted launch.** *Job:* push approved creatives live (create PAUSED → activate). *Effort:* L (App Review gate). *Moat:* completes generate→launch; do it once you have a live feature to screencast.
9. **Self-serve SaaS productization + tiers.** *Effort:* L. After Chirp validates the managed motion.
10. **Autonomous budget/management + multi-channel.** *Effort:* XL. Explicitly YAGNI until self-serve revenue exists.

**Do NOT build (YAGNI):** AI video/UGC (Arcads/Creatify own it, out of scope for an image tool); full cross-platform attribution reconciliation; CAPI/server-side tracking; campaign-setup wizard (pulls you toward being a media-buying tool); pre-launch predictive scoring (you have no data — earn it via the loop first).

---

## 7. Land-Chirp playbook

Chirp is a Startmate startup and a *warm* lead — convert it into the "lab."

**The offer (done-for-you, free or near-free, time-boxed):**
> "I'll run your Meta creative as a managed pilot for [6–8 weeks], free. I generate on-brand concept batches from your site, you approve, we launch, and every two weeks I give you a plain-language read on *which angle won and why* — plus the next batch built from that learning. In exchange I get ad-account access and permission to write it up as a case study."

Frame as **diagnose → generate → launch → measure → explain → feed back**, not "I'll make you ads." The deliverable they can't get elsewhere is the *why*.

**Build minimally for THEIR account first (don't build the platform — build Chirp's loop):**
1. Stage-1 extraction on Chirp's URL → brand kit + VoC language pulled from their site/testimonials.
2. Angle-diverse, funnel-tagged batch (roadmap NOW #1–2). Aim for a *controlled family*, ~10–30 reviewable variants per hypothesis, not a grid of dupes.
3. Manual is fine at first — you can *eyeball* their Meta data before `ads_read` is wired. The product can lag the service.

**Getting ad-account access (the right way):**
- Chirp **"Adds Partner"** (your Business Manager) with **Create-and-Edit** access — *not* Full Control.
- Create a **System User** in your BM, assign it to Chirp's shared ad account, use its long-lived token.
- This needs `business_management` + Advanced Access — so **start Business Verification now** (roadmap NOW #4); until approved, operate read-only / manually.

**What to measure (the case-study spine):**
- Per-creative CTR + computed CVR + cost-per-result (the CTR-vs-CVR diagnosis).
- **Time-to-winner** (benchmark: 21 days manual → target 7; ATTN saw exactly this). This is the headline outcome founders pay for.
- Creative throughput (concepts/week vs their prior ~4) and *spend saved* vs freelancer/agency baseline.
- Which **angle/funnel-stage** won — the proof the loop produces learning, not just images.

**Turn it into a case study + pricing:**
- Write up: "X distinct on-brand concepts in Y days, time-to-winner Z→7 days, identified that [pain-led angle] beat [feature-led] for their buyer, CAC/cost-per-result moved N%." Caveat conversion numbers (modeled/short-window).
- Use it as the reference customer to (a) land StatDoctor and 1–2 more managed clients, (b) seed the screencast you need for `ads_management` App Review, (c) justify the SaaS tiers below.

---

## 8. Pricing recommendation

Hybrid: **managed retainer now → SaaS tiers later.** Anchored to the WTP benchmarks found.

**Now — managed retainer (Chirp = lab, free; clients 2–3 = paid):**
- **Chirp: free / heavily discounted** pilot in exchange for access + case-study rights (the data and proof are the payment).
- **Subsequent managed clients: ~$1,000–2,500/mo retainer.** Rationale: *undercut the agency floor* ($2k–30k/mo, ~$3.5k SMB avg; SaaS-specific $3k–15k min) and the fractional CMO ($5k–15k/mo) while being *premium to self-serve tools* because you deliver the explain-loop + done-for-you. Position as "a fraction of an agency retainer, with the *why* an agency won't give you."
- Lean toward **outcome framing** ("faster time-to-winner, lower cost-per-result") over deliverable counts — WTP is shifting to outcomes (Gartner 40% by 2026). Don't take full CPA risk yet (a self-serve tool can't), but *message and prove* on outcomes.

**Later — self-serve SaaS tiers (mirror the validated AdStellar ladder):**

| Tier | ~Price | Includes | Maps to |
|---|---|---|---|
| **Creative** | **~$49/mo** | URL → angle-diverse on-brand batches, funnel-tagged, single-variable families | Proven entry band; the active bottleneck buyers pay for |
| **Performance** | **~$129–149/mo** | + `ads_read` insights, CTR-vs-CVR explain, winners-feed-back loop | The upsell where the moat lives; escapes the $29 generator anchor |
| **Managed/Scale** | **~$499/mo (or custom)** | + assisted launch, done-with-you, priority | AdStellar's $499 Ultra band; bridge to the retainer motion |

**Tiering discipline (from the WTP frustrations):** keep the entry **under $50**, and **don't lock the *needed* feature behind a higher tier** — buyers explicitly resent "used 20% of what I paid for" and "the AI feature I needed was one tier up." The *generate* job monetizes the entry tier; the *performance loop* is the honest upsell.

---

## 9. Open questions / risks

**Open questions (data is thin — flagged honestly):**
1. **Chirp/StatDoctor ICP fit is unverified.** The research nails the *pain* and *WTP band* for SaaS advertisers generally but says **nothing specific about Chirp or StatDoctor's** spend, funnel, or fit. *De-risk cheaply:* the free Chirp pilot *is* the validation — confirm they actually run Meta at meaningful spend before over-investing.
2. **Does BYA's "explain" beat Atria's in practice?** Atria is the benchmark and better-funded. The *theoretical* edge is per-asset feedback + SaaS-funnel + brand-faithful-from-site. *De-risk:* prove the explain→feed-back seam on one Chirp campaign before claiming the moat publicly.
3. **Will brand-faithful render fidelity be "good enough"?** Image quality is *currently inconsistent* — the one place BYA is weak and incumbents (Arcads/Pencil) are strong. *De-risk:* set a "reliable, on-brand, legible, logo-present" bar, not pixel-perfection; measure Chirp's approval rate.

**Risks:**
4. **Business Verification blocks a pre-revenue founder.** No legal entity/docs = no Advanced Access = no real client accounts. **Highest-priority de-risk: register the entity now** and run read-only/manual until verified.
5. **Commoditization of the generate step.** Pomelli (free, Google) does the *exact same URL→on-brand wedge*. If BYA is perceived as "just a generator," it's trapped at the $29 anchor. *De-risk:* sell the loop + SaaS specificity from day one; never lead with pixels.
6. **Attribution trust.** Post-iOS14 conversion numbers are modeled and short-windowed; cross-platform numbers never reconcile (Meta +26%, GA4 −18–35%). *De-risk:* caveat every "why it converted" claim, anchor to backend revenue where possible, plan CAPI later. Don't over-promise causal certainty.
7. **Rate limits + token fragility at scale.** BUC budgets throttle heavy creative-level reporting; OAuth tokens expire in 60 days. *De-risk:* architect on System Users + caching/batching (≤50 ops/batch) from day one — cheap if done early, expensive to retrofit.
8. **Solo-founder bandwidth.** The full loop is a lot. The roadmap is sequenced so each step (diversity → explain → feed-back → launch) ships standalone value; resist building launch/autonomy before the explain-loop is proven on Chirp.

---

### Method note

Produced by a 5-phase multi-agent research workflow (14 agents): pain map (forum/community/blog research), competitor map (4 clusters), Meta Marketing API feasibility, an adversarial verification pass that corrected the API claims (the 50-ops batch cap, PAUSED-vs-review, the AMSA→Marketing API Access Tier rename), and synthesis. One pain-research agent (of five) failed to return structured output; the pain map is built from the other four plus the WTP/JTBD agent.
