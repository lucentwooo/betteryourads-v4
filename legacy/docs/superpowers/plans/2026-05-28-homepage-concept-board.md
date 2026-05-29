# Homepage Concept Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer app homepage with a research-grounded, awareness-stage-organized, goal-driven ad-concept board the founder batch-selects from, feeding the selected concepts into the existing (unchanged) render pipeline.

**Architecture:** All new model work is **additive** functions in `bya-pipeline.js` (`researchCustomers`, `generateConcepts`) that reuse the existing `/chat` proxy — no server or prompt changes. Onboarding captures a per-brand `goal` (new `brands.goal` column) and runs a one-time external voice-of-customer pass cached into `analysis.external_voc`. The board (text-only) lets the founder tick concepts; **Next** renders the *selected subset* as a batch through the existing `buildVariantPrompt` → `generateImage` path. If the workbench is entered with no selected concepts, today's `generateAngles(5)` behavior is preserved.

**Tech Stack:** Vanilla JS SPA (`app.html`, string-template rendering), `bya-pipeline.js` (`window.BYA`), Supabase (`@supabase/supabase-js`, RLS, browser-writable `brands`), Express proxy (`server.js`), KIE image gen. No build step, no test runner — verification is `node --check` + manual browser.

**Spec:** `docs/superpowers/specs/2026-05-28-homepage-concept-board-design.md`

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `supabase/schema.sql` | Modify | Add idempotent `brands.goal` column (user runs the migration) |
| `bya-pipeline.js` | Modify | `loadBrands`/`saveBrand` carry `goal`; add `researchCustomers`, `generateConcepts`; export them |
| `app.html` | Modify | Onboarding (URL + research + goal); concept board (replaces home body); board→workbench handoff; product-image upload in `pick-ref`; batch branch in `runPipeline` |

No new files: the codebase keeps everything in these large files by convention — follow it.

## Shared constants (used across tasks — keep names identical)

Goal keys and their focus stages (defined in `app.html` for the UI and re-derived inside `generateConcepts` for the prompt):

```
waitlist → ["problem","solution"]
trials   → ["solution","product"]
paid     → ["product","most"]
```

Goal labels: `waitlist`="Grow a waitlist", `trials`="Get signups / trials", `paid`="Convert to paid".

Awareness stages (order + meta): `unaware`, `problem`, `solution`, `product`, `most`.

---

## Task 1: Add `brands.goal` column to the schema

**Files:**
- Modify: `supabase/schema.sql` (the `brands` table block, around the `create table if not exists public.brands` statement)

- [ ] **Step 1: Add an idempotent column statement after the brands table + RLS policy block**

In `supabase/schema.sql`, immediately after the `create policy "own brands" on public.brands ...` statement, add:

```sql
-- goal: the founder's current objective for this brand, set during onboarding.
-- Drives the concept board's stage focus only (not generation). One of:
-- 'waitlist' | 'trials' | 'paid'. Nullable until onboarding sets it.
alter table public.brands add column if not exists goal text;
```

- [ ] **Step 2: Sanity-check the SQL is still well-formed**

Run: `grep -n "add column if not exists goal" supabase/schema.sql`
Expected: one line printed (the statement exists).

- [ ] **Step 3: Tell the user to run the migration**

This file is applied manually (per CLAUDE.md / project convention). The migration is idempotent and safe to re-run.
Action for the user: Supabase dashboard → SQL Editor → paste `supabase/schema.sql` → Run.
**Do not proceed to Task 2's browser verification until the column exists**, but you may write Task 2's code first.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add brands.goal column for concept-board onboarding"
```

---

## Task 2: Carry `goal` through `loadBrands` and `saveBrand`

**Files:**
- Modify: `bya-pipeline.js` — `loadBrands` (~line 375) and `saveBrand` (~line 381)

- [ ] **Step 1: Add `goal` to the `loadBrands` select**

Replace the select in `loadBrands`:

```js
  async function loadBrands() {
    const c = authed().client; if (!c) return [];
    const { data, error } = await c.from("brands").select("id,name,website_url,analysis,goal,updated_at").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
```

- [ ] **Step 2: Accept an optional `goal` in `saveBrand` without clobbering it when omitted**

Replace `saveBrand` with:

```js
  async function saveBrand(websiteUrl, analysisObj, userId, goal) {
    const c = authed().client; if (!c || !userId) return null;
    let host = websiteUrl; try { host = new URL(websiteUrl).hostname; } catch (e) {}
    const row = { user_id: userId, name: host, website_url: websiteUrl, analysis: analysisObj, updated_at: new Date().toISOString() };
    if (goal !== undefined && goal !== null) row.goal = goal; // only set when provided
    const { data, error } = await c.from("brands").upsert(row, { onConflict: "user_id,website_url" }).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
```

- [ ] **Step 3: Syntax-check the file**

Run: `node --check bya-pipeline.js`
Expected: no output (exit 0). Any error means a typo — fix before committing.

- [ ] **Step 4: Commit**

```bash
git add bya-pipeline.js
git commit -m "feat(pipeline): carry brand goal through loadBrands/saveBrand"
```

---

## Task 3: Add `researchCustomers` (one-time external VOC pass)

**Files:**
- Modify: `bya-pipeline.js` — add a new function near `generateAngles` (~after line 317) and export it (~line 419)

- [ ] **Step 1: Add the `researchCustomers` function**

Insert after `generateAngles` (before `generateImage`):

```js
  // One-time external voice-of-customer pass. Uses the analysis's
  // external_customer_research_plan (subreddits / review sites / queries) and the
  // :online web-search plugin (stage 1) to collect what real prospects actually say.
  // Returns a compact VOC object. Best-effort: callers treat failure as "no VOC".
  async function researchCustomers(analysis) {
    analysis = analysis || {};
    const plan = analysis.external_customer_research_plan || {};
    const identity = analysis.brand_identity || {};
    const messaging = analysis.messaging_foundation || {};
    const ctx = {
      brand: identity.brand_name || identity.name || "",
      positioning: identity.positioning || identity.tagline || "",
      customer_segments: messaging.customer_segments || [],
    };
    const prompt =
      "You are a senior B2B SaaS market researcher. Using web search, find what REAL prospective " +
      "customers of this product actually say, complain about, and want — in their own words — " +
      "across the sources below. Do NOT invent quotes; report only what you actually find. " +
      "If a source yields nothing, omit it.\n\n" +
      "BRAND CONTEXT (so you research the right audience):\n" + JSON.stringify(ctx, null, 2) + "\n\n" +
      "RESEARCH TARGETS (where to look):\n" + JSON.stringify({
        recommended_subreddits: plan.recommended_subreddits || [],
        review_sites: plan.review_sites || [],
        communities: plan.communities || [],
        search_queries: plan.search_queries || [],
        competitor_review_targets: plan.competitor_review_targets || [],
        what_to_extract: plan.what_to_extract || [],
      }, null, 2) + "\n\n" +
      "Extract recurring complaints, the exact phrases people use, desired outcomes, objections/" +
      "hesitations, what makes people switch from alternatives, and gripes about competitors. " +
      "Prefer concrete, quotable language over summaries.\n\n" +
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"top_complaints\": [], \"recurring_phrases\": [], \"desired_outcomes\": [], " +
      "\"objections\": [], \"switching_triggers\": [], \"competitor_gripes\": [], \"sources\": [] }\n" +
      "Keep each array to the most salient 5–10 items.";
    const res = await authed().authedFetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 1, online: true, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error("researchCustomers: no content in model response.");
    const parsed = parseJsonLoose(raw);
    return {
      top_complaints: parsed.top_complaints || [],
      recurring_phrases: parsed.recurring_phrases || [],
      desired_outcomes: parsed.desired_outcomes || [],
      objections: parsed.objections || [],
      switching_triggers: parsed.switching_triggers || [],
      competitor_gripes: parsed.competitor_gripes || [],
      sources: parsed.sources || [],
    };
  }
```

- [ ] **Step 2: Export it**

In the `window.BYA = { ... }` block, add `researchCustomers` to the `// pipeline` line:

```js
    extractSite: extractSite, analyzeBrand: analyzeBrand, makeAdPrompt: makeAdPrompt, prepareStage3: prepareStage3,
    generateAngles: generateAngles, researchCustomers: researchCustomers, generateImage: generateImage, saveAd: saveAd,
```

- [ ] **Step 3: Syntax-check**

Run: `node --check bya-pipeline.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add bya-pipeline.js
git commit -m "feat(pipeline): add one-time external customer research (researchCustomers)"
```

---

## Task 4: Add `generateConcepts` (concept ideation)

**Files:**
- Modify: `bya-pipeline.js` — add a new function after `researchCustomers` and export it

- [ ] **Step 1: Add the `generateConcepts` function**

Insert after `researchCustomers`:

```js
  // Concept ideation for the board. A single text-only stage-2 /chat call.
  // Grounded ONLY in the stored analysis (reuse; no Stage-1 re-run). Returns an
  // array of { angle, stage, headline, rationale } objects. `stage` is one of:
  // unaware|problem|solution|product|most.
  function conceptFocusForGoal(goal) {
    if (goal === "waitlist") return ["problem", "solution"];
    if (goal === "paid") return ["product", "most"];
    return ["solution", "product"]; // trials (default)
  }
  async function generateConcepts(analysis, goal) {
    analysis = analysis || {};
    const focus = conceptFocusForGoal(goal);
    const goalLabel = goal === "waitlist" ? "Grow a waitlist" : goal === "paid" ? "Convert to paid" : "Get signups / trials";
    const proof = analysis.proof_library || {};
    const claims = analysis.claim_constraints || {};
    const sac = analysis.static_ad_creative_recommendations || {};
    const facts = {
      customer_voice: analysis.external_voc || "none collected",
      customer_dna: analysis.customer_dna_from_website || {},
      messaging: analysis.messaging_foundation || {},
      proof: {
        safe_ad_proof_points: proof.safe_ad_proof_points || [],
        testimonials: proof.testimonials || [],
        roi_claims: proof.roi_claims || [],
        case_study_metrics: proof.case_study_metrics || [],
      },
      competitors: analysis.competitor_intelligence || {},
      claim_constraints: { allowed: claims.allowed_claims || [], forbidden: claims.forbidden_claims || [], requires_proof: claims.claims_requiring_proof || [] },
      existing_seeds: sac.ad_concepts || [],
    };
    const prompt =
      "You are a senior direct-response Meta ads strategist who has run paid social for B2B SaaS " +
      "for over a decade. Produce a board of DISTINCT ad concepts for the brand below, organized by " +
      "customer awareness stage.\n\n" +
      "A concept is a different PSYCHOLOGICAL ANGLE into the same customer (e.g. Transformation / " +
      "Before→After, Vs. the old way, Customer proof, Risk reversal, How it works, ROI / value) — " +
      "NOT a reworded headline. Each must be genuinely different from the others.\n\n" +
      "AWARENESS STAGES (tag every concept with exactly one):\n" +
      "- \"unaware\": doesn't know they have the problem yet\n" +
      "- \"problem\": feels the pain, doesn't know solutions exist\n" +
      "- \"solution\": knows tools like this exist, weighing approaches\n" +
      "- \"product\": knows this product, comparing to alternatives\n" +
      "- \"most\": ready to buy, needs a nudge\n\n" +
      "GOAL FOCUS: the founder's goal is \"" + goalLabel + "\". Weight the board toward these stages: " +
      JSON.stringify(focus) + ". Still include a few concepts in the other stages, but produce the " +
      "most (and strongest) concepts for the focus stages.\n\n" +
      "GROUNDING — these are authoritative facts. Invent NO numbers, testimonials, guarantees, " +
      "statistics, or claims not present here. A proof-based concept may ONLY cite proof present in " +
      "facts.proof. Honor claim_constraints (never use a forbidden claim; only use a " +
      "requires_proof claim if matching proof exists).\n" +
      JSON.stringify(facts, null, 2) + "\n\n" +
      "Write each concept's example headline in the brand's own voice — prefer their repeated phrases " +
      "and the exact phrases real customers use (facts.customer_voice / facts.customer_dna).\n\n" +
      "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
      "{ \"concepts\": [ { \"angle\": \"<short label>\", \"stage\": \"<unaware|problem|solution|product|most>\", " +
      "\"headline\": \"<example hook in brand voice>\", \"rationale\": \"<one short line: why this lands for this ICP>\" } ] }\n" +
      "Produce 10–16 concepts total. No extra keys.";
    const res = await authed().authedFetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: 2, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!raw) throw new Error("generateConcepts: no content in model response.");
    const parsed = parseJsonLoose(raw);
    const arr = parsed.concepts || (Array.isArray(parsed) ? parsed : null);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("generateConcepts: model returned no concepts.");
    const valid = ["unaware", "problem", "solution", "product", "most"];
    return arr.filter(function (c) { return c && c.headline && c.angle; }).map(function (c) {
      return { angle: String(c.angle), stage: valid.indexOf(c.stage) >= 0 ? c.stage : "solution", headline: String(c.headline), rationale: c.rationale ? String(c.rationale) : "" };
    });
  }
```

- [ ] **Step 2: Export it**

Update the `// pipeline` export line to include `generateConcepts`:

```js
    generateAngles: generateAngles, researchCustomers: researchCustomers, generateConcepts: generateConcepts, generateImage: generateImage, saveAd: saveAd,
```

- [ ] **Step 3: Syntax-check**

Run: `node --check bya-pipeline.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add bya-pipeline.js
git commit -m "feat(pipeline): add goal-driven concept ideation (generateConcepts)"
```

---

## Task 5: Onboarding (URL → research → goal) in `app.html`

**Files:**
- Modify: `app.html` — add state fields, onboarding render/wire functions, and a boot decision; wire goal save

- [ ] **Step 1: Add onboarding + board state fields**

In the `const state = { ... }` object (~lines 113-121), add these fields after `wb: null,`:

```js
    goal: null,            // primary brand's goal: 'waitlist' | 'trials' | 'paid'
    primaryBrand: null,    // most-recent brand (single-brand default)
    concepts: null,        // current board concepts (array) — null = not loaded
    selected: null,        // Set of selected concept indices
    pendingConcepts: null, // concepts handed from board → workbench
    onboarding: null,      // { step:'url'|'analyzing'|'goal', url, error }
```

- [ ] **Step 2: Add goal/stage constants and helpers**

Add immediately after the `function titleCase(...)` helper (~line 110):

```js
  // Goal → which two awareness stages the board emphasizes.
  const GOAL_FOCUS = { waitlist: ["problem", "solution"], trials: ["solution", "product"], paid: ["product", "most"] };
  const GOAL_LABEL = { waitlist: "Grow a waitlist", trials: "Get signups / trials", paid: "Convert to paid" };
  const STAGE_ORDER = ["unaware", "problem", "solution", "product", "most"];
  const STAGE_META = {
    unaware: { name: "Unaware", blurb: "They don’t know they have this problem yet." },
    problem: { name: "Problem-aware", blurb: "They feel the pain but don’t know solutions exist." },
    solution: { name: "Solution-aware", blurb: "They know tools like this exist; weighing approaches." },
    product: { name: "Product-aware", blurb: "They know you; comparing you to alternatives." },
    most: { name: "Most-aware", blurb: "Basically ready — they just need a nudge." },
  };
  // Reuse external VOC if present; otherwise run the one-time research pass and persist it.
  async function ensureResearch(brand) {
    const a = brand.analysis || {};
    if (a.external_voc) return a;
    let voc = null;
    try { voc = await BYA.researchCustomers(a); } catch (e) {}
    if (voc) {
      a.external_voc = voc;
      brand.analysis = a;
      try { await BYA.saveBrand(brand.website_url, a, state.userId, brand.goal || null); } catch (e) {}
    }
    return a;
  }
```

- [ ] **Step 3: Add the onboarding render + wiring functions**

Add a new section just before `// ───────── Home ─────────` (~line 401):

```js
  // ───────────────────────── Onboarding (one-time: brand + research + goal) ─────────────────────────
  function needsOnboarding() {
    state.primaryBrand = state.brands && state.brands.length ? state.brands[0] : null;
    return !state.primaryBrand || !state.primaryBrand.goal;
  }
  function renderOnboarding() {
    state.view = "onboarding";
    const ob = state.onboarding || (state.onboarding = { step: state.primaryBrand ? "goal" : "url", url: "", error: null });
    let card;
    if (ob.step === "url") {
      card =
        '<div class="eyebrow-acc" style="margin-bottom:10px">welcome</div>' +
        '<h1 style="font-size:40px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 12px">Let’s learn your brand.</h1>' +
        '<p style="font-size:16px;color:var(--fg-2);margin:0 0 24px;line-height:1.5">Paste your site. We read it in a real browser, study what your customers say, and build you a board of ad concepts.</p>' +
        (ob.error ? '<div style="color:var(--bya-oxblood);font-size:13px;margin-bottom:12px">' + esc(ob.error) + '</div>' : "") +
        '<div style="display:flex;gap:8px"><input class="input" id="obUrl" type="url" placeholder="https://yourcompany.com" value="' + esc(ob.url) + '" style="flex:1;font-size:15px" />' +
        btn("continue", { variant: "primary", iconRight: "arrow-right", id: "obUrlGo" }) + '</div>';
    } else if (ob.step === "analyzing") {
      card =
        '<div class="eyebrow-acc" style="margin-bottom:10px">one moment</div>' +
        '<h1 style="font-size:40px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 12px">Reading <span style="color:var(--accent)">' + esc(hostOf(ob.url)) + '</span>.</h1>' +
        '<p style="font-size:16px;color:var(--fg-2);margin:0 0 24px;line-height:1.5" id="obStatus">Learning your colors, voice, and customers…</p>' +
        '<div style="display:flex;align-items:center;gap:10px;color:var(--fg-2);font-size:14px"><span class="spinner"></span> <span id="obSpin">analyzing…</span></div>';
    } else { // goal
      const goalCard = function (key, sub) {
        return '<button class="brand-pick" data-goal="' + key + '" style="padding:16px 18px">' +
          '<span style="flex:1"><span style="font-size:15px;font-weight:600;color:var(--fg);display:block">' + esc(GOAL_LABEL[key]) + '</span>' +
          '<span style="font-size:12px;color:var(--fg-3)">' + esc(sub) + '</span></span>' + icon("arrow-right", 14, "var(--fg-3)") + '</button>';
      };
      card =
        '<div class="eyebrow-acc" style="margin-bottom:10px">last step</div>' +
        '<h1 style="font-size:40px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 12px">What are you trying to do right now?</h1>' +
        '<p style="font-size:16px;color:var(--fg-2);margin:0 0 24px;line-height:1.5">This shapes which concepts we put in front of you. You can change it later.</p>' +
        (ob.error ? '<div style="color:var(--bya-oxblood);font-size:13px;margin-bottom:12px">' + esc(ob.error) + '</div>' : "") +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
          goalCard("waitlist", "Catch people who feel the pain and want in early.") +
          goalCard("trials", "They’re comparing options — show yours wins.") +
          goalCard("paid", "They know you — remove the last hesitation.") + '</div>';
    }
    $app.innerHTML =
      '<div style="height:100vh;width:100vw;background:var(--bg);display:grid;place-items:center;padding:24px">' +
        '<div style="width:100%;max-width:560px">' + card + '</div></div>';
    wireOnboarding();
  }
  function wireOnboarding() {
    const ob = state.onboarding;
    if (ob.step === "url") {
      const urlEl = document.getElementById("obUrl");
      const go = function () { const v = (urlEl.value || "").trim(); if (v) onboardAnalyze(v); };
      document.getElementById("obUrlGo").addEventListener("click", go);
      urlEl.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
      if (urlEl) urlEl.focus();
    } else if (ob.step === "goal") {
      $app.querySelectorAll("[data-goal]").forEach(function (b) {
        b.addEventListener("click", function () { onboardSaveGoal(b.getAttribute("data-goal")); });
      });
    }
  }
  // New brand: extract + analyze + save, then run the one-time research pass, then go to goal.
  async function onboardAnalyze(url) {
    const ob = state.onboarding; ob.url = url; ob.error = null; ob.step = "analyzing"; renderOnboarding();
    const setStatus = function (m) { const el = document.getElementById("obStatus"); if (el) el.textContent = m; };
    try {
      const extracted = await BYA.extractSite(url);
      setStatus("Learning your brand’s colors, voice, and customers…");
      const res = await BYA.analyzeBrand(extracted, { url: url, online: false });
      const saved = await BYA.saveBrand(extracted.finalUrl || url, res.merged, state.userId);
      const brand = saved || { website_url: extracted.finalUrl || url, analysis: res.merged, goal: null };
      setStatus("Researching what your customers actually say…");
      brand.analysis = await ensureResearch(brand);
      state.brands = await BYA.loadBrands();
      state.primaryBrand = state.brands[0] || brand;
      ob.step = "goal"; renderOnboarding();
    } catch (e) {
      ob.step = "url"; ob.error = e.message || String(e); renderOnboarding();
    }
  }
  // Save the goal (and backfill research for an existing brand that lacks it), then enter the board.
  async function onboardSaveGoal(goal) {
    const ob = state.onboarding; ob.error = null;
    const brand = state.primaryBrand; if (!brand) { ob.step = "url"; renderOnboarding(); return; }
    ob.step = "analyzing"; renderOnboarding();
    const setStatus = function (m) { const el = document.getElementById("obStatus"); if (el) el.textContent = m; };
    setStatus("Researching what your customers actually say…");
    try {
      brand.analysis = await ensureResearch(brand);                 // no-op if external_voc already present
      await BYA.saveBrand(brand.website_url, brand.analysis, state.userId, goal);
      brand.goal = goal;
      state.brands = await BYA.loadBrands();
      state.primaryBrand = state.brands[0] || brand;
      state.goal = goal; state.onboarding = null;
      renderHome();
    } catch (e) {
      ob.step = "goal"; ob.error = e.message || String(e); renderOnboarding();
    }
  }
```

- [ ] **Step 4: Route boot through onboarding**

Replace `initApp` (~lines 950-955) with:

```js
  async function initApp() {
    state.booted = true;
    try { state.brands = await BYA.loadBrands(); } catch (e) { state.brands = []; }
    try { state.ads = await BYA.loadAds(); } catch (e) { state.ads = []; }
    state.primaryBrand = state.brands && state.brands.length ? state.brands[0] : null;
    state.goal = state.primaryBrand ? state.primaryBrand.goal : null;
    if (needsOnboarding()) renderOnboarding();
    else renderHome();
  }
```

- [ ] **Step 5: Verify onboarding renders (browser)**

Run: `npm start` and open the printed `http://localhost:<port>/app` URL. Sign in with an approved test account.
Expected:
- A **brand-new account** (no brands) lands on the onboarding "Let’s learn your brand." URL screen.
- An **existing account with a brand but no goal** lands on the "What are you trying to do right now?" goal screen.
- Picking a goal shows "Researching what your customers actually say…" briefly, then lands on the home view (board comes in Task 6 — for now it’s the old/empty home, which is expected until Task 6).

- [ ] **Step 6: Commit**

```bash
git add app.html
git commit -m "feat(app): onboarding flow — site, one-time research, goal capture"
```

---

## Task 6: Concept board (replace `renderHome` body) + caching

**Files:**
- Modify: `app.html` — replace `renderHome` (~lines 402-451); add board helpers + concept loading + selection

- [ ] **Step 1: Replace `renderHome` with the board**

Replace the entire `function renderHome() { ... }` (through its closing brace at ~line 451, BEFORE `function adIsThisWeek`) with:

```js
  // ───────────────────────── Home = concept board ─────────────────────────
  function conceptCacheKey() { return "bya_concepts_" + (state.primaryBrand && state.primaryBrand.id) + "_" + state.goal; }
  function renderHome() {
    state.view = "home";
    if (needsOnboarding()) { renderOnboarding(); return; }
    if (!state.selected) state.selected = new Set();
    const main = topbarHTML("your strategist · " + GOAL_LABEL[state.goal], "concept board",
        btn("my ads", { icon: "library", size: "sm", attr: ' data-nav="library"' }) +
        btn("↻ regenerate", { size: "sm", id: "boardRegen" })) +
      '<div style="overflow-y:auto;flex:1;padding:48px 56px" id="boardScroll">' + boardBodyHTML() + '</div>' +
      boardFooterHTML();
    $app.innerHTML = shell("home", main);
    wireBoard();
    if (state.concepts === null) loadConcepts();
  }
  function boardBodyHTML() {
    const goalIntro = {
      waitlist: "People who feel the pain and want in early. Catch them before they shop around.",
      trials: "They’re comparing options. Show, concretely, why yours wins.",
      paid: "They already know you. Remove the last reason not to buy.",
    }[state.goal];
    const header =
      '<div style="margin-bottom:36px;max-width:640px">' +
      '<h1 style="font-size:42px;font-weight:500;letter-spacing:-0.02em;line-height:1.05;margin:0 0 10px">What should we make this week?</h1>' +
      '<p style="font-size:17px;color:var(--fg-2);margin:0;line-height:1.5">' + esc(goalIntro) + '</p></div>';
    const focus = GOAL_FOCUS[state.goal] || [];
    const strip = '<div style="margin-bottom:40px;font-size:14px;color:var(--fg-3);display:flex;flex-wrap:wrap;gap:6px 18px">' +
      STAGE_ORDER.map(function (s) {
        const on = focus.indexOf(s) >= 0;
        return '<span style="' + (on ? "color:var(--fg);border-bottom:2px solid var(--accent);padding-bottom:2px;font-weight:600" : "opacity:.6") + '">' + esc(STAGE_META[s].name) + '</span>';
      }).join('<span style="opacity:.3">·</span>') + '</div>';
    if (state.concepts === null) return header + strip + '<div style="display:flex;align-items:center;gap:10px;color:var(--fg-2);font-size:15px"><span class="spinner"></span> your strategist is drafting concepts…</div>';
    if (state.concepts.length === 0) return header + strip + '<div style="border:1px dashed var(--fg);border-radius:8px;padding:32px;color:var(--fg-3)">Couldn’t draft concepts. Tap ↻ regenerate to try again.</div>';
    // Group concepts by stage; render focus stages expanded, others collapsed.
    const byStage = {}; STAGE_ORDER.forEach(function (s) { byStage[s] = []; });
    state.concepts.forEach(function (c, i) { (byStage[c.stage] || byStage.solution).push(i); });
    const sections = STAGE_ORDER.filter(function (s) { return byStage[s].length; }).map(function (s) {
      const isFocus = focus.indexOf(s) >= 0;
      const rows = byStage[s].map(conceptRowHTML).join("");
      const head = '<div style="display:flex;align-items:baseline;gap:12px;margin:0 0 6px">' +
        '<h3 style="font-size:22px;font-weight:500;letter-spacing:-0.01em;margin:0">' + esc(STAGE_META[s].name) + '</h3>' +
        (isFocus ? '<span style="font-size:12px;color:var(--accent);font-weight:600">your focus</span>' : "") + '</div>' +
        '<p style="font-size:14px;color:var(--fg-3);margin:0 0 14px">' + esc(STAGE_META[s].blurb) + '</p>';
      if (isFocus) return '<section style="margin-bottom:40px">' + head + rows + '</section>';
      // Off-focus: collapsed behind a quiet toggle.
      return '<section style="margin-bottom:28px" data-collapse="' + s + '">' + head +
        '<button class="board-more" data-more="' + s + '" style="background:none;border:0;color:var(--accent);cursor:pointer;font-size:13px;padding:0">Show ' + byStage[s].length + ' more →</button>' +
        '<div data-rows="' + s + '" style="display:none">' + rows + '</div></section>';
    }).join("");
    return header + strip + sections;
  }
  function conceptRowHTML(i) {
    const c = state.concepts[i];
    const on = state.selected.has(i);
    return '<button class="concept-row" data-concept="' + i + '" style="display:flex;gap:14px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;border-top:1px solid var(--border-hairline);padding:16px 2px;cursor:pointer;font-family:var(--font-sans)">' +
      '<span style="width:20px;height:20px;border-radius:4px;border:1.5px solid ' + (on ? "var(--accent)" : "var(--fg-3)") + ';background:' + (on ? "var(--accent)" : "transparent") + ';display:grid;place-items:center;flex-shrink:0;margin-top:2px">' + (on ? icon("check", 13, "var(--bg)") : "") + '</span>' +
      '<span style="flex:1;min-width:0">' +
        '<span style="display:block;font-size:16px;color:var(--fg);line-height:1.35">' + esc(c.headline) + '</span>' +
        '<span style="display:block;font-size:13px;color:var(--fg-3);margin-top:4px">' + esc(c.angle) + (c.rationale ? ' · ' + esc(c.rationale) : "") + '</span>' +
      '</span></button>';
  }
  function boardFooterHTML() {
    const n = state.selected ? state.selected.size : 0;
    return '<div style="padding:16px 40px;border-top:1px solid var(--fg);background:var(--bg);display:flex;justify-content:space-between;align-items:center">' +
      '<span style="font-size:14px;color:var(--fg-2)">' + n + ' concept' + (n === 1 ? "" : "s") + ' selected</span>' +
      btn("next", { variant: "primary", iconRight: "arrow-right", id: "boardNext", disabled: n === 0 }) + '</div>';
  }
  async function loadConcepts() {
    // Cache hit?
    try { const cached = localStorage.getItem(conceptCacheKey()); if (cached) { state.concepts = JSON.parse(cached); renderHome(); return; } } catch (e) {}
    try {
      const concepts = await BYA.generateConcepts((state.primaryBrand && state.primaryBrand.analysis) || {}, state.goal);
      state.concepts = concepts;
      try { localStorage.setItem(conceptCacheKey(), JSON.stringify(concepts)); } catch (e) {}
    } catch (e) { state.concepts = []; }
    if (state.view === "home") renderHome();
  }
  function wireBoard() {
    const regen = document.getElementById("boardRegen");
    if (regen) regen.addEventListener("click", function () { try { localStorage.removeItem(conceptCacheKey()); } catch (e) {} state.concepts = null; state.selected = new Set(); renderHome(); });
    const next = document.getElementById("boardNext");
    if (next) next.addEventListener("click", goToCreate);
    $app.querySelectorAll("[data-concept]").forEach(function (b) {
      b.addEventListener("click", function () {
        const i = parseInt(b.getAttribute("data-concept"), 10);
        if (state.selected.has(i)) state.selected.delete(i); else state.selected.add(i);
        renderHome();
      });
    });
    $app.querySelectorAll("[data-more]").forEach(function (b) {
      b.addEventListener("click", function () {
        const s = b.getAttribute("data-more");
        const rows = $app.querySelector('[data-rows="' + s + '"]');
        if (rows) { rows.style.display = "block"; b.style.display = "none"; }
      });
    });
  }
```

- [ ] **Step 2: Add the `goToCreate` handoff stub (filled in Task 7)**

Add right after `wireBoard` (it is referenced above; define it now so the file parses, completed in Task 7):

```js
  function goToCreate() {
    const concepts = Array.from(state.selected).map(function (i) { return state.concepts[i]; }).filter(Boolean);
    if (!concepts.length) return;
    state.pendingConcepts = concepts;
    startWorkbench(state.primaryBrand.website_url);
  }
```

- [ ] **Step 3: Verify the board renders (browser)**

Run: `npm start`, open `/app`, sign in as a user whose primary brand has a goal (complete onboarding once if needed).
Expected:
- Home shows "What should we make this week?", the funnel strip with the two goal stages underlined in blue, then "your strategist is drafting concepts…" with a spinner, then concept rows grouped under stage headings.
- Focus stages are expanded; off-focus stages show "Show N more →" that expands on click.
- Clicking a row toggles its checkbox and updates the footer "N concepts selected"; the **next** button enables when ≥1 selected.
- Reloading the page shows concepts instantly (served from `localStorage`); **↻ regenerate** clears them and re-drafts.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat(app): concept board home — stage-grouped, goal-focused, batch-select"
```

---

## Task 7: Board → workbench handoff (thread selected concepts)

**Files:**
- Modify: `app.html` — `startWorkbench` (~lines 525-541) to consume `state.pendingConcepts`

- [ ] **Step 1: Add `selectedConcepts` to the `wb` object and consume pending concepts**

In `startWorkbench`, change the `state.wb = { ... }` initializer to include `selectedConcepts`, and pull from `state.pendingConcepts`. Replace the assignment block:

```js
    state.wb = {
      url: url, brandId: match ? match.id : null, analysis: match ? match.analysis : null,
      brandJson: match ? JSON.stringify(match.analysis, null, 2) : null,
      name: match ? (match.name || hostOf(url)) : hostOf(url),
      palette: match ? derivePalette(match.analysis) : { bg: "#0a0a0a", fg: "#f4efe6", accent: "#1a3df0", name: hostOf(url) },
      logoUrls: [], productAssets: [],
      refImageDataUrl: null, logoDataUrl: null,
      stage: match ? "pick-ref" : "analyzing",
      baseAdPromptObj: null, aspect: "1:1",
      angles: [], results: [], selIdx: 0, analyzeError: null,
      selectedConcepts: state.pendingConcepts || null,
    };
    state.pendingConcepts = null;
```

- [ ] **Step 2: Verify the handoff (browser)**

Run: `npm start`, open `/app`, select 2-3 concepts on the board, click **next**.
Expected: the workbench opens directly on the "Drop a reference." step (step 2 of 3) for the primary brand — no "Which brand?" modal. (Rendering of the batch is wired in Task 9.) In DevTools console, `state` is not exposed, so instead confirm visually that you skipped straight to pick-ref.

- [ ] **Step 3: Commit**

```bash
git add app.html
git commit -m "feat(app): carry selected concepts from board into the workbench"
```

---

## Task 8: Product/UI image upload control in `pick-ref`

**Files:**
- Modify: `app.html` — `refPickerHTML` (~lines 640-659) to add a product-image dropzone; `wireWorkbench` (~lines 772-788) to wire it

- [ ] **Step 1: Add a product-image dropzone + thumbnails to `refPickerHTML`**

In `refPickerHTML`, insert this block **after** the logo row's closing `</div>` and **before** `brandChipHTML(wb)`:

```js
      // Product / UI screenshot (optional) — fed to the renderer as the real product visual.
      '<div style="margin-bottom:24px">' +
        '<div style="font-size:13px;color:var(--fg-2);margin-bottom:8px"><strong style="color:var(--fg)">product screenshot</strong> — optional. Drop your real UI/product image so the ad shows it exactly (not an invented screen).</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          wb.productAssets.map(function (u, i) {
            return '<div style="position:relative;width:72px;height:72px;border:1px solid var(--fg);border-radius:4px;overflow:hidden;background:var(--bg-raised)">' +
              '<img src="' + esc(u) + '" alt="product" style="width:100%;height:100%;object-fit:cover" />' +
              '<button data-prodrm="' + i + '" title="remove" style="position:absolute;top:2px;right:2px;background:var(--bg);border:1px solid var(--fg);border-radius:3px;cursor:pointer;padding:1px 3px;line-height:1">' + icon("x", 11) + '</button></div>';
          }).join("") +
          '<div class="dropzone" id="prodDrop" style="width:72px;height:72px;flex-shrink:0">' + icon("plus", 18, "var(--fg-3)") + '</div>' +
        '</div></div>' +
```

(Concretely: the function currently ends `... brandChipHTML(wb) + '</div>';` — insert the block immediately before `brandChipHTML(wb)` so the string concatenation stays valid.)

- [ ] **Step 2: Wire the product dropzone + remove buttons in `wireWorkbench`**

In `wireWorkbench`, after the `attachDrop(document.getElementById("logoDrop"), ...)` line, add:

```js
    attachDrop(document.getElementById("prodDrop"), function (f) { fileToDataUrl(f, 1400).then(function (u) { wb.productAssets = wb.productAssets.concat([u]); renderWorkbench(); }); });
    $app.querySelectorAll("[data-prodrm]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); const i = parseInt(b.getAttribute("data-prodrm"), 10); wb.productAssets = wb.productAssets.filter(function (_, j) { return j !== i; }); renderWorkbench(); }); });
```

Note: this keeps product images **in-memory for the current render** (feeds `wb.productAssets`, which `runPipeline`/`makeAdPrompt`/`renderOneImage` already pass to KIE). Persisting uploads back to the `brand_assets` table is out of scope for v1 (the existing silent `loadBrandAssets` continues to surface previously-saved assets).

- [ ] **Step 3: Verify (browser)**

Run: `npm start`, open `/app`, reach the workbench `pick-ref` step. 
Expected: a "product screenshot" dropzone appears under the logo. Dropping an image shows a 72px thumbnail with an ✕ remove button; removing it clears the thumbnail. Reference + logo still gate the "make my ad" button as before.

- [ ] **Step 4: Commit**

```bash
git add app.html
git commit -m "feat(app): add product/UI image upload to the reference step"
```

---

## Task 9: Batch-render the selected concepts in `runPipeline`

**Files:**
- Modify: `app.html` — `runPipeline` (~lines 799-838); `previewReady` (~lines 724-738) for a loading state

- [ ] **Step 1: Add a loading branch to `previewReady`**

In `previewReady`, immediately after `const r = wb.results[wb.selIdx];`, add:

```js
    if (r && r.loading) {
      return '<div style="width:340px;aspect-ratio:1/1;border:1px solid var(--fg);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--bg-raised)"><span class="spinner"></span><span style="font-family:var(--font-mono);font-size:11px;color:var(--fg-3)">rendering…</span></div>';
    }
```

- [ ] **Step 2: Branch `runPipeline` on `wb.selectedConcepts`**

Replace the body of `runPipeline` (the `try { ... }` block) with:

```js
  async function runPipeline() {
    const wb = state.wb; if (!wb) return;
    if (!wb.refImageDataUrl || !wb.logoDataUrl) return;
    wb.stage = "drawing"; renderWorkbench();
    const setStatus = function (m) { const el = document.getElementById("drawStatus"); if (el) el.textContent = m; };
    try {
      setStatus("studying your reference…");
      const stage2 = await BYA.makeAdPrompt({ brandJson: wb.brandJson, refImageDataUrl: wb.refImageDataUrl, productAssets: wb.productAssets, mode: "exact" });
      const prep = BYA.prepareStage3(stage2);
      wb.baseAdPromptObj = prep.adPromptObj;
      wb.aspect = prep.aspect || "1:1";
      const baseCopy = (prep.adPromptObj && prep.adPromptObj.copy) || {};
      const baseHeadline = baseCopy.headline || wb.name;

      // BATCH PATH: render exactly the concepts the founder selected, all at once.
      if (wb.selectedConcepts && wb.selectedConcepts.length) {
        wb.angles = wb.selectedConcepts.slice();
        wb.results = wb.angles.map(function () { return {}; }); // empty → renderAngleImage will set loading
        wb.selIdx = 0;
        wb.stage = "ready";
        renderWorkbench();
        wb.angles.forEach(function (_, i) { renderAngleImage(i); }); // concurrent; each tile fills in
        return;
      }

      // FALLBACK PATH (no pre-selected concepts): today's behavior, unchanged.
      const anglesPromise = BYA.generateAngles(baseCopy, wb.brandJson, 5).catch(function () { return []; });
      setStatus("rendering your first ad…");
      const baseResult = await renderOneImage(prep.adPromptStr, setStatus);
      let angles = await anglesPromise;
      if (!angles.length) angles = [{ angle: "headline", headline: baseHeadline, color_treatment: null }];
      wb.angles = angles;
      wb.results = angles.map(function () { return {}; });
      wb.selIdx = 0;
      if (baseResult.ok) {
        wb.results[0] = { url: baseResult.urls[0], headline: angles[0].headline, prompt: prep.adPromptStr };
        saveAdSilently(wb.results[0], angles[0]);
      } else {
        wb.results[0] = { error: baseResult.error };
      }
      wb.stage = "ready";
      renderWorkbench();
    } catch (e) {
      wb.stage = "pick-ref"; wb.analyzeError = null;
      renderWorkbench();
      flash(e.message || String(e));
    }
  }
```

Note: `renderAngleImage(i)` already (a) bails if `results[i]` has a url/loading, (b) sets `{loading:true}`, (c) builds the prompt via `buildVariantPrompt(wb.baseAdPromptObj, wb.angles[i], wb.productAssets.length)`, (d) renders, (e) saves via `saveAdSilently`. Passing empty `{}` results lets it proceed; concepts without `color_treatment` fall back to the base treatment inside `buildVariantPrompt`. No engine code changes.

- [ ] **Step 3: Verify the batch render end-to-end (browser)**

Run: `npm start`, open `/app`. On the board, select 3 concepts → **next** → drop a reference ad + confirm logo (+ optional product image) → **make my ad**.
Expected:
- The workbench goes to the "ready" view showing **3 angle rows** (your 3 concepts) and a 3-thumb variant strip.
- All 3 tiles render concurrently (spinners → images), not one-at-a-time-on-click. Each tile’s image reflects its concept’s headline.
- Concepts you did **not** select are never rendered. Selecting an already-rendered thumb just shows it (no re-render).
- Each rendered ad appears in **my ads** (via the existing `saveAdSilently`).

- [ ] **Step 4: Verify the fallback path still works (browser)**

From the rail, click **make an ad** → "Which brand?" modal → pick the brand → drop a reference → make my ad.
Expected: today's behavior — 5 auto-generated angles, base image rendered first, the rest lazily on click. (Confirms backward compatibility.)

- [ ] **Step 5: Commit**

```bash
git add app.html
git commit -m "feat(app): batch-render selected concepts; preserve generateAngles fallback"
```

---

## Task 10: Final integration pass + self-check

**Files:** none (verification only), unless fixes are needed.

- [ ] **Step 1: Full happy-path run**

Run: `npm start`, open `/app`. Use a fresh approved account:
1. Onboarding: enter a real SaaS URL → wait through analyze + research → pick a goal.
2. Board: confirm stage grouping, goal-focus highlight, brand-voice headlines, no fabricated metrics.
3. Select a stack (e.g. 4 concepts) across stages → **next**.
4. Drop a reference + logo + product screenshot → **make my ad**.
5. Confirm all 4 render together and land in **my ads**.

- [ ] **Step 2: Cache + regenerate check**

Reload `/app` → board appears instantly (localStorage). Tap **↻ regenerate** → new concepts drafted, selection cleared. Change requires re-selecting.

- [ ] **Step 3: Console-error sweep**

With DevTools open across the whole flow, confirm there are no uncaught exceptions (red errors). Investigate and fix any that appear.

- [ ] **Step 4: Confirm the engine was not touched**

Run: `git diff --name-only main -- bya-prompts.js`
Expected: **no output** (the Stage 1/2 prompts are unchanged — concept work is additive in `bya-pipeline.js`/`app.html` only).

Run: `git log --oneline main..HEAD -- server.js`
Expected: **no commits** (no server changes were required).

- [ ] **Step 5: Final commit (only if fixes were made)**

```bash
git add -A
git commit -m "fix(app): integration fixes for concept-board flow"
```

---

## Self-review (author check against the spec)

- **§A onboarding (URL + research + goal):** Tasks 5 (flow), 1/2 (goal column + plumbing), 3 (research). ✅
- **§B board (header, funnel strip, stage sections, focus, concept rows, sticky footer, regenerate):** Task 6. ✅
- **§C1 concept ideation (grounded, persona, stage-tagged, cached):** Task 4 (ideation), Task 6 (localStorage cache + regenerate). ✅
- **§C2 external VOC pass (one-time, `:online`, cached in `analysis.external_voc`):** Task 3 + `ensureResearch` in Task 5. ✅
- **§D integration (skip modal → pick-ref; product upload; selectedConcepts; eager batch via variant path; fallback):** Tasks 7 (handoff), 8 (product upload), 9 (batch + fallback). ✅
- **Goal storage = `brands.goal` (not profiles):** Tasks 1/2. ✅
- **Engine untouched:** verified in Task 10 step 4; all new functions are additive, `/chat` reused, no prompt/server edits. ✅
- **Single-brand default = most-recent:** `needsOnboarding`/`initApp` use `state.brands[0]` (loadBrands is `updated_at desc`). ✅
- **No fabricated metrics:** enforced in the `generateConcepts` grounding rule (Task 4). ✅

**Type/name consistency:** `state.selected` is a `Set` (Task 5 declares, Task 6 uses); `state.concepts`/`state.pendingConcepts`/`wb.selectedConcepts` names match across Tasks 6/7/9; `GOAL_FOCUS`/`GOAL_LABEL`/`STAGE_ORDER`/`STAGE_META` defined once (Task 5) and used in Task 6; `conceptFocusForGoal` (pipeline, Task 4) mirrors `GOAL_FOCUS` (UI). `BYA.researchCustomers`/`BYA.generateConcepts` defined+exported (Tasks 3/4) before first use (Task 5/6).
