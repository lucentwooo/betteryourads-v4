# TS Backend — Ad Prompt (Stage 2) Slice (Plan 3 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the third backend vertical slice — `POST /api/ad-prompt`: given `{ brandExtraction, referenceAdImage, logoImage, productAsset?, customerResearch?, performanceMemory?, userDirection? }`, run the Stage-2 "Image Generator v4" **vision** prompt through OpenRouter and return a validated, versioned `AdPrompt` JSON.

**Architecture:** Extends the layered backend (routes → pipelines → services). Adds a tolerant `AdPrompt`/`AdPromptRequest` zod contract in `packages/shared`; extends the OpenRouter `chat()` client to accept **multimodal content** (text + `image_url` parts); ports the two v4 Stage-2 prompts as modules + registry helpers (`getStage2Prompt`, `buildStage2Content`); and adds the `runAdPrompt` pipeline (single vision call + LLM-JSON guard with one repair retry). The route is gated by the existing `requireApprovedUser`. Variant selection (`v4-w-asset` vs `v4-no-asset`) is driven purely by `productAsset` presence; `:online` is OFF for Stage 2.

**Tech Stack:** TypeScript, Node ≥ 20 (ESM), Express 4, OpenRouter chat-completions (vision, via `fetch`), zod, Vitest, supertest, tsx.

This is **Plan 3 of 5**. Persistence is deferred to **Plan 5** — `POST /api/ad-prompt` takes `brandExtraction` inline and returns `{ adPrompt }` (no `id`, no Supabase), exactly as Plan 2 returned `{ brandExtraction }`. Render is **Plan 4**. Spec: `docs/superpowers/specs/2026-05-28-ts-backend-ad-prompt-design.md`. Master spec: `docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md`.

**Conventions carried from earlier plans:** Windows + PowerShell; repo lives in OneDrive (transient file locks — retry once on a failed file op). Never run a bare emitting `tsc` — always `tsc --noEmit`; before committing run `git status --porcelain` and stage only the explicit paths so no stray emitted `.js`/`.d.ts` get committed. Commit messages end with a trailing `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` line. Push to origin after each commit (`git push`).

---

## File Structure

```
packages/shared/
  src/ad-prompt.ts                       # NEW — AdPrompt + AdPromptRequest zod contracts (tolerant, versioned)
  src/index.ts                           # MODIFY — re-export ad-prompt
apps/backend/
  package.json                           # MODIFY — add "run:ad-prompt" script
  src/services/openrouter.ts             # MODIFY — ChatMessage.content accepts multimodal parts
  src/prompts/image-generator.v4-no-asset.ts  # NEW — verbatim v4 NO-asset system prompt
  src/prompts/image-generator.v4-w-asset.ts    # NEW — verbatim v4 w-asset system prompt
  src/prompts/registry.ts                # MODIFY — getStage2Prompt() + buildStage2Content()
  src/pipelines/ad-prompt.ts             # NEW — runAdPrompt() single vision call + repair guard
  src/routes/ad-prompt.ts                # NEW — POST /api/ad-prompt (gated)
  src/server.ts                          # MODIFY — wire adPromptRouter
  scripts/run-ad-prompt.ts               # NEW — manual runner (brand json + images → ad prompt)
  tests/openrouter.test.ts               # MODIFY — multimodal content round-trip
  tests/prompts.test.ts                  # MODIFY — getStage2Prompt + buildStage2Content
  tests/ad-prompt.pipeline.test.ts       # NEW — runAdPrompt orchestration + repair + errors
  tests/ad-prompt.routes.test.ts         # NEW — POST /api/ad-prompt (auth + mapping)
  tests/ad-prompt.e2e.test.ts            # NEW — gated real OpenRouter vision smoke
```

No new npm dependencies. `Stage` already includes `"ad-prompt"` and `stage2Model` already exists in `AppConfig` — no `errors.ts`/`config` changes.

---

## Task 1: `AdPrompt` + `AdPromptRequest` zod contracts

The contract Stage 2 produces (consumed by Stage 3 in Plan 4) and the request body. **Tolerant**, mirroring `BrandExtraction`: every section optional and `.passthrough()`, so model drift / older rows still parse. The pipeline (Task 4) adds the real floor by requiring `ad_prompt` in the result; Stage 3 reads `ad_prompt.canvas.aspect_ratio`, so `canvas` is typed (loosely). `schema_version` is stamped by the pipeline, not the model.

**Files:**
- Create: `packages/shared/src/ad-prompt.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/ad-prompt.ts`**

```ts
import { z } from "zod";
import { BrandExtraction } from "./brand-extraction.js";

const Canvas = z
  .object({
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    aspect_ratio: z.string().optional(),
    format: z.string().optional(),
    safe_margin: z.string().optional(),
  })
  .passthrough();

/** The render spec Stage 3 (Plan 4) consumes. Kept loose except `canvas`, whose
 *  `aspect_ratio` Stage 3 reads; every field optional so model drift still parses. */
const AdPromptBody = z
  .object({
    goal: z.string().optional(),
    canvas: Canvas.optional(),
  })
  .passthrough();

export const AdPrompt = z
  .object({
    schema_version: z.number().optional(),
    reference_ad_analysis: z.object({}).passthrough().optional(),
    reskin_map: z.object({}).passthrough().optional(),
    ad_prompt: AdPromptBody.optional(),
    assumptions: z.array(z.unknown()).optional(),
    missing_inputs_that_would_improve_output: z.array(z.unknown()).optional(),
    source_fields_used: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type AdPrompt = z.infer<typeof AdPrompt>;

/** Request body for POST /api/ad-prompt. Images are base64 data URLs. */
export const AdPromptRequest = z.object({
  brandExtraction: BrandExtraction,
  referenceAdImage: z.string(),
  logoImage: z.string(),
  productAsset: z.string().optional(),
  customerResearch: z.unknown().optional(),
  performanceMemory: z.unknown().optional(),
  userDirection: z.unknown().optional(),
});

export type AdPromptRequest = z.infer<typeof AdPromptRequest>;
```

- [ ] **Step 2: Re-export from `packages/shared/src/index.ts`**

Add below the existing `export * from "./brand-extraction.js";`:

```ts
export * from "./ad-prompt.js";
```

- [ ] **Step 3: Type-check the workspace**

Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit + push**

```bash
git add packages/shared/src/ad-prompt.ts packages/shared/src/index.ts
git commit -m "feat(shared): AdPrompt + AdPromptRequest zod contracts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Multimodal `chat()` content

Stage 2 is a vision call: the user message `content` becomes an array of `{type:"text"}` + `{type:"image_url"}` parts. This is purely a **type** widening — `chat()` already `JSON.stringify`s `messages` verbatim, so the fetch body is unchanged. Stage 1's string content still type-checks (the union includes `string`).

**Files:**
- Modify: `apps/backend/src/services/openrouter.ts`
- Modify: `apps/backend/tests/openrouter.test.ts`

- [ ] **Step 1: Add the failing test**

Append this case inside the existing `describe("chat", ...)` block in `apps/backend/tests/openrouter.test.ts`:

```ts
  it("passes multimodal content (text + image parts) through unchanged", async () => {
    const fn = mockFetchOnce(200, { choices: [{ message: { content: "{}" } }] });
    await chat({
      model: "x/vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
    });
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(Array.isArray(body.messages[0].content)).toBe(true);
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/png;base64,AAAA");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- openrouter`
Expected: FAIL — TypeScript rejects the array `content` (current `ChatMessage.content` is `string`), so the test file does not compile / the case errors.

- [ ] **Step 3: Widen the content type in `apps/backend/src/services/openrouter.ts`**

Replace the `ChatMessage` type (line 3) with:

```ts
export type TextContentPart = { type: "text"; text: string };
export type ImageContentPart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextContentPart | ImageContentPart;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };
```

Leave the rest of the file unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- openrouter`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/services/openrouter.ts apps/backend/tests/openrouter.test.ts
git commit -m "feat(backend): OpenRouter chat() accepts multimodal content

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: Stage-2 prompt modules + registry helpers

Port the two v4 prompts as verbatim modules, then add a variant selector and the vision-message builder to the registry.

**Files:**
- Create: `apps/backend/src/prompts/image-generator.v4-no-asset.ts`
- Create: `apps/backend/src/prompts/image-generator.v4-w-asset.ts`
- Modify: `apps/backend/src/prompts/registry.ts`
- Modify: `apps/backend/tests/prompts.test.ts`

- [ ] **Step 1: Create `apps/backend/src/prompts/image-generator.v4-no-asset.ts`**

**Copy the entire contents of `docs/extra files/Image Generator v4 NO Asset.txt` verbatim** between the backticks (it begins with `You are a senior brand designer and ad-reproduction specialist.` and ends with `Return only valid JSON.`). The source contains no backtick or `${`, so a plain template literal is safe.

```ts
export const IMAGE_GENERATOR_V4_NO_ASSET = `You are a senior brand designer and ad-reproduction specialist. Your craft is taking an existing ad and rebuilding it identically for a different brand.

<… paste the full verbatim text of docs/extra files/Image Generator v4 NO Asset.txt here …>

Return only valid JSON.`;
```

- [ ] **Step 2: Create `apps/backend/src/prompts/image-generator.v4-w-asset.ts`**

**Copy the entire contents of `docs/extra files/Image Generator v4 w Asset.txt` verbatim** (same begin anchor; ends with `Return only valid JSON.`).

```ts
export const IMAGE_GENERATOR_V4_W_ASSET = `You are a senior brand designer and ad-reproduction specialist. Your craft is taking an existing ad and rebuilding it identically for a different brand.

<… paste the full verbatim text of docs/extra files/Image Generator v4 w Asset.txt here …>

Return only valid JSON.`;
```

- [ ] **Step 3: Write the failing test**

Append to `apps/backend/tests/prompts.test.ts` (add the new imports at the top alongside the existing registry import):

```ts
import { getStage2Prompt, buildStage2Content } from "../src/prompts/registry.js";
import type { BrandExtraction } from "@bya/shared";

const brand: BrandExtraction = { brand_identity: { brand_name: "Acme" }, schema_version: 1 };
const REF = "data:image/png;base64,REF";
const LOGO = "data:image/png;base64,LOGO";
const ASSET = "data:image/png;base64,ASSET";

describe("getStage2Prompt", () => {
  it("selects the no-asset variant when there is no product asset", () => {
    const p = getStage2Prompt(false);
    expect(p).toContain("abstractly and iconically");
    expect(p).not.toContain("PRODUCT_VISUAL_IMAGE");
  });

  it("selects the w-asset variant when a product asset is present", () => {
    expect(getStage2Prompt(true)).toContain("PRODUCT_VISUAL_IMAGE");
  });
});

describe("buildStage2Content", () => {
  it("grounds the prompt and attaches reference + logo images in order (no product asset)", () => {
    const parts = buildStage2Content({ brandExtraction: brand, referenceAdImage: REF, logoImage: LOGO });
    expect(parts[0].type).toBe("text");
    const text = (parts[0] as { type: "text"; text: string }).text;
    expect(text).toContain("BRAND_EXTRACTION_JSON");
    expect(text).toContain("Acme");
    expect(parts).toHaveLength(3); // text + reference + logo
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: REF } });
    expect(parts[2]).toEqual({ type: "image_url", image_url: { url: LOGO } });
  });

  it("appends the product asset image and uses the w-asset prompt when provided", () => {
    const parts = buildStage2Content({ brandExtraction: brand, referenceAdImage: REF, logoImage: LOGO, productAsset: ASSET });
    expect(parts).toHaveLength(4);
    expect(parts[3]).toEqual({ type: "image_url", image_url: { url: ASSET } });
    expect((parts[0] as { type: "text"; text: string }).text).toContain("PRODUCT_VISUAL_IMAGE");
  });

  it("threads optional inputs into the text only when present", () => {
    const without = buildStage2Content({ brandExtraction: brand, referenceAdImage: REF, logoImage: LOGO });
    expect((without[0] as { type: "text"; text: string }).text).not.toContain("OPTIONAL_CUSTOMER_RESEARCH_JSON");
    const withOpts = buildStage2Content({
      brandExtraction: brand,
      referenceAdImage: REF,
      logoImage: LOGO,
      customerResearch: { pains: ["slow"] },
      userDirection: "promote the free trial",
    });
    const text = (withOpts[0] as { type: "text"; text: string }).text;
    expect(text).toContain("OPTIONAL_CUSTOMER_RESEARCH_JSON");
    expect(text).toContain("slow");
    expect(text).toContain("OPTIONAL_USER_DIRECTION");
    expect(text).toContain("promote the free trial");
    expect(text).not.toContain("OPTIONAL_PERFORMANCE_MEMORY_JSON");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- prompts`
Expected: FAIL — `getStage2Prompt`/`buildStage2Content` are not exported from the registry.

- [ ] **Step 5: Add the helpers to `apps/backend/src/prompts/registry.ts`**

Add these imports at the top (alongside the existing imports):

```ts
import { IMAGE_GENERATOR_V4_NO_ASSET } from "./image-generator.v4-no-asset.js";
import { IMAGE_GENERATOR_V4_W_ASSET } from "./image-generator.v4-w-asset.js";
import type { ContentPart } from "../services/openrouter.js";
import type { BrandExtraction } from "@bya/shared";
```

Append at the end of the file:

```ts
/** Stage-2 variant selection is driven purely by product-asset presence. */
export function getStage2Prompt(hasProductAsset: boolean): string {
  return hasProductAsset ? IMAGE_GENERATOR_V4_W_ASSET : IMAGE_GENERATOR_V4_NO_ASSET;
}

export type Stage2Inputs = {
  brandExtraction: BrandExtraction;
  referenceAdImage: string;
  logoImage: string;
  productAsset?: string;
  customerResearch?: unknown;
  performanceMemory?: unknown;
  userDirection?: unknown;
};

/** Assemble the Stage-2 vision user message: grounded prompt text + attached images
 *  (reference ad → brand logo → optional product asset), each labeled in the text. */
export function buildStage2Content(inputs: Stage2Inputs): ContentPart[] {
  const hasProductAsset = Boolean(inputs.productAsset);
  let text =
    getStage2Prompt(hasProductAsset) +
    "\n\n=== BRAND_EXTRACTION_JSON ===\n" +
    JSON.stringify(inputs.brandExtraction, null, 2) +
    "\n\n=== REFERENCE_AD_IMAGE ===\nThe first attached image is the REFERENCE_AD_IMAGE. Analyze it and reproduce its layout, composition, and element positions faithfully." +
    "\n\n=== BRAND_LOGO_IMAGE ===\nThe second attached image is the BRAND_LOGO_IMAGE. Use it exactly as provided; do not redraw, restyle, or recolor it.";
  if (hasProductAsset) {
    text +=
      "\n\n=== PRODUCT_VISUAL_IMAGE ===\nThe third attached image is the PRODUCT_VISUAL_IMAGE (a real product/UI asset). Use it exactly as provided; do not redraw, edit, or fabricate UI.";
  }
  if (inputs.customerResearch !== undefined) {
    text += "\n\n=== OPTIONAL_CUSTOMER_RESEARCH_JSON ===\n" + JSON.stringify(inputs.customerResearch, null, 2);
  }
  if (inputs.performanceMemory !== undefined) {
    text += "\n\n=== OPTIONAL_PERFORMANCE_MEMORY_JSON ===\n" + JSON.stringify(inputs.performanceMemory, null, 2);
  }
  if (inputs.userDirection !== undefined) {
    text +=
      "\n\n=== OPTIONAL_USER_DIRECTION ===\n" +
      (typeof inputs.userDirection === "string" ? inputs.userDirection : JSON.stringify(inputs.userDirection, null, 2));
  }

  const parts: ContentPart[] = [
    { type: "text", text },
    { type: "image_url", image_url: { url: inputs.referenceAdImage } },
    { type: "image_url", image_url: { url: inputs.logoImage } },
  ];
  if (inputs.productAsset) parts.push({ type: "image_url", image_url: { url: inputs.productAsset } });
  return parts;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- prompts`
Expected: PASS (existing Stage-1 tests + the new Stage-2 ones).

- [ ] **Step 7: Commit + push**

```bash
git add apps/backend/src/prompts/image-generator.v4-no-asset.ts apps/backend/src/prompts/image-generator.v4-w-asset.ts apps/backend/src/prompts/registry.ts apps/backend/tests/prompts.test.ts
git commit -m "feat(backend): Stage-2 v4 prompt modules + registry vision-message builder

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: Ad-prompt pipeline (`runAdPrompt`)

Validates the request, builds the grounded vision message, makes a **single** Stage-2 call (`:online` OFF), and runs the LLM-JSON guard: parse → validate against `AdPrompt` requiring `ad_prompt` → **one repair retry** on failure → else typed `ValidationError` with the raw output logged. Stamps `schema_version`. An upstream `chat` failure (`OpenRouterError`) propagates unchanged (route maps it to 502). The test mocks the OpenRouter service; the real prompt builder runs unchanged.

**Files:**
- Create: `apps/backend/src/pipelines/ad-prompt.ts`
- Create: `apps/backend/tests/ad-prompt.pipeline.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/ad-prompt.pipeline.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runAdPrompt } from "../src/pipelines/ad-prompt.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";

const brandExtraction = { brand_identity: { brand_name: "Acme" }, schema_version: 1 };
const REF = "data:image/png;base64,REF";
const LOGO = "data:image/png;base64,LOGO";
const ASSET = "data:image/png;base64,ASSET";

const validAd = {
  reference_ad_analysis: { aspect_ratio: "1:1" },
  reskin_map: { target_brand: "Acme" },
  ad_prompt: { goal: "promote", canvas: { aspect_ratio: "1:1" } },
};

/** Pull the assembled user-message text out of the (mocked) chat call. */
function lastText(callIndex = 0): string {
  const args = vi.mocked(chat).mock.calls[callIndex][0];
  const part = (args.messages[0].content as { type: string; text?: string }[])[0];
  return part.text ?? "";
}
function lastContent(callIndex = 0) {
  return vi.mocked(chat).mock.calls[callIndex][0].messages[0].content as unknown[];
}

beforeEach(() => vi.resetAllMocks());

describe("runAdPrompt", () => {
  it("rejects a malformed request before calling the model", async () => {
    await expect(
      runAdPrompt({ brandExtraction, referenceAdImage: REF } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("returns a validated AdPrompt with schema_version stamped", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify(validAd));
    const out = await runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO });
    expect(out.ad_prompt?.canvas?.aspect_ratio).toBe("1:1");
    expect(out.reskin_map).toBeTruthy();
    expect(out.schema_version).toBe(1);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("selects the w-asset variant and attaches the product image when productAsset is present", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify(validAd));
    await runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO, productAsset: ASSET });
    expect(lastText()).toContain("PRODUCT_VISUAL_IMAGE");
    expect(lastContent()).toHaveLength(4); // text + ref + logo + asset
  });

  it("threads optional inputs into the prompt when present", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify(validAd));
    await runAdPrompt({
      brandExtraction,
      referenceAdImage: REF,
      logoImage: LOGO,
      userDirection: "promote the free trial",
    });
    expect(lastText()).toContain("OPTIONAL_USER_DIRECTION");
    expect(lastText()).toContain("promote the free trial");
  });

  it("repairs a first-try non-JSON reply on the second attempt", async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce("Sure! Here is your ad:")
      .mockResolvedValueOnce(JSON.stringify(validAd));
    const out = await runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO });
    expect(out.ad_prompt).toBeTruthy();
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("throws ValidationError when JSON lacks ad_prompt twice", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({ reference_ad_analysis: {}, reskin_map: {} }));
    await expect(runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("propagates an upstream OpenRouterError", async () => {
    vi.mocked(chat).mockRejectedValue(new OpenRouterError("upstream down", "ad-prompt"));
    await expect(runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- ad-prompt.pipeline`
Expected: FAIL — cannot find module `../src/pipelines/ad-prompt.js`.

- [ ] **Step 3: Create `apps/backend/src/pipelines/ad-prompt.ts`**

```ts
import { AdPrompt, AdPromptRequest } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildStage2Content } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const SCHEMA_VERSION = 1;

export type AdPromptInput = {
  brandExtraction: unknown;
  referenceAdImage: unknown;
  logoImage: unknown;
  productAsset?: unknown;
  customerResearch?: unknown;
  performanceMemory?: unknown;
  userDirection?: unknown;
};

export async function runAdPrompt(input: AdPromptInput): Promise<AdPrompt> {
  const parsed = AdPromptRequest.safeParse(input);
  if (!parsed.success) throw new ValidationError("ad-prompt request is missing or malformed.");
  const req = parsed.data;

  const model = loadConfig().stage2Model;
  const messages: ChatMessage[] = [{ role: "user", content: buildStage2Content(req) }];

  const first = await chat({ model, messages, stage: "ad-prompt" });
  let result = parseAdPrompt(first);
  if (!result) {
    const repairMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON. Return ONLY a JSON object with reference_ad_analysis, " +
          "reskin_map, and ad_prompt — no prose, no markdown fences, no commentary.",
      },
    ];
    const second = await chat({ model, messages: repairMessages, stage: "ad-prompt" });
    result = parseAdPrompt(second);
    if (!result) {
      console.error("[ad-prompt] model returned invalid JSON twice. Last output (truncated):\n", second.slice(0, 1000));
      throw new ValidationError("Ad-prompt generation returned an unexpected shape.");
    }
  }
  return { ...result, schema_version: SCHEMA_VERSION };
}

/** Parse + validate a Stage-2 reply into an AdPrompt that has a usable `ad_prompt`, or null. */
function parseAdPrompt(content: string): AdPrompt | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  const v = AdPrompt.safeParse(obj);
  if (!v.success || !v.data.ad_prompt) return null;
  return v.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- ad-prompt.pipeline`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/pipelines/ad-prompt.ts apps/backend/tests/ad-prompt.pipeline.test.ts
git commit -m "feat(backend): ad-prompt pipeline — single Stage-2 vision call + repair guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: Route (`POST /api/ad-prompt`) + wiring

**Files:**
- Create: `apps/backend/src/routes/ad-prompt.ts`
- Modify: `apps/backend/src/server.ts`
- Create: `apps/backend/tests/ad-prompt.routes.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/ad-prompt.routes.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/ad-prompt.js", () => ({ runAdPrompt: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { runAdPrompt } from "../src/pipelines/ad-prompt.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const body = {
  brandExtraction: { brand_identity: { brand_name: "Acme" } },
  referenceAdImage: "data:image/png;base64,REF",
  logoImage: "data:image/png;base64,LOGO",
};

describe("POST /api/ad-prompt", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/ad-prompt").send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runAdPrompt).not.toHaveBeenCalled();
  });

  it("returns 200 with { adPrompt } for an approved user", async () => {
    approve();
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.adPrompt.ad_prompt.goal).toBe("x");
  });

  it("maps ValidationError to 422", async () => {
    approve();
    vi.mocked(runAdPrompt).mockRejectedValue(new ValidationError("bad input"));
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps OpenRouterError to 502 with stage ad-prompt", async () => {
    approve();
    vi.mocked(runAdPrompt).mockRejectedValue(new OpenRouterError("upstream down", "ad-prompt"));
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("OPENROUTER_ERROR");
    expect(res.body.error.stage).toBe("ad-prompt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- ad-prompt.routes`
Expected: FAIL — cannot find module `../src/routes/ad-prompt.js`.

- [ ] **Step 3: Create `apps/backend/src/routes/ad-prompt.ts`**

```ts
import { Router } from "express";
import { runAdPrompt } from "../pipelines/ad-prompt.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";

export const adPromptRouter = Router();

adPromptRouter.post("/ad-prompt", requireApprovedUser, async (req, res) => {
  try {
    const adPrompt = await runAdPrompt({
      brandExtraction: req.body?.brandExtraction,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
      customerResearch: req.body?.customerResearch,
      performanceMemory: req.body?.performanceMemory,
      userDirection: req.body?.userDirection,
    });
    res.json({ adPrompt });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Wire the router into `apps/backend/src/server.ts`**

Add the import alongside the others and mount it under `/api` (after `app.use("/api", brandRouter);`):

```ts
import { adPromptRouter } from "./routes/ad-prompt.js";
```

```ts
  app.use("/api", adPromptRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- ad-prompt.routes`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite + type-check**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the three e2e suites (extract, brand, ad-prompt) show as skipped.
Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit + push**

```bash
git add apps/backend/src/routes/ad-prompt.ts apps/backend/src/server.ts apps/backend/tests/ad-prompt.routes.test.ts
git commit -m "feat(backend): POST /api/ad-prompt route + wiring (gated)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: Manual run script (`run-ad-prompt.ts`)

Exercises the real Stage-2 call from local files: a brand JSON + a reference ad image + a logo (+ optional product asset). Requires `OPENROUTER_API_KEY` + `STAGE2_MODEL` in the root `.env`.

**Files:**
- Create: `apps/backend/scripts/run-ad-prompt.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Add the script to `apps/backend/package.json`**

Add to `"scripts"` (after `"run:brand"`):

```json
    "run:ad-prompt": "tsx scripts/run-ad-prompt.ts",
```

- [ ] **Step 2: Create `apps/backend/scripts/run-ad-prompt.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runAdPrompt } from "../src/pipelines/ad-prompt.js";

loadEnvFile(process.cwd());

const [brandPath, refPath, logoPath, assetPath] = process.argv.slice(2);
if (!brandPath || !refPath || !logoPath) {
  console.error(
    "Usage: npm --workspace @bya/backend run run:ad-prompt -- <brand.json> <reference-ad.(png|jpg)> <logo.(png|jpg)> [product-asset.(png|jpg)]",
  );
  process.exit(1);
}

function toDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

(async () => {
  try {
    const brandExtraction = JSON.parse(fs.readFileSync(brandPath, "utf8"));
    const adPrompt = await runAdPrompt({
      brandExtraction,
      referenceAdImage: toDataUrl(refPath),
      logoImage: toDataUrl(logoPath),
      productAsset: assetPath ? toDataUrl(assetPath) : undefined,
    });
    console.log("schema_version:", adPrompt.schema_version);
    console.log("top-level keys:", Object.keys(adPrompt));
    console.log("ad_prompt.canvas.aspect_ratio:", adPrompt.ad_prompt?.canvas?.aspect_ratio);
    console.log(JSON.stringify(adPrompt, null, 2).slice(0, 2000));
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
```

- [ ] **Step 3: Run it against real inputs (if available)**

This needs a reference ad image + a logo file (external inputs a user supplies). If sample images are available, run e.g.:
`npm --workspace @bya/backend run run:ad-prompt -- ./sample-brand.json ./reference-ad.png ./logo.png`
(real OpenRouter Stage-2 vision call — can take 30–90s; use a generous timeout). Expected: prints `schema_version: 1`, top-level keys including `reference_ad_analysis`/`reskin_map`/`ad_prompt`, and an `aspect_ratio`.
If no sample reference-ad/logo images are available in this environment, this is a verification-input gap, **not a code defect** — report DONE_WITH_CONCERNS (the mocked unit tests + gated e2e cover the logic), same convention as Plan 2's network/key path.

- [ ] **Step 4: Commit + push**

```bash
git add apps/backend/scripts/run-ad-prompt.ts apps/backend/package.json
git commit -m "chore(backend): manual run script for ad-prompt pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Gated real e2e smoke

Skipped unless `BYA_E2E=1` **and** both `BYA_REF_AD_PATH` + `BYA_LOGO_PATH` point to real image files — so the default suite stays fast, offline, and cost-free.

**Files:**
- Create: `apps/backend/tests/ad-prompt.e2e.test.ts`

- [ ] **Step 1: Create `apps/backend/tests/ad-prompt.e2e.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runAdPrompt } from "../src/pipelines/ad-prompt.js";

loadEnvFile(process.cwd());

const ref = process.env.BYA_REF_AD_PATH;
const logo = process.env.BYA_LOGO_PATH;
const enabled = process.env.BYA_E2E === "1" && Boolean(ref) && Boolean(logo) && Boolean(process.env.OPENROUTER_API_KEY);
const run = enabled ? describe : describe.skip;

function toDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

run("ad-prompt e2e (real OpenRouter vision)", () => {
  it("produces an AdPrompt from a reference ad + logo", async () => {
    const adPrompt = await runAdPrompt({
      brandExtraction: { brand_identity: { brand_name: "Acme", category: "SaaS" } },
      referenceAdImage: toDataUrl(ref!),
      logoImage: toDataUrl(logo!),
    });
    expect(adPrompt.schema_version).toBe(1);
    expect(adPrompt.ad_prompt).toBeTruthy();
  }, 180_000);
});
```

- [ ] **Step 2: Verify it is skipped in the normal run**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the ad-prompt e2e suite shows as skipped (alongside extract + brand e2e). Capture totals incl. skipped count.

- [ ] **Step 3: (Optional) Verify when enabled (requires real images + key)**

Run (PowerShell): `$env:BYA_E2E=1; $env:BYA_REF_AD_PATH="<path>"; $env:BYA_LOGO_PATH="<path>"; npm --workspace @bya/backend run test -- ad-prompt.e2e; Remove-Item Env:BYA_E2E,Env:BYA_REF_AD_PATH,Env:BYA_LOGO_PATH`
Expected: PASS (1 test). If sample images are unavailable, the suite stays skipped — report that distinctly (not a code failure).

- [ ] **Step 4: Commit + push**

```bash
git add apps/backend/tests/ad-prompt.e2e.test.ts
git commit -m "test(backend): gated real e2e smoke for ad-prompt pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Self-Review

**Spec coverage:**
- `POST /api/ad-prompt` → `{ adPrompt }`, gated — Tasks 5 (+ persistence/`id` deferred to Plan 5). ✓
- Tolerant, versioned `AdPrompt` + `AdPromptRequest` in `packages/shared` — Task 1. ✓
- Multimodal vision via OpenRouter (`chat` content array) — Task 2. ✓
- Two v4 prompt variants + variant selection by `productAsset` presence — Tasks 3, 4. ✓
- Logo attached at Stage 2; images ordered reference → logo → [asset], labeled — Task 3. ✓
- Optional inputs threaded only when present — Tasks 3, 4. ✓
- `:online` OFF for Stage 2 (no `online` flag passed in the pipeline `chat` calls) — Task 4. ✓
- LLM-JSON guard: parse → validate (require `ad_prompt`) → one repair retry → typed `ValidationError`, raw logged — Task 4. ✓
- `OpenRouterError` (stage `ad-prompt`) → 502; `ValidationError` → 422; auth → 401/403 — Tasks 4, 5. ✓
- Model config-driven (`stage2Model`); no `errors.ts`/`config` change needed — Tasks 4 (uses existing). ✓
- Verification: run script + mocked unit/route tests + gated real e2e — Tasks 4, 5, 6, 7. ✓

**Type consistency:** `AdPrompt`/`AdPromptRequest` (shared, Task 1) are used by the pipeline (Task 4), route response (Task 5), run script (Task 6), e2e (Task 7). `ContentPart` (Task 2) is produced by `buildStage2Content` (Task 3) and consumed by the pipeline's `ChatMessage` (Task 4). `Stage2Inputs` (Task 3) matches the validated `AdPromptRequest` fields the pipeline passes. `getStage2Prompt(hasProductAsset)` (Task 3) is called inside `buildStage2Content` (Task 3) and asserted in the prompts test. `runAdPrompt(AdPromptInput)` has the same shape at pipeline (Task 4), route (Task 5), and scripts (Tasks 6, 7).

**Placeholders:** none for code. The two "paste verbatim" steps (Task 3) name the exact source files and the precise begin/end anchors (`You are a senior brand designer…` → `Return only valid JSON.`).

**Design notes carried forward:**
- The tolerant schema means the guard's teeth are "parseable + has `ad_prompt`". Intentional (tolerant for drift/old rows); the `ad_prompt` floor is the real gate, mirroring Stage-1's `brand_identity` floor.
- Logo is threaded at Stage 2 (master spec lists it as a Stage-2 input; legacy attached it only at render). Strictly more grounding; the request must carry it for Plan 4 regardless.
