# Backend Read Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-scoped read endpoints — `GET /api/brands`, `GET /api/brand/:id`, `GET /api/ads` — plus their shared zod contracts and Supabase list/get functions.

**Architecture:** New `packages/shared/src/library.ts` contracts; three thin query functions added to the existing `apps/backend/src/services/supabase.ts` (service-role, user-scoped); a new `routes/library.ts` mounted under `/api`, mirroring the existing route files. Supertest route tests mock the supabase service (same style as `tests/routes.test.ts`).

**Tech Stack:** TS + Express, @supabase/supabase-js 2, zod, Vitest + supertest.

**Reference:** `apps/backend/src/services/supabase.ts` (persistence patterns — `getBrandExtraction`, `assemblePerformanceMemory` row-narrowing, `SIGNED_URL_TTL_SECONDS`), `apps/backend/src/routes/brand.ts` (route shape), `apps/backend/tests/routes.test.ts` (test style).

Run commands from `apps/backend`. Push after each commit.

---

### Task 1: Shared contracts

**Files:** Create `packages/shared/src/library.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/library.ts`**

```ts
import { z } from "zod";
import { BrandExtraction } from "./brand-extraction.js";

/** Row summary for the saved-brands list (GET /api/brands). */
export const BrandSummary = z.object({
  id: z.string(),
  websiteUrl: z.string(),
  updatedAt: z.string(),
});
export type BrandSummary = z.infer<typeof BrandSummary>;

/** Row summary for the library (GET /api/ads). imageUrl is a freshly-signed Storage URL. */
export const AdSummary = z.object({
  id: z.string(),
  imageUrl: z.string(),
  aspectRatio: z.string().nullable(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});
export type AdSummary = z.infer<typeof AdSummary>;

/** Full saved brand for reuse (GET /api/brand/:id). measuredSiteData is opaque jsonb. */
export const BrandDetail = z.object({
  id: z.string(),
  brandExtraction: BrandExtraction,
  measuredSiteData: z.unknown(),
});
export type BrandDetail = z.infer<typeof BrandDetail>;
```

- [ ] **Step 2: Export from `packages/shared/src/index.ts`**

Add this line after the existing exports:

```ts
export * from "./library.js";
```

- [ ] **Step 3: Verify the backend typechecks against the new exports**

Run (from `apps/backend`): `npx tsc --noEmit`
Expected: clean (no usage yet, but the new module compiles and is importable).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/library.ts packages/shared/src/index.ts
git commit -m "feat(shared): BrandSummary/AdSummary/BrandDetail read contracts"
git push
```

---

### Task 2: Supabase list/get service functions

**Files:** Modify `apps/backend/src/services/supabase.ts`

- [ ] **Step 1: Add the import** — extend the existing `@bya/shared` import

Change the existing `import { BrandExtraction, AdPrompt } from "@bya/shared";` to also bring the new types:

```ts
import { BrandExtraction, AdPrompt, type BrandSummary, type AdSummary, type BrandDetail } from "@bya/shared";
```

- [ ] **Step 2: Append the three functions** (after the existing exports; place near the other getters)

```ts
export async function listBrandExtractions(userId: string): Promise<BrandSummary[]> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .select("id, website_url, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new PersistenceError(`Listing brand extractions failed: ${error.message}`);
  type Row = { id: string; website_url: string; updated_at: string };
  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => ({ id: r.id, websiteUrl: r.website_url, updatedAt: r.updated_at }));
}

export async function getBrandDetail(id: string, userId: string): Promise<BrandDetail | null> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .select("id, analysis, measured_site_data")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const row = data as unknown as { id: string; analysis: unknown; measured_site_data: unknown };
  const parsed = BrandExtraction.safeParse(row.analysis);
  if (!parsed.success) return null;
  return { id: row.id, brandExtraction: parsed.data, measuredSiteData: row.measured_site_data ?? null };
}

export async function listGeneratedAds(userId: string): Promise<AdSummary[]> {
  const { data, error } = await admin()
    .from("generated_ads")
    .select("id, image_path, aspect_ratio, resolution, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new PersistenceError(`Listing generated ads failed: ${error.message}`);
  type Row = { id: string; image_path: string; aspect_ratio: string | null; resolution: string | null; created_at: string };
  const rows = (data ?? []) as unknown as Row[];
  const out: AdSummary[] = [];
  for (const r of rows) {
    const signed = await admin().storage.from("ads").createSignedUrl(r.image_path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data) continue; // skip unsignable rows rather than failing the whole list
    out.push({ id: r.id, imageUrl: signed.data.signedUrl, aspectRatio: r.aspect_ratio, resolution: r.resolution, createdAt: r.created_at });
  }
  return out;
}
```

(The `(data ?? []) as unknown as Row[]` narrowing mirrors the existing `assemblePerformanceMemory` in this same file; `SIGNED_URL_TTL_SECONDS` is already defined above.)

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` (from `apps/backend`) → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/services/supabase.ts
git commit -m "feat(backend): supabase list/get functions for read endpoints"
git push
```

---

### Task 3: Library routes + mount + tests

**Files:** Create `apps/backend/src/routes/library.ts`, `apps/backend/tests/library.routes.test.ts`; Modify `apps/backend/src/server.ts`

- [ ] **Step 1: Create `apps/backend/src/routes/library.ts`**

```ts
import { Router } from "express";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { listBrandExtractions, getBrandDetail, listGeneratedAds } from "../services/supabase.js";

export const libraryRouter = Router();

libraryRouter.get("/brands", requireApprovedUser, async (req, res) => {
  try {
    res.json(await listBrandExtractions(req.user!.id));
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

libraryRouter.get("/brand/:id", requireApprovedUser, async (req, res) => {
  try {
    const detail = await getBrandDetail(req.params.id, req.user!.id);
    if (!detail) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Brand not found." } });
      return;
    }
    res.json(detail);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

libraryRouter.get("/ads", requireApprovedUser, async (req, res) => {
  try {
    res.json(await listGeneratedAds(req.user!.id));
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 2: Mount it in `apps/backend/src/server.ts`**

Add the import alongside the others and mount after the existing routers:

```ts
import { libraryRouter } from "./routes/library.js";
```
```ts
  app.use("/api", libraryRouter);
```

- [ ] **Step 3: Write the route tests** — `apps/backend/tests/library.routes.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listBrandExtractions: vi.fn(),
  getBrandDetail: vi.fn(),
  listGeneratedAds: vi.fn(),
}));

import {
  getUserFromToken,
  isApproved,
  listBrandExtractions,
  getBrandDetail,
  listGeneratedAds,
} from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("GET /api/brands", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/brands");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(listBrandExtractions).not.toHaveBeenCalled();
  });

  it("returns the user's brand summaries", async () => {
    approve();
    vi.mocked(listBrandExtractions).mockResolvedValue([
      { id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-05-28T00:00:00Z" },
    ]);
    const res = await request(app).get("/api/brands").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-05-28T00:00:00Z" }]);
    expect(listBrandExtractions).toHaveBeenCalledWith("u1");
  });
});

describe("GET /api/brand/:id", () => {
  it("404s when the brand is not found", async () => {
    approve();
    vi.mocked(getBrandDetail).mockResolvedValue(null);
    const res = await request(app).get("/api/brand/nope").set("Authorization", "Bearer ok");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the brand detail when found", async () => {
    approve();
    vi.mocked(getBrandDetail).mockResolvedValue({
      id: "b1",
      brandExtraction: { brand_identity: { brand_name: "Acme" } },
      measuredSiteData: { title: "Acme" },
    });
    const res = await request(app).get("/api/brand/b1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("b1");
    expect(res.body.brandExtraction.brand_identity.brand_name).toBe("Acme");
    expect(getBrandDetail).toHaveBeenCalledWith("b1", "u1");
  });
});

describe("GET /api/ads", () => {
  it("returns the user's ads with signed urls", async () => {
    approve();
    vi.mocked(listGeneratedAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/x.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    const res = await request(app).get("/api/ads").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body[0].imageUrl).toBe("https://signed/x.png");
    expect(listGeneratedAds).toHaveBeenCalledWith("u1");
  });
});
```

- [ ] **Step 4: Run the tests** — `npm test -- library.routes` (from `apps/backend`)
Expected: PASS (5 tests). If the auth 401 test fails, confirm `libraryRouter` is mounted after `express.json` and uses `requireApprovedUser`.

- [ ] **Step 5: Full suite + typecheck** — `npm test` (all backend suites green) and `npx tsc --noEmit` (clean).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/library.ts apps/backend/src/server.ts apps/backend/tests/library.routes.test.ts
git commit -m "feat(backend): GET /api/brands, /api/brand/:id, /api/ads"
git push
```

---

## Self-Review

**Spec coverage:** `BrandSummary`/`AdSummary`/`BrandDetail` contracts → Task 1 ✅; `listBrandExtractions`/`getBrandDetail`/`listGeneratedAds` (user-scoped, signed URLs, null→404 path) → Task 2 ✅; three GET routes behind `requireApprovedUser` + mount → Task 3 ✅; route tests covering 401, list, 404, detail → Task 3 ✅. No writes/deletes/pagination/domain-grouping (out of scope) ✅.

**Placeholder scan:** No gaps — full code for contracts, service functions, routes, mount, and tests. The `as unknown as Row[]` narrowing is the file's existing idiom for untyped Supabase rows, not a placeholder.

**Type consistency:** `BrandSummary`/`AdSummary`/`BrandDetail` defined in `library.ts`, exported via `index.ts`, imported as types in `supabase.ts`, returned by the three functions, consumed by `library.ts` routes. `req.user!.id` matches the middleware's `Request.user` augmentation. `toHttpError` + `PersistenceError` reused from `lib/errors.ts`. `SIGNED_URL_TTL_SECONDS` reused. Route response bodies match the contracts (the test fixtures are valid `BrandSummary`/`AdSummary`/`BrandDetail` values).
