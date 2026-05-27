# TS Backend — Brand DNA Slice (Plan 2 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the second backend vertical slice — `POST /api/brand`: given `{ url, measuredSiteData }`, run the Stage-1 "Extract Brand DNA v3" prompt through OpenRouter (`:online` always on) and return a validated, versioned `BrandExtraction` JSON.

**Architecture:** Extends the layered backend from Plan 1 (routes → pipelines → services). Adds the first OpenRouter service client, a tolerant `BrandExtraction` zod contract in `packages/shared`, a versioned prompt module + registry, and the brand pipeline with the LLM-JSON guard (parse → validate → **one repair retry** → typed error). Stage 1 runs as **3 parallel OpenRouter agents** (`:online` on each), each emitting a disjoint slice of the 11-section JSON; the pipeline merges the slices. This avoids truncated/lazy single-shot output on the large schema (the proven legacy approach), and is purely internal — it doesn't change the `BrandExtraction` contract, the route, or Stage 2.

**Tech Stack:** TypeScript, Node ≥ 20 (ESM), Express 4, OpenRouter chat-completions (via `fetch`), zod, Vitest, supertest, tsx.

This is **Plan 2 of 5**. Persistence is intentionally **deferred to Plan 5** — `POST /api/brand` returns `{ brandExtraction }` (no `id`, no Supabase) for now. Spec: `docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md`. Builds on Plan 1 (`docs/superpowers/plans/2026-05-28-ts-backend-foundation-and-extract.md`).

---

## File Structure

Created/modified in this plan:

```
packages/shared/
  src/brand-extraction.ts            # NEW — BrandExtraction zod schema (11 sections + source_map, versioned, tolerant) + BrandRequest
  src/index.ts                       # MODIFY — re-export brand-extraction
apps/backend/
  package.json                       # MODIFY — add "run:brand" script
  src/config/index.ts                # MODIFY — loadEnvFile searches upward for the nearest .env
  src/lib/errors.ts                  # MODIFY — add OpenRouterError (stage-parameterized)
  src/lib/json.ts                    # NEW — parseJsonLoose (+ stripFences, sanitizeJsonish), ported from legacy
  src/services/openrouter.ts         # NEW — chat({model,messages,online,stage}) → assistant content
  src/prompts/extract-brand-dna.v3.ts# NEW — v3 system prompt text
  src/prompts/registry.ts            # NEW — buildStage1Prompt() + BRAND_AGENT_GROUPS + buildAgentPrompt()
  src/pipelines/brand.ts             # NEW — runBrand({url,measuredSiteData}) → BrandExtraction (3-agent parallel merge)
  src/routes/brand.ts                # NEW — POST /api/brand
  src/server.ts                      # MODIFY — wire brandRouter
  scripts/run-brand.ts               # NEW — manual runner (extract → brand) against a real site
  tests/env-loader.test.ts           # NEW — loadEnvFile upward search
  tests/errors.test.ts               # MODIFY — add OpenRouterError cases
  tests/json.test.ts                 # NEW — parseJsonLoose
  tests/openrouter.test.ts           # NEW — chat() with fetch mocked
  tests/prompts.test.ts              # NEW — Stage-1 builder
  tests/brand.pipeline.test.ts       # NEW — runBrand orchestration + repair path
  tests/brand.routes.test.ts         # NEW — POST /api/brand
  tests/brand.e2e.test.ts            # NEW — gated real OpenRouter+Playwright smoke
```

**Conventions carried from Plan 1:** Windows + PowerShell; the repo lives in OneDrive (transient file locks — retry once on a failed file op). Never run a bare emitting `tsc` — always `tsc --noEmit`; before committing run `git status --porcelain` and stage only the explicit paths so no stray emitted `.js`/`.d.ts` get committed. Commit messages end with a trailing `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` line. Do NOT push (the controller handles pushing).

---

## Task 1: `BrandExtraction` zod contract in `packages/shared`

The contract that Stage 1 produces and Stage 2 (Plan 3) will consume. It mirrors the JSON in `docs/extra files/Extract Brand DNA Prompt v3.txt` (section 11). It is **tolerant**: every top-level section is optional and each object `.passthrough()`es unknown keys, so model drift and (in Plan 5) older persisted rows still parse. The meaningful validation the schema adds over raw parsing is "the result is a JSON **object** (not an array/string/number), shaped like a brand profile." `schema_version` is stamped by the pipeline (Task 7), not the model.

**Files:**
- Create: `packages/shared/src/brand-extraction.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/brand-extraction.ts`**

```ts
import { z } from "zod";

/** Free-form string list (e.g. value props, search queries). */
const strList = z.array(z.string());
/** Heterogeneous list whose items vary (strings or objects) across sites; kept loose on purpose. */
const looseList = z.array(z.unknown());

const BrandIdentity = z
  .object({
    brand_name: z.string().optional(),
    product_name: z.string().optional(),
    website_url: z.string().optional(),
    landing_page_url: z.string().optional(),
    category: z.string().optional(),
    one_line_description: z.string().optional(),
    primary_customer: z.string().optional(),
    primary_industry: z.string().optional(),
    primary_role: z.string().optional(),
    primary_outcome: z.string().optional(),
    positioning_statement: z.string().optional(),
    confidence: z.string().optional(),
  })
  .passthrough();

const VisualBrandSystem = z
  .object({
    logos: looseList.optional(),
    colors: z
      .object({
        primary: strList.optional(),
        secondary: strList.optional(),
        accent: strList.optional(),
        neutral: strList.optional(),
        background: strList.optional(),
        text: strList.optional(),
        cta: strList.optional(),
      })
      .passthrough()
      .optional(),
    typography: z
      .object({
        font_families: strList.optional(),
        heading_style: z.string().optional(),
        body_style: z.string().optional(),
        button_style: z.string().optional(),
        casing_style: z.string().optional(),
      })
      .passthrough()
      .optional(),
    ui_style: z
      .object({
        button_style: z.string().optional(),
        card_style: z.string().optional(),
        corner_radius: z.string().optional(),
        border_style: z.string().optional(),
        shadow_style: z.string().optional(),
        icon_style: z.string().optional(),
        illustration_style: z.string().optional(),
        screenshot_style: z.string().optional(),
        spacing_style: z.string().optional(),
        layout_style: z.string().optional(),
        overall_mood: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const ProductRepresentation = z
  .object({
    screenshots: looseList.optional(),
    dashboard_visuals: looseList.optional(),
    feature_visuals: looseList.optional(),
    workflow_visuals: looseList.optional(),
    integration_visuals: looseList.optional(),
    recommended_ad_visuals: looseList.optional(),
    visuals_to_avoid: looseList.optional(),
  })
  .passthrough();

const OfferDna = z
  .object({
    product: z.string().optional(),
    main_problem_solved: z.string().optional(),
    main_promise: z.string().optional(),
    main_use_case: z.string().optional(),
    target_customer: z.string().optional(),
    target_industry: z.string().optional(),
    target_role: z.string().optional(),
    key_features: strList.optional(),
    key_benefits: strList.optional(),
    pricing_model: z.string().optional(),
    plans: looseList.optional(),
    free_trial: z.string().optional(),
    demo_available: z.string().optional(),
    entry_offer: z.string().optional(),
    primary_cta: z.string().optional(),
    secondary_cta: z.string().optional(),
    sales_motion: z.string().optional(),
    risk_reversal: z.string().optional(),
    guarantee: z.string().optional(),
    onboarding_promise: z.string().optional(),
    time_to_value: z.string().optional(),
    integrations: looseList.optional(),
    main_differentiator: z.string().optional(),
  })
  .passthrough();

const MessagingFoundation = z
  .object({
    homepage_headline: z.string().optional(),
    homepage_subheadline: z.string().optional(),
    value_props: strList.optional(),
    features: strList.optional(),
    benefits: strList.optional(),
    use_cases: strList.optional(),
    customer_segments: strList.optional(),
    pain_points_mentioned: strList.optional(),
    outcomes_mentioned: strList.optional(),
    objections_addressed: strList.optional(),
    faq_themes: strList.optional(),
    cta_language: strList.optional(),
    repeated_phrases: strList.optional(),
    headline_patterns: strList.optional(),
    tone_notes: strList.optional(),
  })
  .passthrough();

const ProofLibrary = z
  .object({
    customer_logos: looseList.optional(),
    testimonials: looseList.optional(),
    case_study_metrics: looseList.optional(),
    roi_claims: looseList.optional(),
    usage_numbers: looseList.optional(),
    review_ratings: looseList.optional(),
    security_badges: looseList.optional(),
    press_mentions: looseList.optional(),
    awards: looseList.optional(),
    safe_ad_proof_points: looseList.optional(),
  })
  .passthrough();

const CustomerDnaFromWebsite = z
  .object({
    brand_claims_about_customers: looseList.optional(),
    real_customer_quotes: looseList.optional(),
    pains: looseList.optional(),
    desired_outcomes: looseList.optional(),
    objections: looseList.optional(),
    buying_triggers: looseList.optional(),
    alternatives: looseList.optional(),
    decision_criteria: looseList.optional(),
    exact_phrases: looseList.optional(),
  })
  .passthrough();

const ExternalCustomerResearchPlan = z
  .object({
    recommended_subreddits: strList.optional(),
    review_sites: strList.optional(),
    communities: strList.optional(),
    search_queries: strList.optional(),
    competitor_review_targets: strList.optional(),
    what_to_extract: strList.optional(),
  })
  .passthrough();

const CompetitorIntelligence = z
  .object({
    direct_competitors: looseList.optional(),
    indirect_competitors: looseList.optional(),
    manual_alternatives: looseList.optional(),
    comparison_pages: looseList.optional(),
    differentiators: looseList.optional(),
    category_norms: looseList.optional(),
    research_needed: looseList.optional(),
  })
  .passthrough();

const ClaimConstraints = z
  .object({
    allowed_claims: looseList.optional(),
    claims_requiring_proof: looseList.optional(),
    unsupported_claims: looseList.optional(),
    forbidden_claims: looseList.optional(),
    required_disclaimers: looseList.optional(),
    correct_terms: looseList.optional(),
    terms_to_avoid: looseList.optional(),
    compliance_notes: looseList.optional(),
  })
  .passthrough();

const MissingInformation = z
  .object({
    must_ask_client: strList.optional(),
    nice_to_have: strList.optional(),
    not_found_on_website: strList.optional(),
  })
  .passthrough();

const SourceMapEntry = z
  .object({
    field: z.string().optional(),
    value: z.string().optional(),
    source_url: z.string().optional(),
    confidence: z.string().optional(),
  })
  .passthrough();

export const BrandExtraction = z
  .object({
    schema_version: z.number().optional(),
    brand_identity: BrandIdentity.optional(),
    visual_brand_system: VisualBrandSystem.optional(),
    product_representation: ProductRepresentation.optional(),
    offer_dna: OfferDna.optional(),
    messaging_foundation: MessagingFoundation.optional(),
    proof_library: ProofLibrary.optional(),
    customer_dna_from_website: CustomerDnaFromWebsite.optional(),
    external_customer_research_plan: ExternalCustomerResearchPlan.optional(),
    competitor_intelligence: CompetitorIntelligence.optional(),
    claim_constraints: ClaimConstraints.optional(),
    missing_information: MissingInformation.optional(),
    source_map: z.array(SourceMapEntry).optional(),
  })
  .passthrough();

export type BrandExtraction = z.infer<typeof BrandExtraction>;

/** Request body for POST /api/brand. */
export const BrandRequest = z.object({
  url: z.string(),
  measuredSiteData: z.unknown(),
});

export type BrandRequest = z.infer<typeof BrandRequest>;
```

- [ ] **Step 2: Re-export from `packages/shared/src/index.ts`**

Add the line below the existing `export * from "./measured-site-data.js";`:

```ts
export * from "./brand-extraction.js";
```

- [ ] **Step 3: Type-check the workspace**

Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors. (The backend resolves `@bya/shared` so this also proves the new export compiles.)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/brand-extraction.ts packages/shared/src/index.ts
git commit -m "feat(shared): BrandExtraction zod contract

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `loadEnvFile` searches upward for the nearest `.env`

npm runs workspace scripts with cwd = `apps/backend`, but the real `.env` lives at the repo root. The Plan-1 `loadEnvFile(process.cwd())` therefore never finds it — fine for `/extract` (no keys), but `/brand` needs `OPENROUTER_API_KEY` + `STAGE1_MODEL`. Make the loader walk up from the start dir to the first `.env`. "Real `process.env` wins" is preserved.

**Files:**
- Modify: `apps/backend/src/config/index.ts`
- Create: `apps/backend/tests/env-loader.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/env-loader.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";

const KEY = "BYA_ENVLOADER_TEST";

afterEach(() => {
  delete process.env[KEY];
});

describe("loadEnvFile upward search", () => {
  it("finds a .env in a parent directory when started from a nested cwd", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bya-env-"));
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from_parent\n`, "utf8");
    const nested = path.join(root, "apps", "backend");
    fs.mkdirSync(nested, { recursive: true });

    loadEnvFile(nested);
    expect(process.env[KEY]).toBe("from_parent");
  });

  it("does not overwrite a value already present in process.env", () => {
    process.env[KEY] = "already_set";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bya-env-"));
    fs.writeFileSync(path.join(root, ".env"), `${KEY}=from_file\n`, "utf8");

    loadEnvFile(root);
    expect(process.env[KEY]).toBe("already_set");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- env-loader`
Expected: FAIL — the first test fails because the current `loadEnvFile` only reads `<dir>/.env` and does not walk up. (Capture the failure.)

- [ ] **Step 3: Replace the `loadEnvFile` function in `apps/backend/src/config/index.ts`**

Replace the existing `loadEnvFile` (keep the `fs`/`path` imports and everything else in the file unchanged):

```ts
/** Hand-rolled .env loader (legacy convention): real process.env wins over the file.
 *  Searches upward from startDir for the nearest .env (monorepo: scripts run from a
 *  workspace dir, but .env lives at the repo root). */
export function loadEnvFile(startDir: string = process.cwd()): void {
  let dir = startDir;
  for (;;) {
    let txt: string;
    try {
      txt = fs.readFileSync(path.join(dir, ".env"), "utf8");
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return; // reached filesystem root, no .env found
      dir = parent;
      continue;
    }
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
    return;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- env-loader`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `npm --workspace @bya/backend run test`
Expected: all prior suites still pass; e2e skipped.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/config/index.ts apps/backend/tests/env-loader.test.ts
git commit -m "feat(backend): loadEnvFile searches upward for nearest .env

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `OpenRouterError` typed error

**Files:**
- Modify: `apps/backend/src/lib/errors.ts`
- Modify: `apps/backend/tests/errors.test.ts`

- [ ] **Step 1: Add failing test cases to `apps/backend/tests/errors.test.ts`**

Add this `describe` block to the existing file (and add `OpenRouterError` to the existing import from `../src/lib/errors.js`):

```ts
describe("OpenRouterError", () => {
  it("defaults to the brand stage with a 502 status", () => {
    const e = new OpenRouterError("upstream 500");
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("OPENROUTER_ERROR");
    expect(e.status).toBe(502);
    expect(e.stage).toBe("brand");
  });

  it("accepts an explicit stage", () => {
    expect(new OpenRouterError("boom", "ad-prompt").stage).toBe("ad-prompt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: FAIL — `OpenRouterError` is not exported.

- [ ] **Step 3: Add `OpenRouterError` to `apps/backend/src/lib/errors.ts`**

Add this class after `ValidationError` (leave everything else unchanged):

```ts
export class OpenRouterError extends AppError {
  constructor(message: string, stage: Stage = "brand") {
    super(message, "OPENROUTER_ERROR", 502, stage);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: PASS (all errors tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/tests/errors.test.ts
git commit -m "feat(backend): OpenRouterError typed error

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `lib/json.ts` — tolerant LLM JSON parsing

Ported **verbatim** (logic) from `legacy/bya-pipeline.js`, typed. Pulls a JSON object out of a model reply that may be fenced, comment-laden, or trailing-comma'd.

**Files:**
- Create: `apps/backend/src/lib/json.ts`
- Create: `apps/backend/tests/json.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/json.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseJsonLoose } from "../src/lib/json.js";

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("tolerates // comments and trailing commas", () => {
    expect(parseJsonLoose('{\n  "a": 1, // note\n  "b": 2,\n}')).toEqual({ a: 1, b: 2 });
  });

  it("extracts the outermost object when surrounded by prose", () => {
    expect(parseJsonLoose('Sure! Here you go: {"a":1} — hope that helps')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseJsonLoose("I cannot comply with that request.")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- json`
Expected: FAIL — cannot find module `../src/lib/json.js`.

- [ ] **Step 3: Create `apps/backend/src/lib/json.ts`**

```ts
/** Pull JSON out of a model reply that may be wrapped in ```json ... ``` fences. */
export function stripFences(s: string): string {
  const m = String(s).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/** Strip JS-style comments and trailing commas WITHOUT touching string literals. */
export function sanitizeJsonish(s: string): string {
  let out = "";
  let i = 0;
  const n = s.length;
  let inStr = false;
  let quote = "";
  while (i < n) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") {
        out += s[i + 1] || "";
        i += 2;
        continue;
      }
      if (c === quote) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** Parse JSON tolerantly: strip fences; retry after sanitizing; else grab the outermost {…}. */
export function parseJsonLoose(s: string): unknown {
  const cleaned = stripFences(s);
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const sanitized = sanitizeJsonish(cleaned);
  try {
    return JSON.parse(sanitized);
  } catch {
    /* fall through */
  }
  const a = sanitized.indexOf("{");
  const b = sanitized.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(sanitized.slice(a, b + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("no JSON object found in response");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- json`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/json.ts apps/backend/tests/json.test.ts
git commit -m "feat(backend): tolerant LLM JSON parsing helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `services/openrouter.ts` — chat client

The first external LLM client. Reads `OPENROUTER_API_KEY` from `process.env` directly (never via `/api/config`, which only exposes presence flags). Appends `:online` to the model when `online` is set. Maps any failure to `OpenRouterError`. Returns the assistant message content string.

**Files:**
- Create: `apps/backend/src/services/openrouter.ts`
- Create: `apps/backend/tests/openrouter.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/openrouter.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chat } from "../src/services/openrouter.js";
import { OpenRouterError } from "../src/lib/errors.js";

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
});
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
  vi.unstubAllGlobals();
});

describe("chat", () => {
  it("posts to OpenRouter with bearer auth and returns the assistant content", async () => {
    const fn = mockFetchOnce(200, { choices: [{ message: { content: "hello" } }] });
    const out = await chat({ model: "x/model", messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("hello");
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
    expect(JSON.parse(init.body).model).toBe("x/model");
  });

  it("appends :online to the model when online is set", async () => {
    const fn = mockFetchOnce(200, { choices: [{ message: { content: "{}" } }] });
    await chat({ model: "x/model", messages: [{ role: "user", content: "hi" }], online: true });
    expect(JSON.parse(fn.mock.calls[0][1].body).model).toBe("x/model:online");
  });

  it("throws OpenRouterError on a non-2xx response", async () => {
    mockFetchOnce(500, { error: { message: "boom" } });
    await expect(chat({ model: "x/model", messages: [] })).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("throws OpenRouterError when the API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(chat({ model: "x/model", messages: [] })).rejects.toBeInstanceOf(OpenRouterError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- openrouter`
Expected: FAIL — cannot find module `../src/services/openrouter.js`.

- [ ] **Step 3: Create `apps/backend/src/services/openrouter.ts`**

```ts
import { OpenRouterError, type Stage } from "../lib/errors.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatArgs = {
  model: string;
  messages: ChatMessage[];
  online?: boolean;
  /** Used only to stamp the stage on a thrown OpenRouterError. */
  stage?: Stage;
};

type ChatCompletion = { choices?: { message?: { content?: string } }[] };

export async function chat({ model, messages, online, stage = "brand" }: ChatArgs): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY is not set.", stage);
  if (!model) throw new OpenRouterError("No model is configured for this stage.", stage);

  let resolvedModel = model;
  if (online && !resolvedModel.endsWith(":online")) resolvedModel += ":online";

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: resolvedModel, messages }),
    });
  } catch (e) {
    throw new OpenRouterError(e instanceof Error ? e.message : String(e), stage);
  }

  const text = await res.text();
  if (!res.ok) throw new OpenRouterError(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`, stage);

  let data: ChatCompletion;
  try {
    data = JSON.parse(text) as ChatCompletion;
  } catch {
    throw new OpenRouterError("OpenRouter returned a non-JSON response.", stage);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new OpenRouterError("OpenRouter returned no content.", stage);
  return content;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- openrouter`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/openrouter.ts apps/backend/tests/openrouter.test.ts
git commit -m "feat(backend): OpenRouter chat service client

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Stage-1 prompt module + registry (3 parallel agents)

The v3 `.txt` prompt becomes a typed module: its system text, a builder that grounds it with the measured site data (ported from legacy `buildGroundedPrompt`), the **3 agent groups** (disjoint slices of the 11 sections + `source_map`), and a per-agent directive builder (ported from legacy `runAgent`) telling each parallel worker to return ONLY its keys. Stage-2 selection lands in Plan 3.

**Files:**
- Create: `apps/backend/src/prompts/extract-brand-dna.v3.ts`
- Create: `apps/backend/src/prompts/registry.ts`
- Create: `apps/backend/tests/prompts.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/prompts.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildStage1Prompt, buildAgentPrompt, BRAND_AGENT_GROUPS } from "../src/prompts/registry.js";
import type { MeasuredSiteData } from "@bya/shared";

const measured: MeasuredSiteData = {
  title: "Acme",
  description: "do things",
  colors: { text: [{ hex: "#111111", count: 9 }], background: [], border: [], accent_cta: [] },
  cssColorVariables: {},
  fonts: { body: "Inter", heading: null, button: null },
  logos: [],
  text: "Acme builds widgets.",
  finalUrl: "https://acme.com/",
};

describe("buildStage1Prompt", () => {
  it("grounds the v3 system prompt with the measured site data and url", () => {
    const p = buildStage1Prompt("https://acme.com", measured);
    expect(p).toContain("MEASURED SITE DATA (authoritative)");
    expect(p).toContain("#111111"); // exact measured color is embedded
    expect(p).toContain("Acme builds widgets."); // page text is embedded
    expect(p).toContain("https://acme.com"); // url is present
    expect(p).toContain("Final Output Format"); // v3 system prompt body is appended
  });
});

describe("brand agent groups", () => {
  it("split the 11 sections + source_map across 3 disjoint agents with no overlap or omission", () => {
    expect(BRAND_AGENT_GROUPS).toHaveLength(3);
    const all = BRAND_AGENT_GROUPS.flatMap((g) => g.keys);
    expect(new Set(all).size).toBe(all.length); // no duplicate key across groups
    expect(new Set(all)).toEqual(
      new Set([
        "brand_identity",
        "visual_brand_system",
        "product_representation",
        "offer_dna",
        "messaging_foundation",
        "proof_library",
        "customer_dna_from_website",
        "external_customer_research_plan",
        "competitor_intelligence",
        "claim_constraints",
        "missing_information",
        "source_map",
      ]),
    );
  });

  it("buildAgentPrompt appends a directive naming exactly that agent's keys", () => {
    const base = buildStage1Prompt("https://acme.com", measured);
    const prompt = buildAgentPrompt(base, BRAND_AGENT_GROUPS[0]);
    expect(prompt.startsWith(base)).toBe(true);
    expect(prompt).toContain("PARALLEL EXTRACTION DIRECTIVE");
    expect(prompt).toContain(JSON.stringify(BRAND_AGENT_GROUPS[0].keys));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- prompts`
Expected: FAIL — cannot find module `../src/prompts/registry.js`.

- [ ] **Step 3: Create `apps/backend/src/prompts/extract-brand-dna.v3.ts`**

Export the full v3 system prompt as a template literal. **Copy the entire contents of `docs/extra files/Extract Brand DNA Prompt v3.txt` verbatim** between the backticks (it begins with `You are a senior SaaS ad strategist` and ends with `Focus on what will help generate a specific, premium, on-brand static SaaS ad.`). Escape any backtick or `${` that appears in the source (the v3 text contains neither, so a plain template literal is safe).

```ts
export const EXTRACT_BRAND_DNA_V3 = `You are a senior SaaS ad strategist, brand analyst, conversion copywriter, and visual creative director.

<… paste the full verbatim text of docs/extra files/Extract Brand DNA Prompt v3.txt here …>

Focus on what will help generate a specific, premium, on-brand static SaaS ad.`;
```

- [ ] **Step 4: Create `apps/backend/src/prompts/registry.ts`**

```ts
import type { MeasuredSiteData } from "@bya/shared";
import { EXTRACT_BRAND_DNA_V3 } from "./extract-brand-dna.v3.js";

/** Ground the v3 system prompt with the authoritative measured site data (ported from legacy buildGroundedPrompt). */
export function buildStage1Prompt(url: string, measured: MeasuredSiteData): string {
  const head =
    `Website to analyze: ${measured.finalUrl || url}\n\n` +
    "=== MEASURED SITE DATA (authoritative) ===\n" +
    "These values were extracted directly from the live rendered page. " +
    "Use these EXACT hex codes and font names. Do NOT invent or alter colors. " +
    "Counts indicate how often/prominently each color appears.\n\n" +
    JSON.stringify(
      {
        title: measured.title,
        description: measured.description,
        colors: measured.colors,
        cssColorVariables: measured.cssColorVariables,
        fonts: measured.fonts,
        logos: measured.logos,
      },
      null,
      2,
    ) +
    "\n\n=== PAGE TEXT ===\n" +
    (measured.text || "") +
    "\n=== END SITE DATA ===\n\n";
  return head + EXTRACT_BRAND_DNA_V3;
}

export type BrandAgentGroup = { name: string; keys: string[] };

/** Stage 1 runs as 3 parallel agents, each emitting a disjoint slice of the BrandExtraction
 *  JSON; the pipeline merges them. Splitting avoids truncated/lazy single-shot output on the
 *  large 11-section schema. The union of all keys is exactly the BrandExtraction sections. */
export const BRAND_AGENT_GROUPS: BrandAgentGroup[] = [
  { name: "A", keys: ["brand_identity", "visual_brand_system", "product_representation", "offer_dna"] },
  { name: "B", keys: ["messaging_foundation", "proof_library", "customer_dna_from_website"] },
  {
    name: "C",
    keys: [
      "external_customer_research_plan",
      "competitor_intelligence",
      "claim_constraints",
      "missing_information",
      "source_map",
    ],
  },
];

/** Append the parallel-worker directive (ported from legacy runAgent): return ONLY this
 *  agent's top-level keys. This OVERRIDES the single-object output format in the v3 prompt. */
export function buildAgentPrompt(base: string, group: BrandAgentGroup): string {
  return (
    base +
    "\n\n=== PARALLEL EXTRACTION DIRECTIVE (this OVERRIDES the output-format instructions above) ===\n" +
    "You are one of several parallel workers analyzing this same site. Return a SINGLE valid JSON object " +
    "containing EXACTLY these top-level keys and NOTHING else: " +
    JSON.stringify(group.keys) +
    ".\nUse the exact sub-structure defined for those keys in the schema above, and follow every extraction rule. " +
    "Do NOT include any other top-level keys. Do NOT wrap the JSON in markdown fences."
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- prompts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/prompts apps/backend/tests/prompts.test.ts
git commit -m "feat(backend): Stage-1 Brand DNA v3 prompt module + 3-agent registry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Brand pipeline (`runBrand`) — 3-agent parallel merge

Validates input, builds the grounded base prompt, then runs the **3 agent groups concurrently** (`Promise.allSettled`), each via its directive prompt with `:online` on. Each agent runs the LLM-JSON guard: parse → **one repair retry** (per agent) on parse failure → contribute its slice or nothing. The pipeline merges the disjoint slices, requires at least `brand_identity` to be present (else a typed error), validates the merged whole against `BrandExtraction`, and stamps `schema_version`. The test mocks the OpenRouter service (no real call); the real prompt builder + agent groups run unchanged.

**Failure semantics:** a parse failure on an agent (after its repair) drops that agent's slice. An upstream `chat` failure (e.g. network, rate limit) rejects that agent's promise. If the merge still has `brand_identity`, the result is returned (partial). If not: surface the `OpenRouterError` when upstream failures dominated, otherwise a `ValidationError`.

**Files:**
- Create: `apps/backend/src/pipelines/brand.ts`
- Create: `apps/backend/tests/brand.pipeline.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/brand.pipeline.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runBrand } from "../src/pipelines/brand.js";
import { BRAND_AGENT_GROUPS } from "../src/prompts/registry.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";
import type { MeasuredSiteData } from "@bya/shared";

const measured: MeasuredSiteData = {
  title: "Acme",
  description: "do things",
  colors: { text: [], background: [], border: [], accent_cta: [] },
  cssColorVariables: {},
  fonts: { body: null, heading: null, button: null },
  logos: [],
  text: "hello",
  finalUrl: "https://acme.com/",
};

// Disjoint slices keyed to the three agent groups.
const sliceA = {
  brand_identity: { brand_name: "Acme" },
  visual_brand_system: {},
  product_representation: {},
  offer_dna: {},
};
const sliceB = { messaging_foundation: { homepage_headline: "Hi" }, proof_library: {}, customer_dna_from_website: {} };
const sliceC = {
  external_customer_research_plan: {},
  competitor_intelligence: {},
  claim_constraints: {},
  missing_information: {},
  source_map: [],
};

/** Identify which agent group a call belongs to by the key-list embedded in its first message. */
function groupOf(prompt: string): "A" | "B" | "C" {
  if (prompt.includes(JSON.stringify(BRAND_AGENT_GROUPS[0].keys))) return "A";
  if (prompt.includes(JSON.stringify(BRAND_AGENT_GROUPS[1].keys))) return "B";
  return "C";
}

beforeEach(() => vi.resetAllMocks());

describe("runBrand (3-agent merge)", () => {
  it("rejects a non-http URL before calling the model", async () => {
    await expect(runBrand({ url: "ftp://nope", measuredSiteData: measured })).rejects.toBeInstanceOf(ValidationError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("rejects malformed measuredSiteData before calling the model", async () => {
    await expect(
      runBrand({ url: "https://acme.com", measuredSiteData: { title: 123 } as unknown as MeasuredSiteData }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("merges all three agent slices and stamps schema_version", async () => {
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      return JSON.stringify(g === "A" ? sliceA : g === "B" ? sliceB : sliceC);
    });
    const out = await runBrand({ url: "https://acme.com", measuredSiteData: measured });
    expect(out.brand_identity?.brand_name).toBe("Acme");
    expect(out.messaging_foundation?.homepage_headline).toBe("Hi");
    expect(out.competitor_intelligence).toBeTruthy();
    expect(out.schema_version).toBe(1);
    expect(chat).toHaveBeenCalledTimes(3);
  });

  it("repairs a single agent that returns non-JSON on its first try", async () => {
    const calls: Record<string, number> = { A: 0, B: 0, C: 0 };
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      calls[g]++;
      if (g === "A" && calls.A === 1) return "Sorry, no JSON here.";
      return JSON.stringify(g === "A" ? sliceA : g === "B" ? sliceB : sliceC);
    });
    const out = await runBrand({ url: "https://acme.com", measuredSiteData: measured });
    expect(out.brand_identity?.brand_name).toBe("Acme");
    expect(chat).toHaveBeenCalledTimes(4); // A retried once; B and C succeeded first try
  });

  it("returns a partial merge when a non-identity agent fails twice", async () => {
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      if (g === "B") return "no json"; // fails both attempts
      return JSON.stringify(g === "A" ? sliceA : sliceC);
    });
    const out = await runBrand({ url: "https://acme.com", measuredSiteData: measured });
    expect(out.brand_identity?.brand_name).toBe("Acme");
    expect(out.messaging_foundation).toBeUndefined(); // B's slice dropped
    expect(chat).toHaveBeenCalledTimes(4); // A(1) + B(2) + C(1)
  });

  it("throws ValidationError when the identity agent (A) fails twice", async () => {
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      if (g === "A") return "no json";
      return JSON.stringify(g === "B" ? sliceB : sliceC);
    });
    await expect(runBrand({ url: "https://acme.com", measuredSiteData: measured })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("surfaces an OpenRouterError when every agent's call fails upstream", async () => {
    vi.mocked(chat).mockRejectedValue(new OpenRouterError("upstream down"));
    await expect(runBrand({ url: "https://acme.com", measuredSiteData: measured })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- brand.pipeline`
Expected: FAIL — cannot find module `../src/pipelines/brand.js`.

- [ ] **Step 3: Create `apps/backend/src/pipelines/brand.ts`**

```ts
import { BrandExtraction, MeasuredSiteData } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildStage1Prompt, buildAgentPrompt, BRAND_AGENT_GROUPS, type BrandAgentGroup } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError, OpenRouterError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const SCHEMA_VERSION = 1;

export type BrandInput = { url: string; measuredSiteData: MeasuredSiteData };

export async function runBrand({ url, measuredSiteData }: BrandInput): Promise<BrandExtraction> {
  const trimmed = (url ?? "").trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new ValidationError("Provide a valid http(s) URL.");
  const md = MeasuredSiteData.safeParse(measuredSiteData);
  if (!md.success) throw new ValidationError("measuredSiteData is missing or malformed.");

  const model = loadConfig().stage1Model;
  const base = buildStage1Prompt(trimmed, md.data);

  // 3 parallel agents, each emitting a disjoint slice of the brand JSON; merge what succeeds.
  const settled = await Promise.allSettled(BRAND_AGENT_GROUPS.map((g) => runAgent(model, base, g)));

  const merged: Record<string, unknown> = {};
  let upstreamError: OpenRouterError | null = null;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (r.value) Object.assign(merged, r.value);
    } else if (r.reason instanceof OpenRouterError) {
      upstreamError = r.reason;
    }
  }

  if (!merged.brand_identity) {
    if (upstreamError) throw upstreamError; // total upstream failure dominated
    throw new ValidationError("Brand analysis did not return a usable result.");
  }

  const parsed = BrandExtraction.safeParse(merged);
  if (!parsed.success) throw new ValidationError("Brand analysis returned an unexpected shape.");
  return { ...parsed.data, schema_version: SCHEMA_VERSION };
}

/** One agent: build its directive prompt, call the model (:online), parse; one repair retry on parse failure. */
async function runAgent(model: string, base: string, group: BrandAgentGroup): Promise<Record<string, unknown> | null> {
  const messages: ChatMessage[] = [{ role: "user", content: buildAgentPrompt(base, group) }];
  const first = await chat({ model, messages, online: true, stage: "brand" });
  const parsed = parseSlice(first);
  if (parsed) return parsed;

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first },
    {
      role: "user",
      content:
        "Your previous response was not valid JSON. Return ONLY a JSON object with exactly the " +
        "requested top-level keys — no prose, no markdown fences, no commentary.",
    },
  ];
  const second = await chat({ model, messages: repairMessages, online: true, stage: "brand" });
  const repaired = parseSlice(second);
  if (repaired) return repaired;

  console.error(`[brand] agent ${group.name} returned invalid JSON twice. Last output (truncated):\n`, second.slice(0, 1000));
  return null;
}

/** Parse a single agent reply into a plain object slice, or null if it isn't a JSON object. */
function parseSlice(content: string): Record<string, unknown> | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  return obj as Record<string, unknown>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- brand.pipeline`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/pipelines/brand.ts apps/backend/tests/brand.pipeline.test.ts
git commit -m "feat(backend): brand pipeline — 3-agent parallel merge + per-agent repair

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Route (`POST /api/brand`) + wiring

**Files:**
- Create: `apps/backend/src/routes/brand.ts`
- Modify: `apps/backend/src/server.ts`
- Create: `apps/backend/tests/brand.routes.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/brand.routes.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/brand.js", () => ({ runBrand: vi.fn() }));

import { runBrand } from "../src/pipelines/brand.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

describe("POST /api/brand", () => {
  it("returns 200 with { brandExtraction }", async () => {
    vi.mocked(runBrand).mockResolvedValue({ brand_identity: { brand_name: "Acme" }, schema_version: 1 });
    const res = await request(app)
      .post("/api/brand")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(200);
    expect(res.body.brandExtraction.brand_identity.brand_name).toBe("Acme");
  });

  it("maps ValidationError to 422", async () => {
    vi.mocked(runBrand).mockRejectedValue(new ValidationError("bad input"));
    const res = await request(app).post("/api/brand").send({ url: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps OpenRouterError to 502", async () => {
    vi.mocked(runBrand).mockRejectedValue(new OpenRouterError("upstream down"));
    const res = await request(app)
      .post("/api/brand")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("OPENROUTER_ERROR");
    expect(res.body.error.stage).toBe("brand");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- brand.routes`
Expected: FAIL — cannot find module `../src/routes/brand.js`.

- [ ] **Step 3: Create `apps/backend/src/routes/brand.ts`**

```ts
import { Router } from "express";
import { runBrand } from "../pipelines/brand.js";
import { toHttpError } from "../lib/errors.js";

export const brandRouter = Router();

brandRouter.post("/brand", async (req, res) => {
  try {
    const brandExtraction = await runBrand({
      url: req.body?.url ?? "",
      measuredSiteData: req.body?.measuredSiteData,
    });
    res.json({ brandExtraction });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Wire the router into `apps/backend/src/server.ts`**

Add the import alongside the existing route imports and mount it under `/api` (after the existing `app.use("/api", configRouter);` line):

```ts
import { brandRouter } from "./routes/brand.js";
```

```ts
  app.use("/api", brandRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- brand.routes`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; e2e skipped.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes/brand.ts apps/backend/src/server.ts apps/backend/tests/brand.routes.test.ts
git commit -m "feat(backend): POST /api/brand route + wiring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Manual run script (`run-brand.ts`)

Exercises the real slice end-to-end: extract (Playwright) → brand (OpenRouter). Requires `OPENROUTER_API_KEY` and `STAGE1_MODEL` in the root `.env` (now found by the upward-searching `loadEnvFile`).

**Files:**
- Create: `apps/backend/scripts/run-brand.ts`
- Modify: `apps/backend/package.json` (add the `run:brand` script)

- [ ] **Step 1: Add the script to `apps/backend/package.json`**

Add to `"scripts"` (after `"run:extract"`):

```json
    "run:brand": "tsx scripts/run-brand.ts",
```

- [ ] **Step 2: Create `apps/backend/scripts/run-brand.ts`**

```ts
import { loadEnvFile } from "../src/config/index.js";
import { runExtract } from "../src/pipelines/extract.js";
import { runBrand } from "../src/pipelines/brand.js";

loadEnvFile(process.cwd());

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm --workspace @bya/backend run run:brand -- <https-url>");
  process.exit(1);
}

(async () => {
  try {
    const measuredSiteData = await runExtract(url);
    const brand = await runBrand({ url, measuredSiteData });
    console.log(JSON.stringify(brand, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
```

- [ ] **Step 3: Run it against a real site**

Run: `npm --workspace @bya/backend run run:brand -- https://stripe.com`
This launches real Chromium + a real OpenRouter Stage-1 call (with `:online`) — it can take 1–3 minutes. Use a generous timeout (e.g. 240000 ms).
Expected: prints a `BrandExtraction` JSON with `"schema_version": 1`, a populated `brand_identity` (e.g. `brand_name`), and several other sections. Capture a SUMMARY (brand_name, a couple of section keys present, schema_version) — do not paste the whole object.
If it fails for a NETWORK / missing-key reason (not a code defect), report the exact error and mark DONE_WITH_CONCERNS, distinguishing it from a code bug. (Missing `OPENROUTER_API_KEY`/`STAGE1_MODEL` surfaces as an `OpenRouterError`.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/scripts/run-brand.ts apps/backend/package.json
git commit -m "chore(backend): manual run script for brand pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Gated real e2e smoke

Skipped unless `BYA_E2E=1` **and** an `OPENROUTER_API_KEY` is available — so the default suite stays fast, offline, and cost-free. Loads the root `.env` first so the key is present when opted in.

**Files:**
- Create: `apps/backend/tests/brand.e2e.test.ts`

- [ ] **Step 1: Create `apps/backend/tests/brand.e2e.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadEnvFile } from "../src/config/index.js";
import { runExtract } from "../src/pipelines/extract.js";
import { runBrand } from "../src/pipelines/brand.js";

loadEnvFile(process.cwd());

const enabled = process.env.BYA_E2E === "1" && Boolean(process.env.OPENROUTER_API_KEY);
const run = enabled ? describe : describe.skip;

run("brand e2e (real Playwright + OpenRouter)", () => {
  it("extracts then analyzes a real site", async () => {
    const measured = await runExtract("https://stripe.com");
    const brand = await runBrand({ url: "https://stripe.com", measuredSiteData: measured });
    expect(brand.schema_version).toBe(1);
    expect(brand.brand_identity).toBeTruthy();
  }, 180_000);
});
```

- [ ] **Step 2: Verify it is skipped in the normal run**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the brand e2e suite shows as skipped (alongside the extract e2e). Capture totals incl. skipped count.

- [ ] **Step 3: Verify it passes when enabled (requires a real key)**

Run (PowerShell): `$env:BYA_E2E=1; npm --workspace @bya/backend run test -- brand.e2e; Remove-Item Env:BYA_E2E`
Run (bash): `BYA_E2E=1 npm --workspace @bya/backend run test -- brand.e2e`
Expected: PASS (1 test) when `OPENROUTER_API_KEY` is in the root `.env`. Can take 1–3 minutes — use a generous timeout. If the key is genuinely unavailable in this environment, the suite stays skipped even with `BYA_E2E=1`; report that distinctly (not a code failure).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/tests/brand.e2e.test.ts
git commit -m "test(backend): gated real e2e smoke for brand pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (this slice):**
- `POST /api/brand` returning the brand profile — Tasks 7, 8. ✓ (persistence + `id` deferred to Plan 5 per the agreed slice; response is `{ brandExtraction }`.)
- `BrandExtraction` as a versioned, tolerant zod contract in `packages/shared` (11 sections + `source_map`) — Task 1. ✓
- OpenRouter Stage-1 client; `:online` ALWAYS on for brand — Tasks 5, 7 (every agent call passes `online: true`). ✓
- Stage 1 as **3 parallel agents** over disjoint slices, merged; mirrors the proven legacy split — Tasks 6, 7. ✓
- Prompt registry with a versioned Stage-1 module + agent groups; model is config-driven (`STAGE1_MODEL`) — Tasks 5, 6, 7. ✓
- LLM-JSON guard: parse → validate → one repair retry (per agent) → typed `ValidationError` with raw output logged; partial-merge tolerance with `brand_identity` required — Task 7. ✓
- Typed `OpenRouterError` mapped to its HTTP status (502) with stage, no secret leakage (key read server-side only, never in `/api/config`) — Tasks 3, 5, 8. ✓
- Verification: per-pipeline run script + mocked unit tests + gated real e2e — Tasks 9, 10. ✓
- Secret-keeping: `OPENROUTER_API_KEY` read from `process.env` in the service only; `loadEnvFile` upward search loads the root `.env` from the workspace cwd — Tasks 2, 5. ✓
- Out of this slice (later plans): Supabase persistence + `id` + performance memory (Plan 5); Stage-2 ad-prompt + Stage-2 variant selection in the registry (Plan 3); render (Plan 4). ✓ (scoped out intentionally)

**Type consistency:** `BrandExtraction` (shared) is the single type returned by `runBrand` (Task 7) and the route (Task 8). `runBrand({ url, measuredSiteData })` has the same signature at the pipeline (Task 7), route (Task 8), run script (Task 9), and e2e (Task 10). `MeasuredSiteData` (from Plan 1) is the input contract validated in `runBrand` and produced by `runExtract`. `ChatMessage`/`ChatArgs` (Task 5) are used by `runAgent` inside `runBrand` (Task 7). `BrandAgentGroup` + `BRAND_AGENT_GROUPS` + `buildAgentPrompt`/`buildStage1Prompt` (Task 6) are consumed by the pipeline (Task 7) and the pipeline test. `OpenRouterError`'s optional `stage` (Task 3) is supplied by `chat` (Task 5, default `"brand"`), surfaced by `runBrand` on total upstream failure (Task 7), and asserted in the route test (Task 8).

**Placeholders:** none for code. The single "paste verbatim" instruction (Task 6, the v3 system prompt) names the exact source file and the precise begin/end anchors — copying an existing source-of-truth file rather than duplicating 448 lines inline, with explicit escaping guidance.

**Design notes carried forward:**
- The tolerant schema means the per-agent guard's teeth are "parseable + is an object"; a slice of `{}` would validate. Intentional (spec: tolerant so drift/old rows parse). The pipeline adds a real floor by requiring `brand_identity` in the merged result.
- The 3 agents each run `:online`, so a brand analysis costs ~3 web searches — acceptable for occasional per-URL use, and the agreed cost/grounding trade-off. Selective `:online` (only research-heavy agents) is a later optimization that needs no contract change.
