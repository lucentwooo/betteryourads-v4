# Concepts → Batch Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From an analyzed brand, generate 5 strategic ad concepts, let the user multi-select and attach per-concept assets, then batch-render the selected concepts via a server-side job model with live polling.

**Architecture:** New `/api/concepts` runs a text LLM (`STAGE3_MODEL`) over the brand DNA to produce a validated `ConceptSet`. New `/api/batch` writes job + item rows, starts an in-process concurrency-capped worker that runs each item through the existing `runAdPrompt → runRender → persistRenderedAd` chain (the concept is fed to Stage 2 via the existing `userDirection` field), and the UI polls `GET /api/batch/:id`. Three new tables hold the concept set and batch state; asset images are held in worker memory, not persisted.

**Tech Stack:** TypeScript, zod (`@bya/shared`), Express, Supabase (service-role), React + Vite + react-router, vitest.

**Branch:** `feature/concept-batch-gen` (already cut from `dev`).

**Spec:** `docs/superpowers/specs/2026-05-28-concept-batch-generation-design.md`

---

## File structure

**Created:**
- `packages/shared/src/concept.ts` — zod schemas for the concept set.
- `apps/backend/src/prompts/ad-concepts.v1.ts` — strategist prompt + content builder.
- `apps/backend/src/pipelines/concepts.ts` — `runConcepts`.
- `apps/backend/src/routes/concepts.ts` — `POST /api/concepts`.
- `apps/backend/src/routes/batch.ts` — `POST /api/batch`, `GET /api/batch/:id`.
- `apps/backend/src/services/batch-worker.ts` — in-process worker pool.
- `supabase/migrations/20260528130000_concepts_and_batches.sql` — new tables.

**Modified:**
- `packages/shared/src/index.ts` — export `concept.ts`.
- `apps/backend/src/lib/errors.ts` — add `"concepts"` to `Stage`.
- `apps/backend/src/config/index.ts` — add `stage3Model`.
- `.env.example` — add `STAGE3_MODEL`.
- `apps/backend/src/prompts/registry.ts` — add `buildConceptContent`.
- `apps/backend/src/services/supabase.ts` — concept + batch persistence helpers.
- `apps/backend/src/server.ts` — mount routers, run `markStaleBatchItems` on boot.
- `apps/web/src/api/client.ts` — `concepts`, `startBatch`, `getBatch`.
- `apps/web/src/workbench/state.ts` — new stages + actions.
- `apps/web/src/workbench/Workbench.tsx` — concept + asset + batch views.
- `apps/web/src/styles/app.css` — concept card + batch grid styles.
- `docs/FEATURES.md` — feature entries.

---

## Task 1: Shared `ConceptSet` schemas

**Files:**
- Create: `packages/shared/src/concept.ts`
- Modify: `packages/shared/src/index.ts:5`
- Test: `packages/shared/src/concept.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/concept.test.ts
import { describe, it, expect } from "vitest";
import { ConceptSet } from "./concept.js";

const idea = {
  idea_number: 1,
  awareness_level: "Pain aware",
  idea_name: "Stop guessing",
  core_angle: "frustration",
  main_hook: "Tired of X?",
  cta: "Start free",
  visual_direction_for_later: "bold type",
};

describe("ConceptSet", () => {
  it("parses a minimal valid set and defaults arrays", () => {
    const r = ConceptSet.safeParse({ ad_ideas: [idea] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ad_ideas[0].safe_claims_used).toEqual([]);
      expect(r.data.ad_ideas[0].idea_name).toBe("Stop guessing");
    }
  });

  it("rejects an empty ad_ideas array", () => {
    expect(ConceptSet.safeParse({ ad_ideas: [] }).success).toBe(false);
  });

  it("rejects an idea missing required fields", () => {
    expect(ConceptSet.safeParse({ ad_ideas: [{ idea_number: 1 }] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bya/shared -- concept`
Expected: FAIL — cannot find module `./concept.js`.

- [ ] **Step 3: Write the schema**

```ts
// packages/shared/src/concept.ts
import { z } from "zod";

const strArray = z.array(z.string()).default([]);

export const AdIdea = z
  .object({
    idea_number: z.number().optional(),
    awareness_level: z.string().optional(),
    idea_name: z.string().min(1),
    core_angle: z.string().optional().default(""),
    customer_context: z.string().optional().default(""),
    customer_pain_or_desire: z.string().optional().default(""),
    customer_insight: z.string().optional().default(""),
    belief_to_shift: z.string().optional().default(""),
    main_hook: z.string().min(1),
    supporting_message: z.string().optional().default(""),
    cta: z.string().min(1),
    why_this_could_work: z.string().optional().default(""),
    proof_or_reason_to_believe: z.string().optional().default(""),
    safe_claims_used: strArray,
    claims_to_avoid: strArray,
    visual_direction_for_later: z.string().optional().default(""),
    brand_dna_fields_used: strArray,
  })
  .passthrough();

export type AdIdea = z.infer<typeof AdIdea>;

export const CampaignStrategySummary = z
  .object({
    brand_name: z.string().optional().default(""),
    product_name: z.string().optional().default(""),
    category: z.string().optional().default(""),
    primary_customer: z.string().optional().default(""),
    primary_problem: z.string().optional().default(""),
    primary_outcome: z.string().optional().default(""),
    main_positioning: z.string().optional().default(""),
    strongest_ad_opportunity: z.string().optional().default(""),
    main_claim_constraints: strArray,
    tone_to_use: z.string().optional().default(""),
    tone_to_avoid: z.string().optional().default(""),
  })
  .passthrough()
  .optional();

const RecommendedItem = z
  .object({ rank: z.number().optional(), idea_number: z.union([z.number(), z.string()]).optional(), reason: z.string().optional() })
  .passthrough();

export const ConceptSet = z
  .object({
    campaign_strategy_summary: CampaignStrategySummary,
    ad_ideas: z.array(AdIdea).min(1),
    recommended_top_3: z.array(RecommendedItem).default([]),
    next_step_recommendations: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type ConceptSet = z.infer<typeof ConceptSet>;
```

- [ ] **Step 4: Export from the package index**

Modify `packages/shared/src/index.ts` — add after line 5:

```ts
export * from "./concept.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @bya/shared -- concept`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/concept.ts packages/shared/src/concept.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ConceptSet schemas"
```

---

## Task 2: Config — `STAGE3_MODEL` + error stage

**Files:**
- Modify: `apps/backend/src/lib/errors.ts:1`
- Modify: `apps/backend/src/config/index.ts:38-64`
- Modify: `.env.example`

- [ ] **Step 1: Add the `concepts` stage**

Modify `apps/backend/src/lib/errors.ts` line 1:

```ts
export type Stage = "extract" | "brand" | "ad-prompt" | "render" | "validation" | "auth" | "persistence" | "concepts";
```

- [ ] **Step 2: Add `stage3Model` to config**

In `apps/backend/src/config/index.ts`, add to the `AppConfig` interface (after `stage2Model: string;`):

```ts
  stage3Model: string;
```

And in `loadConfig`'s returned object (after the `stage2Model` line):

```ts
    stage3Model: env.STAGE3_MODEL ?? "",
```

- [ ] **Step 3: Document the env var**

Add to `.env.example` near `STAGE2_MODEL`:

```
STAGE3_MODEL=deepseek/deepseek-v4-flash
```

- [ ] **Step 4: Verify backend still type-checks**

Run: `npm run build -w @bya/backend`
Expected: builds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/src/config/index.ts .env.example
git commit -m "feat(backend): add STAGE3_MODEL config and concepts error stage"
```

---

## Task 3: Concept prompt + content builder

**Files:**
- Create: `apps/backend/src/prompts/ad-concepts.v1.ts`
- Modify: `apps/backend/src/prompts/registry.ts`
- Test: `apps/backend/src/prompts/registry.test.ts` (append a test)

- [ ] **Step 1: Create the prompt file**

Copy the strategist prompt verbatim from `AdSignal Files/context files/Concept Prompts.txt` (lines 1–222) into a string export. Replace the trailing "Now generate the 5 ad ideas from the provided Brand DNA JSON." with a clean instruction since the JSON is appended by the builder.

```ts
// apps/backend/src/prompts/ad-concepts.v1.ts
export const AD_CONCEPTS_V1 = `You are a senior SaaS marketing strategist, direct response creative strategist, conversion copywriter, and expert at dissecting why ad ideas work.

Your job is to generate 5 strong static ad ideas for a SaaS company using the provided Brand DNA JSON.

You are not creating final image prompts yet.
You are not designing the final ad yet.
You are only creating high-quality strategic ad concepts.

Use the Brand DNA JSON as your source of truth.

You must use: brand identity, offer DNA, messaging foundation, customer pains, desired outcomes, objections, proof points, competitor intelligence, claim constraints, tone of voice, CTA language.

Do not invent: features, claims, numbers, customer logos, testimonials, guarantees, pricing, integrations, results. If something is not supported in the Brand DNA JSON, do not use it.

Create five different ad ideas that could later be turned into static Meta ads. Each idea must use a different customer awareness level:
1. Pain aware
2. Problem aware
3. Solution aware
4. Product aware
5. Outcome aware

Each idea must be meaningfully different. Do not give five versions of the same concept.

For each idea, think through: what the customer is currently struggling with, what belief needs to shift, what would make them stop scrolling, what proof makes the idea believable, what claim is safe to make, what angle best fits the brand, what kind of visual direction would support the idea later.

Return clean JSON only. Use this exact structure:

{
  "campaign_strategy_summary": {
    "brand_name": "", "product_name": "", "category": "", "primary_customer": "",
    "primary_problem": "", "primary_outcome": "", "main_positioning": "",
    "strongest_ad_opportunity": "", "main_claim_constraints": [], "tone_to_use": "", "tone_to_avoid": ""
  },
  "ad_ideas": [
    {
      "idea_number": 1, "awareness_level": "Pain aware", "idea_name": "", "core_angle": "",
      "customer_context": "", "customer_pain_or_desire": "", "customer_insight": "", "belief_to_shift": "",
      "main_hook": "", "supporting_message": "", "cta": "", "why_this_could_work": "",
      "proof_or_reason_to_believe": "", "safe_claims_used": [], "claims_to_avoid": [],
      "visual_direction_for_later": "", "brand_dna_fields_used": []
    }
  ],
  "recommended_top_3": [ { "rank": 1, "idea_number": "", "reason": "" } ],
  "next_step_recommendations": {
    "best_idea_to_turn_into_an_ad_first": "", "why": "", "what_assets_would_help_later": [],
    "what_extra_customer_research_would_improve_the_ideas": [], "what_not_to_do": []
  }
}

The ad_ideas array MUST contain exactly 5 objects, one per awareness level in the order above.

Quality rules: Be specific. Be strategic. Be direct. Do not be generic. Do not create vague SaaS fluff. Do not write fake proof or fake benefits. Use the brand's actual language where useful. Make each idea clearly different. Prioritise ideas that could realistically become high-performing static ads.`;
```

- [ ] **Step 2: Add `buildConceptContent` to the registry**

Append to `apps/backend/src/prompts/registry.ts`:

```ts
import { AD_CONCEPTS_V1 } from "./ad-concepts.v1.js";

/** Stage-3 (concepts) user message: strategist prompt + the brand DNA JSON. Text-only. */
export function buildConceptContent(brandExtraction: BrandExtraction): string {
  return (
    AD_CONCEPTS_V1 +
    "\n\n=== BRAND_DNA_JSON (source of truth) ===\n" +
    JSON.stringify(brandExtraction, null, 2)
  );
}
```

(`BrandExtraction` is already imported at the top of `registry.ts`.)

- [ ] **Step 3: Write a builder test**

Append to `apps/backend/src/prompts/registry.test.ts` (or create it if absent, importing from `./registry.js`):

```ts
import { describe, it, expect } from "vitest";
import { buildConceptContent } from "./registry.js";

describe("buildConceptContent", () => {
  it("includes the strategist prompt and the brand JSON", () => {
    const out = buildConceptContent({ brand_identity: { name: "Acme" } } as never);
    expect(out).toContain("senior SaaS marketing strategist");
    expect(out).toContain("BRAND_DNA_JSON");
    expect(out).toContain("Acme");
  });
});
```

- [ ] **Step 4: Run test**

Run: `npm test -w @bya/backend -- registry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/prompts/ad-concepts.v1.ts apps/backend/src/prompts/registry.ts apps/backend/src/prompts/registry.test.ts
git commit -m "feat(backend): add concept strategist prompt and content builder"
```

---

## Task 4: Concept pipeline

**Files:**
- Create: `apps/backend/src/pipelines/concepts.ts`
- Test: `apps/backend/src/pipelines/concepts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/pipelines/concepts.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const chatMock = vi.fn();
vi.mock("../services/openrouter.js", () => ({ chat: (...a: unknown[]) => chatMock(...a) }));

import { runConcepts } from "./concepts.js";

const idea = (n: number, lvl: string) => ({
  idea_number: n, awareness_level: lvl, idea_name: `Idea ${n}`,
  main_hook: "Hook", cta: "Go", visual_direction_for_later: "v",
});
const validSet = { ad_ideas: [idea(1, "Pain aware"), idea(2, "Problem aware")] };

beforeEach(() => { chatMock.mockReset(); process.env.STAGE3_MODEL = "deepseek/deepseek-v4-flash"; });

describe("runConcepts", () => {
  it("parses a valid JSON concept set", async () => {
    chatMock.mockResolvedValueOnce(JSON.stringify(validSet));
    const set = await runConcepts({ brandExtraction: { brand_identity: {} } });
    expect(set.ad_ideas).toHaveLength(2);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on invalid JSON then succeeds", async () => {
    chatMock.mockResolvedValueOnce("not json").mockResolvedValueOnce(JSON.stringify(validSet));
    const set = await runConcepts({ brandExtraction: {} });
    expect(set.ad_ideas).toHaveLength(2);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two invalid responses", async () => {
    chatMock.mockResolvedValue("nope");
    await expect(runConcepts({ brandExtraction: {} })).rejects.toThrow();
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bya/backend -- concepts`
Expected: FAIL — cannot find `./concepts.js`.

- [ ] **Step 3: Write the pipeline**

```ts
// apps/backend/src/pipelines/concepts.ts
import { ConceptSet } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildConceptContent } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

export async function runConcepts(input: { brandExtraction: unknown }): Promise<ConceptSet> {
  const model = loadConfig().stage3Model;
  const messages: ChatMessage[] = [
    { role: "user", content: buildConceptContent(input.brandExtraction as never) },
  ];

  const first = await chat({ model, messages, stage: "concepts" });
  let result = parseConceptSet(first);
  if (!result) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON for the required structure. Return ONLY the JSON object " +
          "with campaign_strategy_summary, ad_ideas (array), recommended_top_3, and next_step_recommendations — " +
          "no prose, no markdown fences.",
      },
    ];
    const second = await chat({ model, messages: repair, stage: "concepts" });
    result = parseConceptSet(second);
    if (!result) {
      console.error("[concepts] model returned invalid JSON twice. Last output (truncated):\n", second.slice(0, 1000));
      throw new ValidationError("Concept generation returned an unexpected shape.");
    }
  }
  return result;
}

function parseConceptSet(content: string): ConceptSet | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  const v = ConceptSet.safeParse(obj);
  return v.success ? v.data : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @bya/backend -- concepts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/pipelines/concepts.ts apps/backend/src/pipelines/concepts.test.ts
git commit -m "feat(backend): add concept generation pipeline with repair retry"
```

---

## Task 5: Concept persistence helpers

**Files:**
- Modify: `apps/backend/src/services/supabase.ts`

- [ ] **Step 1: Add the import**

At the top of `apps/backend/src/services/supabase.ts`, extend the `@bya/shared` import to include `ConceptSet`:

```ts
import { BrandExtraction, AdPrompt, ConceptSet, type BrandSummary, type AdSummary, type BrandDetail, type AdminUser } from "@bya/shared";
```

- [ ] **Step 2: Add `saveConceptSet` and `getConceptSet`**

Append these functions to `apps/backend/src/services/supabase.ts`:

```ts
export async function saveConceptSet(args: {
  userId: string;
  brandExtractionId: string;
  conceptSet: ConceptSet;
  model: string;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from("ad_concept_sets")
    .upsert(
      {
        user_id: args.userId,
        brand_extraction_id: args.brandExtractionId,
        concept_set: args.conceptSet,
        model: args.model,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,brand_extraction_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the concept set failed: ${error?.message ?? "no row"}`);
  return { id: rowId(data) };
}

export async function getConceptSet(brandExtractionId: string, userId: string): Promise<ConceptSet | null> {
  const { data, error } = await admin()
    .from("ad_concept_sets")
    .select("concept_set")
    .eq("brand_extraction_id", brandExtractionId)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const parsed = ConceptSet.safeParse((data as { concept_set: unknown }).concept_set);
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build -w @bya/backend`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/supabase.ts
git commit -m "feat(backend): persist concept sets per brand"
```

---

## Task 6: `POST /api/concepts` route

**Files:**
- Create: `apps/backend/src/routes/concepts.ts`
- Modify: `apps/backend/src/server.ts`
- Test: `apps/backend/src/routes/concepts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/routes/concepts.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middleware/require-approved-user.js", () => ({
  requireApprovedUser: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user: unknown }).user = { id: "u1", email: "x@y.z" };
    next();
  },
}));
const runConceptsMock = vi.fn();
vi.mock("../pipelines/concepts.js", () => ({ runConcepts: (...a: unknown[]) => runConceptsMock(...a) }));
const saveConceptSetMock = vi.fn();
vi.mock("../services/supabase.js", () => ({ saveConceptSet: (...a: unknown[]) => saveConceptSetMock(...a) }));

import { conceptsRouter } from "./concepts.js";

const app = express();
app.use(express.json());
app.use("/api", conceptsRouter);

beforeEach(() => { runConceptsMock.mockReset(); saveConceptSetMock.mockReset(); });

describe("POST /api/concepts", () => {
  it("runs the pipeline, persists, and returns the set", async () => {
    const set = { ad_ideas: [{ idea_name: "A", main_hook: "h", cta: "c" }] };
    runConceptsMock.mockResolvedValue(set);
    saveConceptSetMock.mockResolvedValue({ id: "cs1" });
    const res = await request(app)
      .post("/api/concepts")
      .send({ brandExtraction: { brand_identity: {} }, brandExtractionId: "be1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "cs1", conceptSet: set });
    expect(saveConceptSetMock).toHaveBeenCalled();
  });

  it("400s when brandExtractionId is missing", async () => {
    const res = await request(app).post("/api/concepts").send({ brandExtraction: {} });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bya/backend -- routes/concepts`
Expected: FAIL — cannot find `./concepts.js`.

- [ ] **Step 3: Write the route**

```ts
// apps/backend/src/routes/concepts.ts
import { Router } from "express";
import { runConcepts } from "../pipelines/concepts.js";
import { saveConceptSet } from "../services/supabase.js";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { loadConfig } from "../config/index.js";

export const conceptsRouter = Router();

conceptsRouter.post("/concepts", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtraction = req.body?.brandExtraction;
    const brandExtractionId: unknown = req.body?.brandExtractionId;
    if (!brandExtraction) throw new ValidationError("brandExtraction is required.");
    if (typeof brandExtractionId !== "string") throw new ValidationError("brandExtractionId is required.");

    const conceptSet = await runConcepts({ brandExtraction });
    const { id } = await saveConceptSet({
      userId,
      brandExtractionId,
      conceptSet,
      model: loadConfig().stage3Model,
    });
    res.json({ id, conceptSet });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Mount the router**

In `apps/backend/src/server.ts`: add the import after line 11 (`adminRouter`):

```ts
import { conceptsRouter } from "./routes/concepts.js";
```

and mount it after the `adminRouter` use (line 23):

```ts
  app.use("/api", conceptsRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @bya/backend -- routes/concepts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/concepts.ts apps/backend/src/routes/concepts.test.ts apps/backend/src/server.ts
git commit -m "feat(backend): add POST /api/concepts route"
```

---

## Task 7: Migration — concept + batch tables

**Files:**
- Create: `supabase/migrations/20260528130000_concepts_and_batches.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Concept sets (one per brand) + batch jobs/items for multi-concept generation.
-- Asset images are NOT stored (held in the worker's memory); rows track status + links.

create table if not exists public.ad_concept_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  brand_extraction_id uuid not null references public.brand_extractions(id) on delete cascade,
  concept_set         jsonb not null,
  model               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, brand_extraction_id)
);
alter table public.ad_concept_sets enable row level security;
drop policy if exists "own ad_concept_sets" on public.ad_concept_sets;
create policy "own ad_concept_sets" on public.ad_concept_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.batch_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  brand_extraction_id uuid references public.brand_extractions(id) on delete set null,
  status              text not null check (status in ('queued','running','done','error')),
  total               int not null,
  created_at          timestamptz not null default now()
);
alter table public.batch_jobs enable row level security;
drop policy if exists "own batch_jobs" on public.batch_jobs;
create policy "own batch_jobs" on public.batch_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.batch_items (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.batch_jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  idea_number     int,
  idea_name       text,
  status          text not null check (status in ('queued','running','done','error')),
  generated_ad_id uuid references public.generated_ads(id) on delete set null,
  error           text,
  created_at      timestamptz not null default now()
);
alter table public.batch_items enable row level security;
drop policy if exists "own batch_items" on public.batch_items;
create policy "own batch_items" on public.batch_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists batch_items_batch_id_idx on public.batch_items(batch_id);
```

- [ ] **Step 2: Hand the SQL to the owner**

This migration is applied by hand (project rule — no CLI). After this task, tell the owner: "Paste `supabase/migrations/20260528130000_concepts_and_batches.sql` into Supabase dashboard → SQL Editor → Run." Do NOT run `supabase db push`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528130000_concepts_and_batches.sql
git commit -m "feat(db): add ad_concept_sets, batch_jobs, batch_items tables"
```

---

## Task 8: Batch persistence helpers

**Files:**
- Modify: `apps/backend/src/services/supabase.ts`

- [ ] **Step 1: Add batch types + helpers**

Append to `apps/backend/src/services/supabase.ts`:

```ts
export type BatchItemStatus = "queued" | "running" | "done" | "error";

export type BatchItemView = {
  id: string;
  ideaNumber: number | null;
  ideaName: string | null;
  status: BatchItemStatus;
  imageUrl: string | null;
  error: string | null;
};

export type BatchView = { id: string; status: BatchItemStatus; items: BatchItemView[] };

export async function createBatch(args: {
  userId: string;
  brandExtractionId: string | null;
  items: { ideaNumber: number | null; ideaName: string | null }[];
}): Promise<{ batchId: string; itemIds: string[] }> {
  const { data: job, error: jobErr } = await admin()
    .from("batch_jobs")
    .insert({ user_id: args.userId, brand_extraction_id: args.brandExtractionId, status: "running", total: args.items.length })
    .select("id")
    .single();
  if (jobErr || !job) throw new PersistenceError(`Creating the batch failed: ${jobErr?.message ?? "no row"}`);
  const batchId = rowId(job);

  const rows = args.items.map((it) => ({
    batch_id: batchId,
    user_id: args.userId,
    idea_number: it.ideaNumber,
    idea_name: it.ideaName,
    status: "queued" as const,
  }));
  const { data: items, error: itemsErr } = await admin().from("batch_items").insert(rows).select("id");
  if (itemsErr || !items) throw new PersistenceError(`Creating batch items failed: ${itemsErr?.message ?? "no rows"}`);
  return { batchId, itemIds: (items as { id: string }[]).map((r) => r.id) };
}

export async function updateBatchItem(
  itemId: string,
  patch: { status: BatchItemStatus; generatedAdId?: string | null; error?: string | null },
): Promise<void> {
  const { error } = await admin()
    .from("batch_items")
    .update({ status: patch.status, generated_ad_id: patch.generatedAdId ?? null, error: patch.error ?? null })
    .eq("id", itemId);
  if (error) throw new PersistenceError(`Updating a batch item failed: ${error.message}`);
}

export async function finalizeBatchIfDone(batchId: string): Promise<void> {
  const { data, error } = await admin().from("batch_items").select("status").eq("batch_id", batchId);
  if (error || !data) throw new PersistenceError(`Reading batch items failed: ${error?.message ?? "no rows"}`);
  const statuses = (data as { status: BatchItemStatus }[]).map((r) => r.status);
  if (statuses.some((s) => s === "queued" || s === "running")) return;
  const jobStatus: BatchItemStatus = statuses.every((s) => s === "error") ? "error" : "done";
  const { error: upErr } = await admin().from("batch_jobs").update({ status: jobStatus }).eq("id", batchId);
  if (upErr) throw new PersistenceError(`Finalizing the batch failed: ${upErr.message}`);
}

export async function getBatch(batchId: string, userId: string): Promise<BatchView | null> {
  const { data: job, error: jobErr } = await admin()
    .from("batch_jobs")
    .select("id, status")
    .eq("id", batchId)
    .eq("user_id", userId)
    .single();
  if (jobErr || !job) return null;

  const { data: items, error: itemsErr } = await admin()
    .from("batch_items")
    .select("id, idea_number, idea_name, status, error, generated_ads ( image_path )")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (itemsErr) throw new PersistenceError(`Listing batch items failed: ${itemsErr.message}`);

  type Row = {
    id: string; idea_number: number | null; idea_name: string | null;
    status: BatchItemStatus; error: string | null;
    generated_ads: { image_path: string } | null;
  };
  const out: BatchItemView[] = [];
  for (const r of (items ?? []) as unknown as Row[]) {
    let imageUrl: string | null = null;
    if (r.generated_ads?.image_path) {
      const signed = await admin().storage.from("ads").createSignedUrl(r.generated_ads.image_path, SIGNED_URL_TTL_SECONDS);
      imageUrl = signed.data?.signedUrl ?? null;
    }
    out.push({ id: r.id, ideaNumber: r.idea_number, ideaName: r.idea_name, status: r.status, imageUrl, error: r.error });
  }
  const j = job as { id: string; status: BatchItemStatus };
  return { id: j.id, status: j.status, items: out };
}

/** On boot: any item still queued/running was orphaned by a restart — fail it and its job. */
export async function markStaleBatchItems(): Promise<void> {
  await admin().from("batch_items").update({ status: "error", error: "Interrupted by a server restart." }).in("status", ["queued", "running"]);
  await admin().from("batch_jobs").update({ status: "error" }).in("status", ["queued", "running"]);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build -w @bya/backend`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/services/supabase.ts
git commit -m "feat(backend): add batch job/item persistence helpers"
```

---

## Task 9: Batch worker

**Files:**
- Create: `apps/backend/src/services/batch-worker.ts`
- Test: `apps/backend/src/services/batch-worker.test.ts`

The worker takes the created item IDs + their concept/asset payloads and runs each through the existing pipelines, with a concurrency cap, updating rows and finalizing.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/services/batch-worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const runAdPromptMock = vi.fn();
const runRenderMock = vi.fn();
vi.mock("../pipelines/ad-prompt.js", () => ({ runAdPrompt: (...a: unknown[]) => runAdPromptMock(...a) }));
vi.mock("../pipelines/render.js", () => ({ runRender: (...a: unknown[]) => runRenderMock(...a) }));

const saveAdPromptMock = vi.fn();
const persistRenderedAdMock = vi.fn();
const updateBatchItemMock = vi.fn();
const finalizeBatchIfDoneMock = vi.fn();
vi.mock("../services/supabase.js", () => ({
  saveAdPrompt: (...a: unknown[]) => saveAdPromptMock(...a),
  persistRenderedAd: (...a: unknown[]) => persistRenderedAdMock(...a),
  updateBatchItem: (...a: unknown[]) => updateBatchItemMock(...a),
  finalizeBatchIfDone: (...a: unknown[]) => finalizeBatchIfDoneMock(...a),
}));

import { runBatch } from "./batch-worker.js";

const baseItem = (id: string) => ({
  itemId: id,
  concept: { idea_name: "A", main_hook: "h", cta: "c" },
  brandExtraction: {},
  referenceAdImage: "data:ref",
  logoImage: "data:logo",
  productAsset: undefined,
});

beforeEach(() => {
  for (const m of [runAdPromptMock, runRenderMock, saveAdPromptMock, persistRenderedAdMock, updateBatchItemMock, finalizeBatchIfDoneMock]) m.mockReset();
  runAdPromptMock.mockResolvedValue({ ad_prompt: {} });
  saveAdPromptMock.mockResolvedValue({ id: "ap1" });
  runRenderMock.mockResolvedValue({ imageUrl: "http://img", aspectRatio: "1:1", resolution: "1K" });
  persistRenderedAdMock.mockResolvedValue({ id: "ad1", imageUrl: "signed" });
});

describe("runBatch", () => {
  it("processes all items to done and finalizes", async () => {
    await runBatch({ batchId: "b1", userId: "u1", brandExtractionId: "be1", items: [baseItem("i1"), baseItem("i2")] });
    expect(updateBatchItemMock).toHaveBeenCalledWith("i1", expect.objectContaining({ status: "done", generatedAdId: "ad1" }));
    expect(updateBatchItemMock).toHaveBeenCalledWith("i2", expect.objectContaining({ status: "done" }));
    expect(finalizeBatchIfDoneMock).toHaveBeenCalledWith("b1");
  });

  it("isolates a failing item without sinking the batch", async () => {
    runRenderMock.mockImplementation(() => Promise.reject(new Error("render boom")));
    persistRenderedAdMock.mockResolvedValue({ id: "ad1", imageUrl: "signed" });
    runRenderMock
      .mockResolvedValueOnce({ imageUrl: "http://img", aspectRatio: "1:1", resolution: "1K" })
      .mockRejectedValueOnce(new Error("render boom"));
    await runBatch({ batchId: "b1", userId: "u1", brandExtractionId: "be1", items: [baseItem("i1"), baseItem("i2")] });
    const errorCall = updateBatchItemMock.mock.calls.find((c) => c[1].status === "error");
    expect(errorCall).toBeTruthy();
    expect(finalizeBatchIfDoneMock).toHaveBeenCalledWith("b1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bya/backend -- batch-worker`
Expected: FAIL — cannot find `./batch-worker.js`.

- [ ] **Step 3: Write the worker**

```ts
// apps/backend/src/services/batch-worker.ts
import type { AdIdea } from "@bya/shared";
import { runAdPrompt } from "../pipelines/ad-prompt.js";
import { runRender } from "../pipelines/render.js";
import { saveAdPrompt, persistRenderedAd, updateBatchItem, finalizeBatchIfDone } from "./supabase.js";
import { loadConfig } from "../config/index.js";

const MAX_CONCURRENCY = 3;

export type BatchWorkItem = {
  itemId: string;
  concept: AdIdea;
  brandExtraction: unknown;
  referenceAdImage: string;
  logoImage: string;
  productAsset?: string;
};

export type RunBatchArgs = {
  batchId: string;
  userId: string;
  brandExtractionId: string | null;
  items: BatchWorkItem[];
};

/** Fire-and-forget. Runs each item through Stage 2 -> render -> persist with a concurrency
 *  cap; one item's failure is recorded on its row and never aborts the others. */
export async function runBatch(args: RunBatchArgs): Promise<void> {
  const queue = [...args.items];
  const workers: Promise<void>[] = [];
  const take = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      await processItem(args, item);
    }
  };
  for (let i = 0; i < Math.min(MAX_CONCURRENCY, queue.length); i++) workers.push(take());
  await Promise.all(workers);
  await finalizeBatchIfDone(args.batchId);
}

async function processItem(args: RunBatchArgs, item: BatchWorkItem): Promise<void> {
  try {
    await updateBatchItem(item.itemId, { status: "running" });
    const adPrompt = await runAdPrompt({
      brandExtraction: item.brandExtraction,
      referenceAdImage: item.referenceAdImage,
      logoImage: item.logoImage,
      productAsset: item.productAsset,
      userDirection: item.concept,
    });
    const { id: adPromptId } = await saveAdPrompt({
      userId: args.userId,
      brandExtractionId: args.brandExtractionId,
      variant: item.productAsset ? "w_asset" : "no_asset",
      adPrompt,
      userDirection: item.concept,
      model: loadConfig().stage2Model,
    });
    const rendered = await runRender({
      adPrompt,
      referenceAdImage: item.referenceAdImage,
      logoImage: item.logoImage,
      productAsset: item.productAsset,
    });
    const saved = await persistRenderedAd({
      userId: args.userId,
      imageUrl: rendered.imageUrl,
      prompt: JSON.stringify(adPrompt.ad_prompt ?? adPrompt ?? {}),
      aspectRatio: rendered.aspectRatio,
      resolution: rendered.resolution,
      adPromptId,
    });
    await updateBatchItem(item.itemId, { status: "done", generatedAdId: saved.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateBatchItem(item.itemId, { status: "error", error: message });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @bya/backend -- batch-worker`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/batch-worker.ts apps/backend/src/services/batch-worker.test.ts
git commit -m "feat(backend): add concurrency-capped batch worker"
```

---

## Task 10: Batch routes

**Files:**
- Create: `apps/backend/src/routes/batch.ts`
- Modify: `apps/backend/src/server.ts`
- Test: `apps/backend/src/routes/batch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/routes/batch.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middleware/require-approved-user.js", () => ({
  requireApprovedUser: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user: unknown }).user = { id: "u1", email: "user@y.z" };
    next();
  },
}));
vi.mock("../middleware/require-admin.js", () => ({ ADMIN_EMAIL: "admin@betteryourads.dev" }));

const countAdsTodayMock = vi.fn();
const createBatchMock = vi.fn();
const getBatchMock = vi.fn();
vi.mock("../services/supabase.js", () => ({
  countAdsToday: (...a: unknown[]) => countAdsTodayMock(...a),
  createBatch: (...a: unknown[]) => createBatchMock(...a),
  getBatch: (...a: unknown[]) => getBatchMock(...a),
}));
const runBatchMock = vi.fn();
vi.mock("../services/batch-worker.js", () => ({ runBatch: (...a: unknown[]) => runBatchMock(...a) }));

import { batchRouter } from "./batch.js";
const app = express();
app.use(express.json());
app.use("/api", batchRouter);

const item = { concept: { idea_number: 1, idea_name: "A", main_hook: "h", cta: "c" }, referenceAdImage: "data:r", logoImage: "data:l" };

beforeEach(() => { for (const m of [countAdsTodayMock, createBatchMock, getBatchMock, runBatchMock]) m.mockReset(); });

describe("POST /api/batch", () => {
  it("creates a batch and kicks off the worker", async () => {
    countAdsTodayMock.mockResolvedValue(0);
    createBatchMock.mockResolvedValue({ batchId: "b1", itemIds: ["i1"] });
    const res = await request(app).post("/api/batch").send({ brandExtractionId: "be1", brandExtraction: {}, items: [item] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ batchId: "b1" });
    expect(runBatchMock).toHaveBeenCalled();
  });

  it("429s when the batch exceeds the remaining daily limit", async () => {
    countAdsTodayMock.mockResolvedValue(9); // 1 left, 2 requested
    const res = await request(app)
      .post("/api/batch")
      .send({ brandExtractionId: "be1", brandExtraction: {}, items: [item, item] });
    expect(res.status).toBe(429);
    expect(createBatchMock).not.toHaveBeenCalled();
  });

  it("422s when an item is missing required assets", async () => {
    countAdsTodayMock.mockResolvedValue(0);
    const res = await request(app)
      .post("/api/batch")
      .send({ brandExtractionId: "be1", brandExtraction: {}, items: [{ concept: { idea_name: "A", main_hook: "h", cta: "c" }, logoImage: "data:l" }] });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/batch/:id", () => {
  it("returns the batch view", async () => {
    getBatchMock.mockResolvedValue({ id: "b1", status: "running", items: [] });
    const res = await request(app).get("/api/batch/b1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("b1");
  });

  it("404s for an unknown batch", async () => {
    getBatchMock.mockResolvedValue(null);
    const res = await request(app).get("/api/batch/nope");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bya/backend -- routes/batch`
Expected: FAIL — cannot find `./batch.js`.

- [ ] **Step 3: Write the routes**

```ts
// apps/backend/src/routes/batch.ts
import { Router } from "express";
import { AdIdea } from "@bya/shared";
import { toHttpError, ValidationError, RateLimitError, AppError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { ADMIN_EMAIL } from "../middleware/require-admin.js";
import { countAdsToday, createBatch, getBatch } from "../services/supabase.js";
import { runBatch, type BatchWorkItem } from "../services/batch-worker.js";

const DAILY_CREATIVE_LIMIT = 10;

export const batchRouter = Router();

batchRouter.post("/batch", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtraction = req.body?.brandExtraction;
    const brandExtractionId: string | null = typeof req.body?.brandExtractionId === "string" ? req.body.brandExtractionId : null;
    const rawItems: unknown = req.body?.items;
    if (!brandExtraction) throw new ValidationError("brandExtraction is required.");
    if (!Array.isArray(rawItems) || rawItems.length === 0) throw new ValidationError("At least one concept is required.");

    const items: BatchWorkItem[] = rawItems.map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const concept = AdIdea.safeParse(r.concept);
      if (!concept.success) throw new ValidationError(`Concept ${i + 1} is malformed.`);
      if (typeof r.referenceAdImage !== "string" || typeof r.logoImage !== "string") {
        throw new ValidationError(`Concept ${i + 1} is missing its reference ad or logo.`);
      }
      return {
        itemId: "", // filled after createBatch
        concept: concept.data,
        brandExtraction,
        referenceAdImage: r.referenceAdImage,
        logoImage: r.logoImage,
        productAsset: typeof r.productAsset === "string" ? r.productAsset : undefined,
      };
    });

    if (req.user!.email?.toLowerCase() !== ADMIN_EMAIL) {
      const used = await countAdsToday(userId);
      if (used + items.length > DAILY_CREATIVE_LIMIT) {
        throw new RateLimitError(
          `This batch needs ${items.length} creatives but only ${Math.max(0, DAILY_CREATIVE_LIMIT - used)} remain today.`,
        );
      }
    }

    const { batchId, itemIds } = await createBatch({
      userId,
      brandExtractionId,
      items: items.map((it) => ({ ideaNumber: it.concept.idea_number ?? null, ideaName: it.concept.idea_name ?? null })),
    });
    items.forEach((it, i) => (it.itemId = itemIds[i]));

    // Fire-and-forget: the worker runs in the background; the client polls GET /api/batch/:id.
    void runBatch({ batchId, userId, brandExtractionId, items }).catch((e) => {
      console.error("[batch] worker crashed:", e instanceof Error ? e.message : e);
    });

    res.json({ batchId });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

batchRouter.get("/batch/:id", requireApprovedUser, async (req, res) => {
  try {
    const view = await getBatch(req.params.id, req.user!.id);
    if (!view) throw new AppError("Batch not found.", "NOT_FOUND", 404, "validation");
    res.json(view);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

Note: `AppError` is exported from `lib/errors.ts`; if its constructor is not exported as public, instead add a small `NotFoundError` to `lib/errors.ts`. As written, `AppError` is `export class AppError` — usable directly.

- [ ] **Step 4: Mount the router**

In `apps/backend/src/server.ts`: import after `conceptsRouter`:

```ts
import { batchRouter } from "./routes/batch.js";
```

and mount after `conceptsRouter`:

```ts
  app.use("/api", batchRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @bya/backend -- routes/batch`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/batch.ts apps/backend/src/routes/batch.test.ts apps/backend/src/server.ts
git commit -m "feat(backend): add POST/GET /api/batch routes"
```

---

## Task 11: Clear stale batches on boot

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Call `markStaleBatchItems` after listen**

In `apps/backend/src/index.ts`, add the import after line 3:

```ts
import { markStaleBatchItems } from "./services/supabase.js";
```

and inside the `app.listen` callback (after the console.log), add:

```ts
  markStaleBatchItems().catch((e) => console.error("  Could not clear stale batches:", e instanceof Error ? e.message : e));
```

- [ ] **Step 2: Verify build**

Run: `npm run build -w @bya/backend`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/index.ts
git commit -m "feat(backend): mark stale batch items errored on startup"
```

---

## Task 12: API client methods

**Files:**
- Modify: `apps/web/src/api/client.ts`

- [ ] **Step 1: Add concept/batch types + methods**

In `apps/web/src/api/client.ts`, extend the `@bya/shared` import to include `ConceptSet, AdIdea`:

```ts
import type {
  MeasuredSiteData, BrandRequest, BrandExtraction, AdPromptRequest, AdPrompt,
  RenderRequest, BrandSummary, AdSummary, BrandDetail, AdminUser, ConceptSet, AdIdea,
} from "@bya/shared";
```

Add these exported types above `export const api`:

```ts
export type BatchItemStatus = "queued" | "running" | "done" | "error";
export type BatchItemView = {
  id: string; ideaNumber: number | null; ideaName: string | null;
  status: BatchItemStatus; imageUrl: string | null; error: string | null;
};
export type BatchView = { id: string; status: BatchItemStatus; items: BatchItemView[] };
export type BatchItemInput = { concept: AdIdea; referenceAdImage: string; logoImage: string; productAsset?: string };
```

Add to the `api` object (after `render`):

```ts
  concepts: (req: { brandExtraction: BrandExtraction; brandExtractionId: string }) =>
    request<{ id: string; conceptSet: ConceptSet }>("/api/concepts", req),
  startBatch: (req: { brandExtractionId: string; brandExtraction: BrandExtraction; items: BatchItemInput[] }) =>
    request<{ batchId: string }>("/api/batch", req),
  getBatch: (batchId: string) => request<BatchView>(`/api/batch/${batchId}`),
```

- [ ] **Step 2: Verify web type-checks**

Run: `npm run build -w @bya/web`
Expected: builds (note: Workbench isn't using these yet — that's fine).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/client.ts
git commit -m "feat(web): add concepts and batch API client methods"
```

---

## Task 13: Workbench reducer — new stages

**Files:**
- Modify: `apps/web/src/workbench/state.ts`
- Test: `apps/web/src/workbench/state.test.ts`

The flow: after `ANALYZED` we go to `concepts-loading`; `CONCEPTS_READY` → `pick-concepts`; `TOGGLE_CONCEPT` toggles selection (capped externally); `PROCEED_ASSETS` → `pick-assets`; `SET_ASSET` sets a per-concept asset; `BATCH_STARTED` → `batch-running` (stores `batchId`); `BATCH_UPDATED` stores polled items; `BATCH_DONE` → `batch-done`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/workbench/state.test.ts  (append; file already imports reducer/initialState)
import { describe, it, expect } from "vitest";
import { reducer, initialState } from "./state";

const idea = (n: number) => ({ idea_number: n, idea_name: `I${n}`, main_hook: "h", cta: "c", core_angle: "", customer_context: "", customer_pain_or_desire: "", customer_insight: "", belief_to_shift: "", supporting_message: "", why_this_could_work: "", proof_or_reason_to_believe: "", safe_claims_used: [], claims_to_avoid: [], visual_direction_for_later: "", brand_dna_fields_used: [] });
const conceptSet = { ad_ideas: [idea(1), idea(2)], recommended_top_3: [] } as never;

describe("concept/batch reducer", () => {
  it("ANALYZED moves to concepts-loading", () => {
    const s = reducer({ ...initialState }, { type: "ANALYZED", measuredSiteData: null as never, brandExtraction: {} as never, brandExtractionId: "be1" });
    expect(s.stage).toBe("concepts-loading");
    expect(s.brandExtractionId).toBe("be1");
  });

  it("CONCEPTS_READY moves to pick-concepts and stores the set", () => {
    const s = reducer({ ...initialState, stage: "concepts-loading" }, { type: "CONCEPTS_READY", conceptSet });
    expect(s.stage).toBe("pick-concepts");
    expect(s.conceptSet?.ad_ideas).toHaveLength(2);
  });

  it("TOGGLE_CONCEPT adds then removes an idea number", () => {
    let s = reducer({ ...initialState, stage: "pick-concepts", conceptSet }, { type: "TOGGLE_CONCEPT", ideaNumber: 1 });
    expect(s.selectedIdeaNumbers).toEqual([1]);
    s = reducer(s, { type: "TOGGLE_CONCEPT", ideaNumber: 1 });
    expect(s.selectedIdeaNumbers).toEqual([]);
  });

  it("SET_ASSET stores a per-concept asset", () => {
    const s = reducer({ ...initialState, stage: "pick-assets" }, { type: "SET_ASSET", ideaNumber: 1, slot: "ref", dataUrl: "data:x" });
    expect(s.assets[1]?.ref).toBe("data:x");
  });

  it("BATCH_STARTED stores batchId and moves to batch-running", () => {
    const s = reducer({ ...initialState, stage: "pick-assets" }, { type: "BATCH_STARTED", batchId: "b1" });
    expect(s.stage).toBe("batch-running");
    expect(s.batchId).toBe("b1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bya/web -- state`
Expected: FAIL — new stages/actions don't exist.

- [ ] **Step 3: Rewrite `state.ts`**

Replace the contents of `apps/web/src/workbench/state.ts` with:

```ts
import type { MeasuredSiteData, BrandExtraction, AdPrompt, ConceptSet } from "@bya/shared";
import type { BatchItemView } from "../api/client";

export type Stage =
  | "idle" | "analyzing"
  | "concepts-loading" | "pick-concepts" | "pick-assets" | "batch-running" | "batch-done"
  | "error";

export type AssetSlot = "ref" | "logo" | "product";
export type ConceptAssets = { ref?: string; logo?: string; product?: string };

export type WorkbenchState = {
  stage: Stage;
  url: string;
  measuredSiteData: MeasuredSiteData | null;
  brandExtraction: BrandExtraction | null;
  brandExtractionId: string | null;
  conceptSet: ConceptSet | null;
  selectedIdeaNumbers: number[];
  assets: Record<number, ConceptAssets>;
  batchId: string | null;
  batchItems: BatchItemView[];
  error: string | null;
  errorCode: string | null;
};

export const initialState: WorkbenchState = {
  stage: "idle",
  url: "",
  measuredSiteData: null,
  brandExtraction: null,
  brandExtractionId: null,
  conceptSet: null,
  selectedIdeaNumbers: [],
  assets: {},
  batchId: null,
  batchItems: [],
  error: null,
  errorCode: null,
};

export type Action =
  | { type: "START"; url: string }
  | { type: "ANALYZED"; measuredSiteData: MeasuredSiteData; brandExtraction: BrandExtraction; brandExtractionId: string }
  | { type: "PRESET_BRAND"; brandExtraction: BrandExtraction; brandExtractionId: string; measuredSiteData: MeasuredSiteData | null; url?: string }
  | { type: "CONCEPTS_READY"; conceptSet: ConceptSet }
  | { type: "TOGGLE_CONCEPT"; ideaNumber: number }
  | { type: "PROCEED_ASSETS" }
  | { type: "BACK_TO_CONCEPTS" }
  | { type: "SET_ASSET"; ideaNumber: number; slot: AssetSlot; dataUrl: string | null }
  | { type: "COPY_ASSETS_TO_ALL"; ideaNumber: number }
  | { type: "BATCH_STARTED"; batchId: string }
  | { type: "BATCH_UPDATED"; items: BatchItemView[] }
  | { type: "BATCH_DONE"; items: BatchItemView[] }
  | { type: "FAILED"; message: string; code?: string }
  | { type: "RETRY" }
  | { type: "RESET" };

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case "START":
      return { ...initialState, stage: "analyzing", url: action.url };
    case "ANALYZED":
      return { ...state, stage: "concepts-loading", measuredSiteData: action.measuredSiteData, brandExtraction: action.brandExtraction, brandExtractionId: action.brandExtractionId };
    case "PRESET_BRAND":
      return { ...initialState, stage: "concepts-loading", brandExtraction: action.brandExtraction, brandExtractionId: action.brandExtractionId, measuredSiteData: action.measuredSiteData, url: action.url ?? "" };
    case "CONCEPTS_READY":
      return { ...state, stage: "pick-concepts", conceptSet: action.conceptSet };
    case "TOGGLE_CONCEPT": {
      const has = state.selectedIdeaNumbers.includes(action.ideaNumber);
      return {
        ...state,
        selectedIdeaNumbers: has
          ? state.selectedIdeaNumbers.filter((n) => n !== action.ideaNumber)
          : [...state.selectedIdeaNumbers, action.ideaNumber],
      };
    }
    case "PROCEED_ASSETS":
      return { ...state, stage: "pick-assets" };
    case "BACK_TO_CONCEPTS":
      return { ...state, stage: "pick-concepts" };
    case "SET_ASSET":
      return {
        ...state,
        assets: { ...state.assets, [action.ideaNumber]: { ...state.assets[action.ideaNumber], [action.slot]: action.dataUrl ?? undefined } },
      };
    case "COPY_ASSETS_TO_ALL": {
      const src = state.assets[action.ideaNumber];
      if (!src) return state;
      const next: Record<number, ConceptAssets> = {};
      for (const n of state.selectedIdeaNumbers) next[n] = { ...src };
      return { ...state, assets: { ...state.assets, ...next } };
    }
    case "BATCH_STARTED":
      return { ...state, stage: "batch-running", batchId: action.batchId, error: null, errorCode: null };
    case "BATCH_UPDATED":
      return { ...state, batchItems: action.items };
    case "BATCH_DONE":
      return { ...state, stage: "batch-done", batchItems: action.items };
    case "FAILED":
      return { ...state, stage: "error", error: action.message, errorCode: action.code ?? null };
    case "RETRY":
      return state.conceptSet
        ? { ...state, stage: "pick-concepts", error: null, errorCode: null }
        : initialState;
    case "RESET":
      return initialState;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @bya/web -- state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workbench/state.ts apps/web/src/workbench/state.test.ts
git commit -m "feat(web): extend workbench reducer for concepts and batch"
```

---

## Task 14: Workbench — concept loading + pick-concepts view

**Files:**
- Modify: `apps/web/src/workbench/Workbench.tsx`

This task rewires the `idle`/`analyzing` flow into the new stages and renders the concept-picker. The existing `pick-ref`/`generating`/`ready` views and `runGenerate` are removed (replaced by the batch flow).

- [ ] **Step 1: Replace the stepper labels + states**

In `Workbench.tsx`, change `STEP_LABELS` to:

```ts
const STEP_LABELS = ["Analyze brand", "Pick concepts", "Add assets", "Generate"] as const;
```

and replace `stepStates`:

```ts
function stepStates(stage: Stage): ("done" | "active" | "")[] {
  switch (stage) {
    case "idle":
    case "analyzing":
      return ["active", "", "", ""];
    case "concepts-loading":
    case "pick-concepts":
      return ["done", "active", "", ""];
    case "pick-assets":
      return ["done", "done", "active", ""];
    case "batch-running":
      return ["done", "done", "done", "active"];
    case "batch-done":
      return ["done", "done", "done", "done"];
    default:
      return ["", "", "", ""];
  }
}
```

- [ ] **Step 2: Replace `runGenerate` and add concept fetching**

In the `Workbench` component, replace the `runAnalyze`/`runGenerate` block. `runAnalyze` now ends in `ANALYZED` (unchanged), and a new effect fetches concepts when entering `concepts-loading`:

```ts
  async function runAnalyze(url: string) {
    dispatch({ type: "START", url });
    try {
      const msd = await api.extract(url);
      const { id: brandExtractionId, brandExtraction } = await api.brand({ url, measuredSiteData: msd });
      dispatch({ type: "ANALYZED", measuredSiteData: msd, brandExtraction, brandExtractionId });
    } catch (e) {
      dispatch({ type: "FAILED", ...failure(e) });
    }
  }

  useEffect(() => {
    if (state.stage !== "concepts-loading" || !state.brandExtraction || !state.brandExtractionId) return;
    let active = true;
    api.concepts({ brandExtraction: state.brandExtraction, brandExtractionId: state.brandExtractionId })
      .then((r) => { if (active) dispatch({ type: "CONCEPTS_READY", conceptSet: r.conceptSet }); })
      .catch((e) => { if (active) dispatch({ type: "FAILED", ...failure(e) }); });
    return () => { active = false; };
  }, [state.stage, state.brandExtraction, state.brandExtractionId]);
```

- [ ] **Step 3: Replace the stage render blocks**

Remove the `pick-ref`, `generating`, and `ready` JSX blocks and the `PickRef` function. Keep `idle`, `analyzing`, and the two `error` blocks. Add new blocks:

```tsx
      {state.stage === "concepts-loading" && (
        <div className="stage active">
          <div className="stage-body">
            <div className="status-row"><span className="spinner" /> Generating ad concepts…</div>
          </div>
        </div>
      )}

      {state.stage === "pick-concepts" && state.conceptSet && (
        <PickConcepts state={state} dispatch={dispatch} usage={usage} />
      )}

      {state.stage === "pick-assets" && state.conceptSet && (
        <PickAssets state={state} dispatch={dispatch} onGenerate={runBatch} usage={usage} />
      )}

      {(state.stage === "batch-running" || state.stage === "batch-done") && (
        <BatchResults state={state} dispatch={dispatch} />
      )}
```

- [ ] **Step 4: Add the `PickConcepts` component**

Add to `Workbench.tsx` (helpers `selectedSet`, `remainingFor` used here and later):

```tsx
function remaining(usage: UsageInfo | null): number {
  if (!usage || usage.unlimited) return Infinity;
  return Math.max(0, usage.remaining);
}

function PickConcepts({ state, dispatch, usage }: { state: WorkbenchState; dispatch: Dispatch<Action>; usage: UsageInfo | null }) {
  const ideas = state.conceptSet!.ad_ideas;
  const recommended = new Set((state.conceptSet!.recommended_top_3 ?? []).map((r) => Number(r.idea_number)).filter((n) => !Number.isNaN(n)));
  const cap = remaining(usage);
  const selected = state.selectedIdeaNumbers;

  return (
    <div className="stack">
      <div className="stage active">
        <div className="stage-head">
          <div className="left">
            <span className="num">2</span>
            <div>
              <div className="title">Pick your concepts</div>
              <div className="sub">Choose one or more angles to generate. Each becomes its own ad.</div>
            </div>
          </div>
        </div>
        <div className="stage-body">
          <div className="concept-grid">
            {ideas.map((idea, i) => {
              const n = idea.idea_number ?? i + 1;
              const isSel = selected.includes(n);
              const atCap = !isSel && selected.length >= cap;
              return (
                <button
                  key={n}
                  type="button"
                  className={`concept-card${isSel ? " selected" : ""}`}
                  disabled={atCap}
                  onClick={() => dispatch({ type: "TOGGLE_CONCEPT", ideaNumber: n })}
                >
                  <div className="concept-card-top">
                    <span className="badge">{idea.awareness_level ?? `Idea ${n}`}</span>
                    {recommended.has(n) && <span className="badge rec">Recommended</span>}
                    <span className={`tick${isSel ? " on" : ""}`}>{isSel ? "✓" : ""}</span>
                  </div>
                  <div className="concept-name">{idea.idea_name}</div>
                  <div className="concept-hook">{idea.main_hook}</div>
                  {idea.why_this_could_work && <div className="concept-why">{idea.why_this_could_work}</div>}
                  <div className="concept-cta">CTA: {idea.cta}</div>
                </button>
              );
            })}
          </div>
          <div className="actions-row" style={{ marginTop: "var(--space-4)" }}>
            <button
              className="btn primary"
              disabled={selected.length === 0}
              onClick={() => dispatch({ type: "PROCEED_ASSETS" })}
            >
              Add assets ({selected.length})
            </button>
          </div>
          {usage && !usage.unlimited && (
            <span className="hint">{usage.remaining} of {usage.limit} creatives left today.</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify it compiles (PickAssets/BatchResults/runBatch added in next tasks)**

Run: `npm run build -w @bya/web`
Expected: FAIL referencing `PickAssets`, `BatchResults`, `runBatch` — that's expected; they're added in Tasks 15–16. Do NOT commit a broken build. If you are executing task-by-task with a broken intermediate, combine Steps for Tasks 14–16 into one commit at the end of Task 16. (Recommended: implement Tasks 14, 15, 16 back to back, then build + commit once.)

---

## Task 15: Workbench — per-concept assets view

**Files:**
- Modify: `apps/web/src/workbench/Workbench.tsx`

- [ ] **Step 1: Add `runBatch` to the component**

Inside `Workbench`, add:

```ts
  async function runBatch() {
    if (!state.brandExtraction || !state.brandExtractionId) return;
    const items = state.selectedIdeaNumbers.map((n) => {
      const idea = state.conceptSet!.ad_ideas.find((x, i) => (x.idea_number ?? i + 1) === n)!;
      const a = state.assets[n] ?? {};
      return { concept: idea, referenceAdImage: a.ref!, logoImage: a.logo!, productAsset: a.product };
    });
    try {
      const { batchId } = await api.startBatch({ brandExtractionId: state.brandExtractionId, brandExtraction: state.brandExtraction, items });
      dispatch({ type: "BATCH_STARTED", batchId });
    } catch (e) {
      dispatch({ type: "FAILED", ...failure(e) });
    }
  }
```

- [ ] **Step 2: Add the `PickAssets` component**

```tsx
function PickAssets({ state, dispatch, onGenerate, usage }: { state: WorkbenchState; dispatch: Dispatch<Action>; onGenerate: () => void; usage: UsageInfo | null }) {
  const selectedIdeas = state.selectedIdeaNumbers
    .map((n) => state.conceptSet!.ad_ideas.find((x, i) => (x.idea_number ?? i + 1) === n))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const ready = state.selectedIdeaNumbers.every((n) => {
    const a = state.assets[n];
    return Boolean(a?.ref && a?.logo);
  });
  const capped = usage !== null && !usage.unlimited && usage.remaining <= 0;

  return (
    <div className="stack">
      <div className="stage active">
        <div className="stage-head">
          <div className="left">
            <span className="num">3</span>
            <div>
              <div className="title">Add assets per concept</div>
              <div className="sub">Each concept needs a reference ad and a logo. Product image is optional.</div>
            </div>
          </div>
        </div>
        <div className="stage-body stack">
          {selectedIdeas.map((idea, i) => {
            const n = idea.idea_number ?? i + 1;
            const a = state.assets[n] ?? {};
            return (
              <div key={n} className="concept-assets">
                <div className="concept-assets-head">
                  <span className="badge">{idea.awareness_level ?? `Idea ${n}`}</span>
                  <span className="concept-name">{idea.idea_name}</span>
                  {state.selectedIdeaNumbers.length > 1 && (a.ref || a.logo) && (
                    <button className="btn ghost sm" onClick={() => dispatch({ type: "COPY_ASSETS_TO_ALL", ideaNumber: n })}>
                      Copy to all
                    </button>
                  )}
                </div>
                <Dropzone label="Reference ad" required value={a.ref ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", ideaNumber: n, slot: "ref", dataUrl: d })} />
                <Dropzone label="Logo" required height={96} value={a.logo ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", ideaNumber: n, slot: "logo", dataUrl: d })} />
                <Dropzone label="Product image (optional)" value={a.product ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", ideaNumber: n, slot: "product", dataUrl: d })} />
              </div>
            );
          })}
          <div className="actions-row">
            <button className="btn" onClick={() => dispatch({ type: "BACK_TO_CONCEPTS" })}>Back</button>
            <button className="btn primary" disabled={!ready || capped} onClick={onGenerate}>
              Make my ads ({state.selectedIdeaNumbers.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 note:** No separate test/build here — continues into Task 16 (single build + commit).

---

## Task 16: Workbench — batch results + polling

**Files:**
- Modify: `apps/web/src/workbench/Workbench.tsx`

- [ ] **Step 1: Add polling effect**

Inside `Workbench`, add:

```ts
  useEffect(() => {
    if (state.stage !== "batch-running" || !state.batchId) return;
    let active = true;
    const tick = async () => {
      try {
        const view = await api.getBatch(state.batchId!);
        if (!active) return;
        if (view.status === "done" || view.status === "error") {
          dispatch({ type: "BATCH_DONE", items: view.items });
          refreshUsage();
        } else {
          dispatch({ type: "BATCH_UPDATED", items: view.items });
        }
      } catch { /* keep polling; transient errors shouldn't kill the batch view */ }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { active = false; clearInterval(id); };
  }, [state.stage, state.batchId]);
```

- [ ] **Step 2: Add the `BatchResults` component**

```tsx
function BatchResults({ state, dispatch }: { state: WorkbenchState; dispatch: Dispatch<Action> }) {
  const items = state.batchItems;
  const done = state.stage === "batch-done";
  return (
    <div className="stage active">
      <div className="stage-head">
        <div className="left">
          <span className="num">{done ? "✓" : "4"}</span>
          <div>
            <div className="title">{done ? "Your ads are ready" : "Generating your ads…"}</div>
            <div className="sub">{done ? "Download them, or start over." : "Each concept renders independently."}</div>
          </div>
        </div>
      </div>
      <div className="stage-body">
        <div className="batch-grid">
          {items.map((it) => (
            <div key={it.id} className="batch-tile">
              <div className="batch-tile-label">{it.ideaName ?? `Idea ${it.ideaNumber ?? ""}`}</div>
              {it.status === "done" && it.imageUrl && (
                <>
                  <img src={it.imageUrl} alt={it.ideaName ?? "Generated ad"} />
                  <a href={it.imageUrl} download className="btn primary sm"><IconDownload className="ico" width={14} height={14} /> Download</a>
                </>
              )}
              {(it.status === "queued" || it.status === "running") && <div className="status-row"><span className="spinner" /> {it.status === "running" ? "Rendering…" : "Queued"}</div>}
              {it.status === "error" && <div className="batch-error">{it.error ?? "Failed"}</div>}
            </div>
          ))}
        </div>
        {done && (
          <div className="actions-row" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn" onClick={() => dispatch({ type: "RESET" })}>Start over</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fix imports**

Ensure the top of `Workbench.tsx` imports the new types and components used. The `import type { ... } from "./state"` line must include `WorkbenchState`, `Action`, `Stage` (already present). `UsageInfo` is already imported from `../api/client`. Remove the now-unused `MeasuredSiteData` import only if no longer referenced (the `PRESET_BRAND` effect still parses it — keep it).

- [ ] **Step 4: Build + run web tests**

Run: `npm run build -w @bya/web && npm test -w @bya/web`
Expected: build succeeds; tests pass (existing Workbench tests that referenced removed stages must be updated — see Step 5).

- [ ] **Step 5: Update obsolete Workbench tests**

Open `apps/web/src/workbench/Workbench.test.tsx`. Any assertions about the old `pick-ref` / "Make my ad" single-flow must be updated to the new flow: after analyze, the UI shows "Generating ad concepts…" then the concept cards (mock `api.concepts`). Update mocks so `api.concepts` resolves a 2-idea set and assert "Pick your concepts" renders. Remove assertions tied to the deleted single-render `ready` stage.

- [ ] **Step 6: Commit (Tasks 14–16 together)**

```bash
git add apps/web/src/workbench/Workbench.tsx apps/web/src/workbench/Workbench.test.tsx
git commit -m "feat(web): concept picker, per-concept assets, and batch results UI"
```

---

## Task 17: Styling (ui-ux-pro-max)

**Files:**
- Modify: `apps/web/src/styles/app.css`

- [ ] **Step 1: Invoke the ui-ux-pro-max skill** for guidance on the concept-card and batch-grid styling, matching the existing token system in `styles/tokens.css`.

- [ ] **Step 2: Add styles** for `.concept-grid`, `.concept-card` (+ `.selected`, `:disabled`), `.concept-card-top`, `.tick`, `.concept-name`, `.concept-hook`, `.concept-why`, `.concept-cta`, `.badge.rec`, `.concept-assets`, `.concept-assets-head`, `.batch-grid`, `.batch-tile`, `.batch-tile-label`, `.batch-error`, and `.btn.sm`/`.btn.ghost`. Use existing CSS variables (`--space-*`, `--radius-*`, `--border-hairline`, brand colors). Keep responsive: `.concept-grid` and `.batch-grid` as `display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));`.

- [ ] **Step 3: Manual visual check**

Run the app (`npm run dev -w @bya/backend` and `npm run dev -w @bya/web`), analyze a brand, and confirm the concept cards, selection state, per-concept assets, and the batch grid render correctly and are responsive.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/app.css
git commit -m "style(web): concept cards and batch grid"
```

---

## Task 18: Feature docs

**Files:**
- Modify: `docs/FEATURES.md`

- [ ] **Step 1: Add entries** under the appropriate backend and frontend sections of `docs/FEATURES.md` (match the file's existing format/sections):

- `POST /api/concepts` — generate 5 strategic ad concepts from brand DNA (STAGE3_MODEL).
- `POST /api/batch` + `GET /api/batch/:id` — multi-concept batch render via background worker.
- Workbench concept picker + per-concept assets + batch results.

- [ ] **Step 2: Commit**

```bash
git add docs/FEATURES.md
git commit -m "docs: list concept generation and batch features"
```

---

## Final verification

- [ ] `npm test -w @bya/shared` — all pass.
- [ ] `npm test -w @bya/backend` — all pass (gated e2e skip without keys).
- [ ] `npm test -w @bya/web` — all pass.
- [ ] `npm run build -w @bya/backend && npm run build -w @bya/web` — both succeed.
- [ ] Owner applied `supabase/migrations/20260528130000_concepts_and_batches.sql` via the dashboard (verify with a `select * from information_schema.tables where table_name in ('ad_concept_sets','batch_jobs','batch_items');` query).
- [ ] Manual end-to-end: analyze a brand → 5 concepts appear → select 2 → attach assets to each → "Make my ads" → tiles fill in → downloads work → ads appear in the Library.
