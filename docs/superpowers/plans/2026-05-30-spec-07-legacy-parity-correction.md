# Spec #7 — Legacy Parity Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the new app back to legacy look + behavior (rail, Home = concept board, logo auto-capture, brand-DNA strip) and fix the live VOC bug by porting `researchCustomers` into our stack so `external_voc` is actually produced — without removing any Spec #1–#6 feature.

**Architecture:** Backend = one new best-effort pipeline (`runCustomerResearch`) called in `POST /brand` after Stage 1, attaching `external_voc` onto the BrandExtraction before it's persisted into the existing `analysis` JSONB column (no migration). Frontend = realign the Next.js App Router screens to legacy markup that already shares the same CSS tokens/classes.

**Tech Stack:** TypeScript, Express, Zod, Vitest (backend); Next.js App Router, React, React Testing Library + Vitest (web).

**Source of truth for parity:** `legacy/app.html` + `legacy/bya-pipeline.js`.

---

## File Structure

**Backend (Part B — VOC):**
- Create `apps/backend/src/prompts/customer-research.v1.ts` — the legacy "market researcher" prompt builder.
- Create `apps/backend/src/pipelines/customer-research.ts` — `runCustomerResearch(analysis)`, best-effort, returns VOC or null.
- Modify `packages/shared/src/brand-extraction.ts` — add `ExternalVoc` schema + `external_voc` optional field.
- Modify `apps/backend/src/routes/brand.ts` — run VOC after `runBrand`, attach, persist.
- Tests: `apps/backend/tests/customer-research.pipeline.test.ts`, extend `apps/backend/tests/brand.route.test.ts` (or create if absent).

**Frontend (Part A — parity):**
- Modify `apps/web/src/shell/AppShell.tsx` — drop "Workspace" header, PNG logo, legacy nav items. + `AppShell.test.tsx`.
- Modify `apps/web/src/home/Home.tsx` — render the concept board for the most-recent brand (or onboarding empty state). + `Home.test.tsx`.
- Create `apps/web/src/lib/deriveLogo.ts` — port of legacy `deriveLogoFromUrls`. + test.
- Modify `apps/web/src/onboarding/Onboarding.tsx` — after extract, best-effort auto-capture logo → `saveBrandLogo`.
- Modify `apps/web/src/board/Board.tsx` — add the brand-DNA strip (port `brandDnaHTML`). + extend `Board.test.tsx`.

**Deliverables / cleanup:**
- Create `docs/PIPELINE.md`.
- Create `docs/superpowers/manual-checks/spec-07-legacy-parity.md` + append to `docs/superpowers/MANUAL-CHECKS.md`.
- Remove superseded code surfaced at the end; list it.

---

## Part B — VOC pipeline (fixes the live bug)

### Task 1: `ExternalVoc` schema in shared

**Files:**
- Modify: `packages/shared/src/brand-extraction.ts` (add schema + field near the bottom `BrandExtraction` object, ~line 222)
- Test: `packages/shared/src/brand-extraction.test.ts` (create if absent)

- [ ] **Step 1: Write failing test**

```ts
// packages/shared/src/brand-extraction.test.ts
import { describe, it, expect } from "vitest";
import { BrandExtraction, ExternalVoc } from "./brand-extraction.js";

describe("ExternalVoc", () => {
  it("accepts the legacy VOC shape", () => {
    const voc = {
      top_complaints: ["slow onboarding"], recurring_phrases: ["set it up in minutes"],
      desired_outcomes: ["save time"], objections: ["too expensive"],
      switching_triggers: ["outgrew spreadsheets"], competitor_gripes: ["X is clunky"],
      sources: ["reddit.com/r/saas"],
    };
    expect(ExternalVoc.safeParse(voc).success).toBe(true);
  });

  it("BrandExtraction carries external_voc through", () => {
    const parsed = BrandExtraction.safeParse({
      brand_identity: { brand_name: "Chirp" },
      external_voc: { top_complaints: ["x"] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as any).external_voc?.top_complaints).toEqual(["x"]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`ExternalVoc` is not exported)

Run: `npm test -w @bya/shared -- brand-extraction`
Expected: FAIL — `ExternalVoc` undefined.

- [ ] **Step 3: Implement**

Add to `packages/shared/src/brand-extraction.ts` (above the `BrandExtraction` object). Reuse the file's existing `strList` helper if present; otherwise use `z.array(z.string())`.

```ts
export const ExternalVoc = z
  .object({
    top_complaints: z.array(z.string()).optional(),
    recurring_phrases: z.array(z.string()).optional(),
    desired_outcomes: z.array(z.string()).optional(),
    objections: z.array(z.string()).optional(),
    switching_triggers: z.array(z.string()).optional(),
    competitor_gripes: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional(),
  })
  .passthrough();
export type ExternalVoc = z.infer<typeof ExternalVoc>;
```

Then add to the `BrandExtraction` object (alongside `customer_dna_from_website`):

```ts
    external_voc: ExternalVoc.optional(),
```

Ensure both are exported from the package index if the package uses an explicit barrel (`packages/shared/src/index.ts`) — add `ExternalVoc` there if other types are re-exported.

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -w @bya/shared -- brand-extraction`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/brand-extraction.ts packages/shared/src/brand-extraction.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ExternalVoc schema + external_voc on BrandExtraction"
```

---

### Task 2: Customer-research prompt builder

**Files:**
- Create: `apps/backend/src/prompts/customer-research.v1.ts`

Port the legacy prompt verbatim (`legacy/bya-pipeline.js:338–358`), parameterized.

- [ ] **Step 1: Implement** (no separate unit test; covered via Task 3 pipeline test)

```ts
// apps/backend/src/prompts/customer-research.v1.ts
export function buildCustomerResearchPrompt(args: {
  brandContext: { brand: string; positioning: string; customer_segments: unknown[] };
  researchTargets: {
    recommended_subreddits: unknown[];
    review_sites: unknown[];
    communities: unknown[];
    search_queries: unknown[];
    competitor_review_targets: unknown[];
    what_to_extract: unknown[];
  };
}): string {
  return (
    "You are a senior B2B SaaS market researcher. Using web search, find what REAL prospective " +
    "customers of this product actually say, complain about, and want — in their own words — " +
    "across the sources below. Do NOT invent quotes; report only what you actually find. " +
    "If a source yields nothing, omit it.\n\n" +
    "BRAND CONTEXT (so you research the right audience):\n" +
    JSON.stringify(args.brandContext, null, 2) + "\n\n" +
    "RESEARCH TARGETS (where to look):\n" +
    JSON.stringify(args.researchTargets, null, 2) + "\n\n" +
    "Extract recurring complaints, the exact phrases people use, desired outcomes, objections/" +
    "hesitations, what makes people switch from alternatives, and gripes about competitors. " +
    "Prefer concrete, quotable language over summaries.\n\n" +
    "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
    "{ \"top_complaints\": [], \"recurring_phrases\": [], \"desired_outcomes\": [], " +
    "\"objections\": [], \"switching_triggers\": [], \"competitor_gripes\": [], \"sources\": [] }\n" +
    "Keep each array to the most salient 5–10 items."
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/prompts/customer-research.v1.ts
git commit -m "feat(backend): customer-research (VOC) prompt builder (ported from legacy)"
```

---

### Task 3: `runCustomerResearch` pipeline (best-effort)

**Files:**
- Create: `apps/backend/src/pipelines/customer-research.ts`
- Test: `apps/backend/tests/customer-research.pipeline.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/backend/tests/customer-research.pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const chatMock = vi.fn();
vi.mock("../src/services/openrouter.js", () => ({ chat: (...a: unknown[]) => chatMock(...a) }));
vi.mock("../src/config/index.js", () => ({ loadConfig: () => ({ stage1Model: "test/model" }) }));

import { runCustomerResearch } from "../src/pipelines/customer-research.js";

beforeEach(() => chatMock.mockReset());

const analysis = {
  brand_identity: { brand_name: "Chirp", positioning: "the friendly CRM" },
  messaging_foundation: { customer_segments: ["founders"] },
  external_customer_research_plan: { search_queries: ["chirp crm reviews"] },
} as any;

describe("runCustomerResearch", () => {
  it("returns the parsed VOC object on success", async () => {
    chatMock.mockResolvedValue(JSON.stringify({ top_complaints: ["slow"], sources: ["reddit"] }));
    const voc = await runCustomerResearch(analysis);
    expect(voc?.top_complaints).toEqual(["slow"]);
    // called online with the stage-1 model
    expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({ online: true, model: "test/model" }));
  });

  it("returns null when the model errors (best-effort)", async () => {
    chatMock.mockRejectedValue(new Error("upstream 500"));
    expect(await runCustomerResearch(analysis)).toBeNull();
  });

  it("returns null when the model returns non-JSON", async () => {
    chatMock.mockResolvedValue("here are some thoughts, not json");
    expect(await runCustomerResearch(analysis)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -w @bya/backend -- customer-research`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/pipelines/customer-research.ts
import type { BrandExtraction, ExternalVoc } from "@bya/shared";
import { chat } from "../services/openrouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { loadConfig } from "../config/index.js";
import { buildCustomerResearchPrompt } from "../prompts/customer-research.v1.js";

/** Voice-of-customer web-search pass (ported from legacy researchCustomers).
 *  Best-effort: any failure returns null and the caller leaves external_voc unset. */
export async function runCustomerResearch(analysis: BrandExtraction): Promise<ExternalVoc | null> {
  const raw = analysis as Record<string, unknown>;
  const identity = isObj(raw.brand_identity) ? raw.brand_identity : {};
  const messaging = isObj(raw.messaging_foundation) ? raw.messaging_foundation : {};
  const plan = isObj(raw.external_customer_research_plan) ? raw.external_customer_research_plan : {};

  const prompt = buildCustomerResearchPrompt({
    brandContext: {
      brand: str(identity.brand_name) || str((identity as Record<string, unknown>).name),
      positioning: str(identity.positioning) || str((identity as Record<string, unknown>).tagline),
      customer_segments: arr(messaging.customer_segments),
    },
    researchTargets: {
      recommended_subreddits: arr(plan.recommended_subreddits),
      review_sites: arr(plan.review_sites),
      communities: arr(plan.communities),
      search_queries: arr(plan.search_queries),
      competitor_review_targets: arr(plan.competitor_review_targets),
      what_to_extract: arr(plan.what_to_extract),
    },
  });

  try {
    const out = await chat({
      model: loadConfig().stage1Model,
      messages: [{ role: "user", content: prompt }],
      online: true,
      stage: "brand",
    });
    const parsed = parseJsonLoose(out);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    return {
      top_complaints: arr(p.top_complaints) as string[],
      recurring_phrases: arr(p.recurring_phrases) as string[],
      desired_outcomes: arr(p.desired_outcomes) as string[],
      objections: arr(p.objections) as string[],
      switching_triggers: arr(p.switching_triggers) as string[],
      competitor_gripes: arr(p.competitor_gripes) as string[],
      sources: arr(p.sources) as string[],
    };
  } catch {
    return null;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -w @bya/backend -- customer-research`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/pipelines/customer-research.ts apps/backend/tests/customer-research.pipeline.test.ts
git commit -m "feat(backend): runCustomerResearch VOC pipeline (best-effort, online)"
```

---

### Task 4: Wire VOC into `POST /brand`

**Files:**
- Modify: `apps/backend/src/routes/brand.ts` (the POST handler, ~lines 16–34)
- Test: `apps/backend/tests/brand.route.test.ts` (extend; create if absent)

- [ ] **Step 1: Write failing test** — VOC is attached + persisted, and a VOC failure doesn't break brand creation.

```ts
// apps/backend/tests/brand.route.test.ts  (add to existing suite, or create)
import { describe, it, expect, vi, beforeEach } from "vitest";

const runBrandMock = vi.fn();
const runVocMock = vi.fn();
const saveMock = vi.fn();
vi.mock("../src/pipelines/brand.js", () => ({ runBrand: (...a: unknown[]) => runBrandMock(...a) }));
vi.mock("../src/pipelines/customer-research.js", () => ({ runCustomerResearch: (...a: unknown[]) => runVocMock(...a) }));
vi.mock("../src/services/supabase.js", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, saveBrandExtraction: (...a: unknown[]) => saveMock(...a) };
});
// (reuse the suite's existing auth/request harness; pseudo-helper postBrand below)

beforeEach(() => { runBrandMock.mockReset(); runVocMock.mockReset(); saveMock.mockReset(); saveMock.mockResolvedValue({ id: "b1" }); });

describe("POST /brand — VOC wiring", () => {
  it("attaches external_voc onto the persisted analysis", async () => {
    runBrandMock.mockResolvedValue({ brand_identity: { brand_name: "Chirp" } });
    runVocMock.mockResolvedValue({ top_complaints: ["slow"] });
    await postBrand({ url: "https://chirp.com", measuredSiteData: {} });
    const saved = saveMock.mock.calls[0][0];
    expect(saved.brandExtraction.external_voc).toEqual({ top_complaints: ["slow"] });
  });

  it("still persists when VOC returns null (best-effort)", async () => {
    runBrandMock.mockResolvedValue({ brand_identity: { brand_name: "Chirp" } });
    runVocMock.mockResolvedValue(null);
    await postBrand({ url: "https://chirp.com", measuredSiteData: {} });
    const saved = saveMock.mock.calls[0][0];
    expect(saved.brandExtraction.external_voc).toBeUndefined();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
```

> Note for the implementer: match the existing `brand.route.test.ts` harness (supertest app or direct handler call). If no such test file exists, create a minimal supertest harness mirroring `concept-board.route.test.ts`.

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -w @bya/backend -- brand.route`
Expected: FAIL — `external_voc` not attached.

- [ ] **Step 3: Implement** — in `apps/backend/src/routes/brand.ts`, between `runBrand` and `saveBrandExtraction`:

```ts
import { runCustomerResearch } from "../pipelines/customer-research.js";
// ...
const brandExtraction = await runBrand({ url, measuredSiteData });

// VOC: lazy + best-effort. Only when absent (always at fresh creation); a failure leaves it unset.
if (!brandExtraction.external_voc) {
  const voc = await runCustomerResearch(brandExtraction);
  if (voc) brandExtraction.external_voc = voc;
}

const { id } = await saveBrandExtraction({ userId: req.user!.id, url, brandExtraction, measuredSiteData });
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -w @bya/backend -- brand.route`
Expected: PASS.

- [ ] **Step 5: Full backend suite + commit**

Run: `npm test -w @bya/backend`
Expected: PASS (no regressions).

```bash
git add apps/backend/src/routes/brand.ts apps/backend/tests/brand.route.test.ts
git commit -m "feat(backend): run VOC research in POST /brand and persist external_voc"
```

---

## Part A — Frontend legacy parity

### Task 5: Rail — drop "Workspace", PNG logo, legacy items

**Files:**
- Modify: `apps/web/src/shell/AppShell.tsx` (lines 80–123)
- Test: `apps/web/src/shell/AppShell.test.tsx`

Legacy reference (`legacy/app.html:343–366`): one **headerless** nav section with `home · make an ad · my ads · brands · add client`, brand mark is `<img src="assets/logo-mark.png">`.

- [ ] **Step 1: Update test** — assert no "Workspace" text and that the logo is an `<img>`.

```tsx
// in AppShell.test.tsx
it("renders the legacy rail: no Workspace header, img logo", () => {
  render(<AppShell>{<div>child</div>}</AppShell>);
  expect(screen.queryByText(/workspace/i)).toBeNull();
  expect(screen.getByRole("link", { name: /betteryourads/i }).querySelector("img")).toBeTruthy();
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -w @bya/web -- AppShell`
Expected: FAIL (Workspace header still present).

- [ ] **Step 3: Implement** — in `AppShell.tsx`:
  - Replace the `<svg className="mark">…</svg>` (lines 82–86) with `<img className="mark" src="/logo-mark.png" alt="" width={28} height={28} />`.
  - Remove `<h6>Workspace</h6>` (line 91). Keep the nav-section wrapper but headerless.
  - Reorder items to legacy: **Home**, **Make an ad** (keeps the StartModal button), **My ads** (`/library`), **Brands** (`/library`), **+ Add client** (`/onboarding`). Keep the dynamic "Your brands" section + admin section + footer unchanged.

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -w @bya/web -- AppShell`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shell/AppShell.tsx apps/web/src/shell/AppShell.test.tsx
git commit -m "fix(web): rail matches legacy — drop Workspace header, PNG logo, legacy nav items"
```

---

### Task 6: Home renders the concept board

**Files:**
- Modify: `apps/web/src/home/Home.tsx` (replace dashboard body)
- Test: `apps/web/src/home/Home.test.tsx`

- [ ] **Step 1: Update test** — most-recent brand → board renders; no brands → onboarding CTA.

```tsx
// Home.test.tsx — mock useResource("brands") and the Board component
vi.mock("../board/Board", () => ({ default: ({ brandId }: { brandId: string }) => <div>board:{brandId}</div> }));
// brands resource returns [{ id: "b9", websiteUrl: "https://x.com", updatedAt: "..." }]
it("renders the board for the most-recent brand", async () => {
  render(<Home />);
  await waitFor(() => expect(screen.getByText("board:b9")).toBeInTheDocument());
});
it("shows onboarding CTA when there are no brands", async () => {
  // brands resource returns []
  render(<Home />);
  await waitFor(() => expect(screen.getByText(/add your first brand|let's learn your brand|get started/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -w @bya/web -- home/Home`
Expected: FAIL.

- [ ] **Step 3: Implement** — rewrite `Home.tsx` body:

```tsx
"use client";
import Link from "next/link";
import type { BrandSummary } from "@bya/shared";
import { useResource } from "../data/cache";
import Board from "../board/Board";

export default function Home() {
  const { data: brands, status } = useResource<BrandSummary[]>("brands");
  if (status === "loading" || status === "idle") {
    return <div className="canvas stack"><div className="status-row"><span className="spinner" /> Loading…</div></div>;
  }
  const current = brands && brands.length > 0 ? brands[0] : null; // brands come back most-recent first
  if (!current) {
    return (
      <div className="canvas stack">
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>Let's learn your brand</p>
          <p className="small" style={{ margin: 0 }}>Add your website and we'll build your concept board.</p>
          <Link href="/onboarding" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Get started</Link>
        </div>
      </div>
    );
  }
  return <Board brandId={current.id} />;
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -w @bya/web -- home/Home`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/home/Home.tsx apps/web/src/home/Home.test.tsx
git commit -m "feat(web): Home renders the concept board for the current brand (legacy parity)"
```

---

### Task 7: Logo auto-capture from the extracted site

**Files:**
- Create: `apps/web/src/lib/deriveLogo.ts` (+ `deriveLogo.test.ts`)
- Modify: `apps/web/src/onboarding/Onboarding.tsx`

Port `legacy/app.html:182–203`. The extracted `measuredSiteData.logos` (string URLs) feed it; on success, persist via `api.saveBrandLogo(brandId, dataUrl)`.

- [ ] **Step 1: Implement `deriveLogo.ts`** (canvas rasterize, best-effort, CORS-skip):

```ts
// apps/web/src/lib/deriveLogo.ts
/** Load the first loadable logo URL cross-origin and rasterize to a PNG data URL.
 *  Best-effort: resolves null if none load or the canvas is CORS-tainted (ported from legacy). */
export function deriveLogoFromUrls(urls: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const list = (urls || []).filter(Boolean);
    let i = 0;
    const tryNext = () => {
      if (i >= list.length) return resolve(null);
      const u = list[i++];
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || 256;
          c.height = img.naturalHeight || 256;
          c.getContext("2d")!.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch {
          tryNext();
        }
      };
      img.onerror = tryNext;
      img.src = u;
    };
    tryNext();
  });
}
```

Test (jsdom can't rasterize; assert null-on-empty and that it resolves):

```ts
import { describe, it, expect } from "vitest";
import { deriveLogoFromUrls } from "./deriveLogo";
describe("deriveLogoFromUrls", () => {
  it("resolves null for an empty list", async () => {
    expect(await deriveLogoFromUrls([])).toBeNull();
  });
});
```

- [ ] **Step 2: Wire into Onboarding** — after a successful `api.brand(...)` returns `{ id }`, read logos from the measured data and best-effort save:

```tsx
import { deriveLogoFromUrls } from "../lib/deriveLogo";
// inside handleContinue, after setBrandId(result.id):
const logos = Array.isArray((measuredSiteData as any)?.logos) ? (measuredSiteData as any).logos as string[] : [];
deriveLogoFromUrls(logos)
  .then((dataUrl) => { if (dataUrl) return api.saveBrandLogo(result.id, dataUrl); })
  .catch(() => {});
```

- [ ] **Step 3: Run web tests + typecheck**

Run: `npm test -w @bya/web -- deriveLogo` then `npm run build -w @bya/web`
Expected: PASS / build clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/deriveLogo.ts apps/web/src/lib/deriveLogo.test.ts apps/web/src/onboarding/Onboarding.tsx
git commit -m "feat(web): auto-capture brand logo from extracted site (legacy deriveLogoFromUrls)"
```

---

### Task 8: Brand-DNA strip on the board

**Files:**
- Modify: `apps/web/src/board/Board.tsx` (render a strip above the focus strip, from `api.getBrand` data already fetched)
- Test: extend `apps/web/src/board/Board.test.tsx`

Port the essentials of `legacy/app.html:225–` (`brandDnaHTML`): brand name · fonts · mood, plus labeled color-role swatches (background/text/primary/accent/cta/secondary) read from `brandExtraction.visual_brand_system.colors` (fallback `color_palette`).

- [ ] **Step 1: Extend Board state** to keep the fetched `brandExtraction` (Board already calls `api.getBrand`; store `detail.brandExtraction` in state alongside `logoUrl`).
- [ ] **Step 2: Render the strip** — a small presentational block (name, color swatches with hex labels, heading/body fonts, vibe), using existing classes/inline styles consistent with Board.
- [ ] **Step 3: Test** — given a brand with `visual_brand_system.colors.primary = ["#00434f"]`, the strip shows `#00434f`.
- [ ] **Step 4: Run** `npm test -w @bya/web -- board/Board` → PASS.
- [ ] **Step 5: Commit** `fix(web): show brand-DNA strip on the concept board (legacy parity)`

---

### Task 9: Parity sweep of remaining screens

**Files:** `Onboarding.tsx`, `Workbench.tsx`, `Library.tsx`, `StartModal.tsx`, `Toast.tsx` — compared against legacy.

- [ ] For each screen, diff copy/layout against the matching legacy `render*` function; fix wording/structure drift only (tokens/classes already match). Commit per screen with `fix(web): <screen> copy/layout parity with legacy`.
- [ ] Keep all added features (admin, quotas, per-concept batch, ref-ads picker).

> This task is bounded by the legacy `render*` functions; if a screen already matches, note it and skip — do not invent changes.

---

## Deliverables & cleanup

### Task 10: `docs/PIPELINE.md`

- [ ] Write `docs/PIPELINE.md` describing the **new app's** end-to-end pipeline in the flow + triggers-table format (the format from the chat: step · prompt · trigger · frequency/caching · model calls · workspace), reflecting VOC restored and angles dropped. Commit.

### Task 11: Manual-checks doc

- [ ] Create `docs/superpowers/manual-checks/spec-07-legacy-parity.md`:
  - **No Supabase migration required** for VOC (lives in the `analysis` JSONB blob) — state this explicitly.
  - Confirm `STAGE1_MODEL` supports `:online` web search and keys are set (VOC silently no-ops otherwise).
  - Click-through parity vs `legacy/app.html` (rail, Home=board, logo auto-fill, brand-DNA strip).
  - Confirm logo auto-capture on a real site; confirm re-onboarding doesn't error.
- [ ] Append a Spec #7 section to `docs/superpowers/MANUAL-CHECKS.md`. Commit.

### Task 12: Cleanup

- [ ] Grep for now-unused exports/files created obsolete by Task 6 (e.g. the old Home dashboard helpers `AdThumb`, `computeGreeting` if no longer referenced). Remove what's truly unreferenced; **verify with grep + `npm run build -w @bya/web`** before deleting. List removed files in the commit body. Commit `chore(web): remove code superseded by Spec #7`.

---

## Final verification

- [ ] `npm test -w @bya/shared` · `npm test -w @bya/backend` · `npm test -w @bya/web` all green.
- [ ] `npm run build -w @bya/web` clean.
- [ ] Run `/code-review` on the full branch diff; fix findings; commit.
- [ ] Push. Write the morning summary (done/verified vs pending, blockers).

## Self-review notes

- **Spec coverage:** Part A → Tasks 5–9; Part B → Tasks 1–4; Deliverables → Tasks 10–12. ✔
- **No migration** for VOC confirmed (JSONB passthrough) — captured in Task 11.
- **Type consistency:** `ExternalVoc`/`external_voc` (Task 1) are the names used in Tasks 3–4. `runCustomerResearch` is the single pipeline name across Tasks 3–4. `deriveLogoFromUrls` is the single helper name across Task 7.
