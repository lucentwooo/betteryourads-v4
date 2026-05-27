# TS Backend — Persistence + Migrations (Plan 5 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the four pipelines to Supabase — persist brand extractions, ad prompts, and rendered ads; serve rendered images from Storage as signed URLs; assemble performance memory by query — and adopt ordered SQL migration files for the schema changes the spec requires.

**Architecture:** Persistence lives in `services/supabase.ts` (service-role client, bypasses RLS — `user_id` is set explicitly from `req.user.id`). Pipelines stay HTTP-unaware and pure; **routes orchestrate** persistence and id-lookup, so the run scripts keep working unchanged (no DB writes). Migrations are **authored only** as ordered files under `supabase/migrations/` (expand → rename → ad_prompts → backfill); the user applies them with `supabase db push` against a preview branch then prod — this plan never touches the real database.

**Tech Stack:** TypeScript, Node ≥ 20 (ESM), Express 4, `@supabase/supabase-js` v2 (Postgres + Storage), zod, Vitest, supertest, tsx.

This is **Plan 5 of 5** — the final backend slice. It depends on Plans 1–4 (extract, brand, ad-prompt, render pipelines) being in place. Master spec: `docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md` (§ "Persistence & migration").

**Decisions locked in for this plan** (confirmed with the owner):
- **Migrations are authored, not applied by the agent** — real production data; the owner runs `supabase db push` on a preview branch first. The Supabase CLI is not installed here and is not added.
- **`user_id` uses `req.user.id`** (the auth gate is already wired) and stays `NOT NULL`. No future backfill.
- Persistence orchestration is in routes; pipelines unchanged; run scripts stay print-only.

**Conventions carried from earlier plans:** Windows + PowerShell; repo lives in OneDrive (transient file locks — retry once). Never run a bare emitting `tsc` — always `tsc --noEmit`. Before committing run `git status --porcelain` and stage only the explicit paths. Commit messages end with a trailing `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` line. Push after each commit.

---

## File Structure

```
supabase/
  schema.sql                                  # UNCHANGED — documents the pre-migration applied state
  migrations/                                 # NEW — ordered, append-only migration files
    20260528120000_baseline.sql               # NEW — copy of schema.sql (idempotent applied state)
    20260528120100_expand.sql                 # NEW — add measured_site_data, performance columns
    20260528120200_rename.sql                 # NEW — brands→brand_extractions, ads→generated_ads (+ policy renames)
    20260528120300_ad_prompts.sql             # NEW — create ad_prompts + RLS; add generated_ads.ad_prompt_id
    20260528120400_backfill.sql               # NEW — stamp schema_version on existing brand JSON
apps/backend/
  src/lib/errors.ts                           # MODIFY — add "persistence" Stage + PersistenceError
  src/services/supabase.ts                    # MODIFY — add persistence + lookup + storage + perf-memory fns
  src/routes/brand.ts                         # MODIFY — persist; return { id, brandExtraction }
  src/routes/ad-prompt.ts                     # MODIFY — id-lookup + perf memory + variant; return { id, adPrompt }
  src/routes/render.ts                        # MODIFY — adPromptId lookup + persist to Storage; return { id, imageUrl }
  tests/errors.test.ts                        # MODIFY — PersistenceError case
  tests/supabase.persistence.test.ts          # NEW — persistence/lookup/storage/perf-memory (supabase-js mocked)
  tests/brand.routes.test.ts                  # MODIFY — mock saveBrandExtraction; assert id
  tests/ad-prompt.routes.test.ts              # MODIFY — mock save/lookup; assert id + lookup path
  tests/render.routes.test.ts                 # MODIFY — mock persist/lookup; assert id + signed url
docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md   # (reference only)
```

No new npm dependencies. The `ads` Storage bucket and `profiles`/`brands`/`ads`/`brand_assets` tables already exist (see `supabase/schema.sql`).

**Schema shape after migrations (what the code targets):**
- `brand_extractions` (was `brands`): `id, user_id, name, website_url, analysis jsonb, measured_site_data jsonb, created_at, updated_at`, unique `(user_id, website_url)`.
- `generated_ads` (was `ads`): `id, user_id, brand_id→brand_extractions, ad_prompt_id→ad_prompts, website_url, image_path, prompt, aspect_ratio, resolution, performance jsonb, created_at`.
- `ad_prompts` (new): `id, user_id, brand_extraction_id→brand_extractions, variant ('no_asset'|'w_asset'), ad_prompt_json jsonb, user_direction jsonb, model, created_at`.

---

## Task 1: `PersistenceError` typed error

`services/supabase.ts` is a service like the others; its write/read failures map to a typed error. 500 (server-side problem, not the client's fault), new stage `"persistence"`.

**Files:**
- Modify: `apps/backend/src/lib/errors.ts`
- Modify: `apps/backend/tests/errors.test.ts`

- [ ] **Step 1: Add the failing test**

In `apps/backend/tests/errors.test.ts`, add `PersistenceError` to the import from `../src/lib/errors.js` and append this `describe` block:

```ts
describe("PersistenceError", () => {
  it("maps to a 500 with the persistence stage", () => {
    const e = new PersistenceError("insert failed");
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("PERSISTENCE_ERROR");
    expect(e.status).toBe(500);
    expect(e.stage).toBe("persistence");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: FAIL — `PersistenceError` is not exported.

- [ ] **Step 3: Add the stage + error class in `apps/backend/src/lib/errors.ts`**

Add `"persistence"` to the `Stage` union (first line):

```ts
export type Stage = "extract" | "brand" | "ad-prompt" | "render" | "validation" | "auth" | "persistence";
```

Add after `KieError` (leave everything else unchanged):

```ts
export class PersistenceError extends AppError {
  constructor(message: string) {
    super(message, "PERSISTENCE_ERROR", 500, "persistence");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: PASS.

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/tests/errors.test.ts
git commit -m "feat(backend): PersistenceError typed error

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: Migration files (authored only)

Ordered, append-only SQL under `supabase/migrations/`. Non-destructive (expand → rename → create → backfill). The owner applies these with `supabase db push`; nothing here runs against a database. `schema.sql` stays as the documented pre-migration state.

**Files:**
- Create: `supabase/migrations/20260528120000_baseline.sql`
- Create: `supabase/migrations/20260528120100_expand.sql`
- Create: `supabase/migrations/20260528120200_rename.sql`
- Create: `supabase/migrations/20260528120300_ad_prompts.sql`
- Create: `supabase/migrations/20260528120400_backfill.sql`

- [ ] **Step 1: Baseline — `supabase/migrations/20260528120000_baseline.sql`**

Copy the **entire current contents of `supabase/schema.sql` verbatim** into this file (it is already idempotent — `create table if not exists`, `on conflict do nothing`, `drop policy if exists`, so re-applying it to the live DB is a no-op). Add this header comment at the very top, above the copied content:

```sql
-- ============================================================================
-- Baseline migration: snapshot of the schema already applied to production
-- (verbatim copy of supabase/schema.sql at the time CLI migrations were adopted).
-- Idempotent; re-applying it to the live DB is a no-op. Do NOT edit — future
-- changes go in later migration files.
-- ============================================================================

```

- [ ] **Step 2: Expand — `supabase/migrations/20260528120100_expand.sql`**

```sql
-- Expand: additive columns only (safe on populated tables).
alter table public.brands add column if not exists measured_site_data jsonb;
alter table public.ads   add column if not exists performance        jsonb;
```

- [ ] **Step 3: Rename — `supabase/migrations/20260528120200_rename.sql`**

```sql
-- Rename: Postgres preserves data, FKs, indexes, and RLS policies across a table
-- rename. We only update the table names and the policy names for clarity.
alter table public.brands rename to brand_extractions;
alter table public.ads    rename to generated_ads;

alter policy "own brands"    on public.brand_extractions rename to "own brand_extractions";
alter policy "own ads read"  on public.generated_ads     rename to "own generated_ads read";
alter policy "own ads delete" on public.generated_ads    rename to "own generated_ads delete";
```

- [ ] **Step 4: ad_prompts — `supabase/migrations/20260528120300_ad_prompts.sql`**

```sql
-- New table for the structured Stage-2 output, plus a link column on generated_ads.
create table if not exists public.ad_prompts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  brand_extraction_id uuid references public.brand_extractions(id) on delete set null,
  variant             text not null check (variant in ('no_asset', 'w_asset')),
  ad_prompt_json      jsonb not null,
  user_direction      jsonb,
  model               text,
  created_at          timestamptz not null default now()
);
alter table public.ad_prompts enable row level security;
drop policy if exists "own ad_prompts" on public.ad_prompts;
create policy "own ad_prompts" on public.ad_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.generated_ads
  add column if not exists ad_prompt_id uuid references public.ad_prompts(id) on delete set null;
```

- [ ] **Step 5: Backfill — `supabase/migrations/20260528120400_backfill.sql`**

```sql
-- Backfill: existing brands.analysis already IS brand JSON; stamp schema_version
-- so tolerant zod parsing treats old rows as v1. Rows that already have it are skipped.
update public.brand_extractions
set analysis = jsonb_set(analysis, '{schema_version}', '1'::jsonb, true)
where analysis is not null
  and not (analysis ? 'schema_version');
```

- [ ] **Step 6: Sanity-check the SQL by eye**

There is no local database here, so these are not executed. Re-read the five files and confirm: every statement is idempotent or guarded; the order is expand → rename → ad_prompts → backfill; `ad_prompts.brand_extraction_id` references `brand_extractions` (which exists after the rename in step 3, before step 4). No `drop`/`truncate`/destructive statement appears.

- [ ] **Step 7: Commit + push**

```bash
git add supabase/migrations/
git commit -m "feat(db): ordered migrations — expand, rename, ad_prompts, backfill

Authored only; owner applies via supabase db push (preview branch first).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

> **Owner action (not a code step):** apply on a Supabase preview branch, verify `brand_extractions`/`generated_ads`/`ad_prompts` exist with data intact, then merge to prod.

---

## Task 3: `supabase.ts` — brand + ad-prompt persistence & lookup

Four functions on the existing service-role client. `user_id` is always set explicitly (service-role bypasses RLS, so `auth.uid()` is null server-side). Failures throw `PersistenceError`; a missing row on a lookup returns `null` (the route decides whether that's a client error).

**Files:**
- Modify: `apps/backend/src/services/supabase.ts`
- Create: `apps/backend/tests/supabase.persistence.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/supabase.persistence.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable query mock: filter/select/insert/upsert return the same object;
// single() and order() are the awaited terminals. Declared before vi.mock so the
// (lazily-called) factory closure can see them — same pattern as supabase.service.test.ts.
const single = vi.fn();
const order = vi.fn();
const eq = vi.fn();
const not = vi.fn();
const select = vi.fn();
const insert = vi.fn();
const upsert = vi.fn();
const chain = { select, insert, upsert, eq, not, order, single };
select.mockReturnValue(chain);
insert.mockReturnValue(chain);
upsert.mockReturnValue(chain);
eq.mockReturnValue(chain);
not.mockReturnValue(chain);
const from = vi.fn(() => chain);

const upload = vi.fn();
const createSignedUrl = vi.fn();
const storage = { from: vi.fn(() => ({ upload, createSignedUrl })) };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: vi.fn() }, from, storage }),
}));

import {
  saveBrandExtraction,
  getBrandExtraction,
  saveAdPrompt,
  getAdPrompt,
} from "../src/services/supabase.js";
import { PersistenceError } from "../src/lib/errors.js";

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.clearAllMocks(); // clears call history; keeps the chain return-value wiring
});

describe("saveBrandExtraction", () => {
  it("upserts on (user_id, website_url) and returns the new id", async () => {
    single.mockResolvedValue({ data: { id: "b1" }, error: null });
    const out = await saveBrandExtraction({
      userId: "u1",
      url: "https://acme.com",
      brandExtraction: { brand_identity: { brand_name: "Acme" }, schema_version: 1 },
      measuredSiteData: { title: "Acme" },
    });
    expect(out).toEqual({ id: "b1" });
    expect(from).toHaveBeenCalledWith("brand_extractions");
    const [row, opts] = upsert.mock.calls[0];
    expect(row.user_id).toBe("u1");
    expect(row.website_url).toBe("https://acme.com");
    expect(row.analysis.brand_identity.brand_name).toBe("Acme");
    expect(row.measured_site_data.title).toBe("Acme");
    expect(opts).toEqual({ onConflict: "user_id,website_url" });
  });

  it("throws PersistenceError when the upsert errors", async () => {
    single.mockResolvedValue({ data: null, error: { message: "duplicate" } });
    await expect(
      saveBrandExtraction({ userId: "u1", url: "x", brandExtraction: {}, measuredSiteData: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe("getBrandExtraction", () => {
  it("returns the parsed analysis for a row", async () => {
    single.mockResolvedValue({ data: { analysis: { brand_identity: { brand_name: "Acme" } } }, error: null });
    const be = await getBrandExtraction("b1");
    expect(be?.brand_identity).toEqual({ brand_name: "Acme" });
    expect(eq).toHaveBeenCalledWith("id", "b1");
  });

  it("returns null when no row is found", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await getBrandExtraction("missing")).toBeNull();
  });
});

describe("saveAdPrompt", () => {
  it("inserts the prompt with its variant and returns the id", async () => {
    single.mockResolvedValue({ data: { id: "p1" }, error: null });
    const out = await saveAdPrompt({
      userId: "u1",
      brandExtractionId: "b1",
      variant: "w_asset",
      adPrompt: { ad_prompt: { goal: "x" }, schema_version: 1 },
      userDirection: { tone: "bold" },
      model: "some/model",
    });
    expect(out).toEqual({ id: "p1" });
    expect(from).toHaveBeenCalledWith("ad_prompts");
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe("u1");
    expect(row.brand_extraction_id).toBe("b1");
    expect(row.variant).toBe("w_asset");
    expect(row.ad_prompt_json.ad_prompt.goal).toBe("x");
    expect(row.model).toBe("some/model");
  });

  it("throws PersistenceError when the insert errors", async () => {
    single.mockResolvedValue({ data: null, error: { message: "bad fk" } });
    await expect(
      saveAdPrompt({ userId: "u1", brandExtractionId: null, variant: "no_asset", adPrompt: {}, userDirection: undefined, model: "m" }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe("getAdPrompt", () => {
  it("returns the parsed ad_prompt_json for a row", async () => {
    single.mockResolvedValue({ data: { ad_prompt_json: { ad_prompt: { goal: "x" } } }, error: null });
    const ap = await getAdPrompt("p1");
    expect(ap?.ad_prompt?.goal).toBe("x");
    expect(eq).toHaveBeenCalledWith("id", "p1");
  });

  it("returns null when no row is found", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await getAdPrompt("missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- supabase.persistence`
Expected: FAIL — `saveBrandExtraction` (etc.) are not exported.

- [ ] **Step 3: Add the functions to `apps/backend/src/services/supabase.ts`**

Update the imports at the top of the file:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandExtraction, AdPrompt } from "@bya/shared";
import { PersistenceError } from "../lib/errors.js";
```

Append these functions to the end of the file (leave `admin`, `getUserFromToken`, `isApproved` unchanged):

```ts
/** Narrow an untyped Supabase row to its `id`. The client has no generated types here. */
function rowId(data: unknown): string {
  return (data as { id: string }).id;
}

export async function saveBrandExtraction(args: {
  userId: string;
  url: string;
  brandExtraction: BrandExtraction;
  measuredSiteData: unknown;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .upsert(
      {
        user_id: args.userId,
        website_url: args.url,
        analysis: args.brandExtraction,
        measured_site_data: args.measuredSiteData ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,website_url" },
    )
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the brand extraction failed: ${error?.message ?? "no row"}`);
  return { id: rowId(data) };
}

export async function getBrandExtraction(id: string): Promise<BrandExtraction | null> {
  const { data, error } = await admin().from("brand_extractions").select("analysis").eq("id", id).single();
  if (error || !data) return null;
  const parsed = BrandExtraction.safeParse((data as { analysis: unknown }).analysis);
  return parsed.success ? parsed.data : null;
}

export async function saveAdPrompt(args: {
  userId: string;
  brandExtractionId: string | null;
  variant: "no_asset" | "w_asset";
  adPrompt: AdPrompt;
  userDirection: unknown;
  model: string;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from("ad_prompts")
    .insert({
      user_id: args.userId,
      brand_extraction_id: args.brandExtractionId,
      variant: args.variant,
      ad_prompt_json: args.adPrompt,
      user_direction: args.userDirection ?? null,
      model: args.model,
    })
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the ad prompt failed: ${error?.message ?? "no row"}`);
  return { id: rowId(data) };
}

export async function getAdPrompt(id: string): Promise<AdPrompt | null> {
  const { data, error } = await admin().from("ad_prompts").select("ad_prompt_json").eq("id", id).single();
  if (error || !data) return null;
  const parsed = AdPrompt.safeParse((data as { ad_prompt_json: unknown }).ad_prompt_json);
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- supabase.persistence`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/services/supabase.ts apps/backend/tests/supabase.persistence.test.ts
git commit -m "feat(backend): Supabase persistence + lookup for brand and ad-prompt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: `supabase.ts` — render storage + performance memory

`persistRenderedAd` downloads the KIE-hosted image, uploads it to the private `ads` bucket under `<userId>/<uuid>.png`, inserts a `generated_ads` row, and returns a signed URL (7-day). `assemblePerformanceMemory` derives prior-ad performance by query (no dedicated table); it returns `undefined` when there's nothing, so the ad-prompt route only threads it into the prompt when present.

**Files:**
- Modify: `apps/backend/src/services/supabase.ts`
- Modify: `apps/backend/tests/supabase.persistence.test.ts`

- [ ] **Step 1: Add the failing tests — append to `apps/backend/tests/supabase.persistence.test.ts`**

Add these imports to the existing import block from `../src/services/supabase.js`:

```ts
import {
  saveBrandExtraction,
  getBrandExtraction,
  saveAdPrompt,
  getAdPrompt,
  persistRenderedAd,
  assemblePerformanceMemory,
} from "../src/services/supabase.js";
```

Append these `describe` blocks:

```ts
describe("persistRenderedAd", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    );
  });

  it("downloads, uploads to the ads bucket, inserts a row, and returns a signed url", async () => {
    upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    single.mockResolvedValue({ data: { id: "a1" }, error: null }); // generated_ads insert
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/x.png" }, error: null });

    const out = await persistRenderedAd({
      userId: "u1",
      imageUrl: "https://cdn/out.png",
      prompt: "{}",
      aspectRatio: "1:1",
      resolution: "1K",
      adPromptId: "p1",
    });

    expect(out).toEqual({ id: "a1", imageUrl: "https://signed/x.png" });
    expect(storage.from).toHaveBeenCalledWith("ads");
    const [uploadPath] = upload.mock.calls[0];
    expect(uploadPath.startsWith("u1/")).toBe(true);
    expect(uploadPath.endsWith(".png")).toBe(true);
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe("u1");
    expect(row.ad_prompt_id).toBe("p1");
    expect(row.image_path).toBe(uploadPath);
    expect(row.aspect_ratio).toBe("1:1");
    expect(row.resolution).toBe("1K");
  });

  it("throws PersistenceError when the image download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it("throws PersistenceError when the upload errors", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "bucket down" } });
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe("assemblePerformanceMemory", () => {
  it("returns prior ads' performance joined to their prompt, newest first", async () => {
    order.mockResolvedValue({
      data: [{ performance: { ctr: 0.05 }, ad_prompts: { ad_prompt_json: { ad_prompt: { goal: "x" } } } }],
      error: null,
    });
    const mem = await assemblePerformanceMemory({ userId: "u1", brandExtractionId: "b1" });
    expect(mem).toEqual([{ performance: { ctr: 0.05 }, ad_prompt: { ad_prompt: { goal: "x" } } }]);
    expect(from).toHaveBeenCalledWith("generated_ads");
    expect(eq).toHaveBeenCalledWith("ad_prompts.brand_extraction_id", "b1");
  });

  it("returns undefined when there is no performance data", async () => {
    order.mockResolvedValue({ data: [], error: null });
    expect(await assemblePerformanceMemory({ userId: "u1", brandExtractionId: "b1" })).toBeUndefined();
  });

  it("throws PersistenceError when the query errors", async () => {
    order.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(assemblePerformanceMemory({ userId: "u1", brandExtractionId: "b1" })).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });
});
```

> Note: the duplicate `import { saveBrandExtraction, ... }` from Step 1 of Task 3 is replaced by the expanded import above — delete the old one so there's a single import statement.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- supabase.persistence`
Expected: FAIL — `persistRenderedAd` / `assemblePerformanceMemory` are not exported.

- [ ] **Step 3: Add the functions to `apps/backend/src/services/supabase.ts`**

Add `randomUUID` to the imports:

```ts
import { randomUUID } from "node:crypto";
```

Append to the end of the file:

```ts
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function persistRenderedAd(args: {
  userId: string;
  imageUrl: string; // KIE-hosted result URL (temporary)
  prompt: string; // ad_prompt JSON, stored for reference on the row
  aspectRatio: string | null;
  resolution: string | null;
  adPromptId?: string | null;
}): Promise<{ id: string; imageUrl: string }> {
  let bytes: Buffer;
  try {
    const resp = await fetch(args.imageUrl);
    if (!resp.ok) throw new PersistenceError(`Could not download the rendered image (HTTP ${resp.status}).`);
    bytes = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    if (e instanceof PersistenceError) throw e;
    throw new PersistenceError(`Could not download the rendered image: ${e instanceof Error ? e.message : String(e)}`);
  }

  const imagePath = `${args.userId}/${randomUUID()}.png`;
  const up = await admin().storage.from("ads").upload(imagePath, bytes, { contentType: "image/png", upsert: false });
  if (up.error) throw new PersistenceError(`Uploading the rendered image failed: ${up.error.message}`);

  const { data, error } = await admin()
    .from("generated_ads")
    .insert({
      user_id: args.userId,
      ad_prompt_id: args.adPromptId ?? null,
      image_path: imagePath,
      prompt: args.prompt,
      aspect_ratio: args.aspectRatio,
      resolution: args.resolution,
    })
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the ad record failed: ${error?.message ?? "no row"}`);

  const signed = await admin().storage.from("ads").createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) {
    throw new PersistenceError(`Signing the image URL failed: ${signed.error?.message ?? "no url"}`);
  }
  return { id: rowId(data), imageUrl: signed.data.signedUrl };
}

/** Prior generated ads (with performance tags) for a brand, joined to the prompt that
 *  produced them. Derived by query — no dedicated table. Returns undefined when empty so
 *  callers can skip the optional prompt section. */
export async function assemblePerformanceMemory(args: {
  userId: string;
  brandExtractionId: string;
}): Promise<Array<{ performance: unknown; ad_prompt: unknown }> | undefined> {
  const { data, error } = await admin()
    .from("generated_ads")
    .select("performance, ad_prompts!inner ( ad_prompt_json, brand_extraction_id )")
    .eq("user_id", args.userId)
    .eq("ad_prompts.brand_extraction_id", args.brandExtractionId)
    .not("performance", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new PersistenceError(`Loading performance memory failed: ${error.message}`);
  type PerfRow = { performance: unknown; ad_prompts: { ad_prompt_json: unknown } | null };
  const rows = (data ?? []) as PerfRow[];
  if (rows.length === 0) return undefined;
  return rows.map((r) => ({ performance: r.performance, ad_prompt: r.ad_prompts?.ad_prompt_json ?? null }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- supabase.persistence`
Expected: PASS (14 tests total).

- [ ] **Step 5: Type-check**

Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit + push**

```bash
git add apps/backend/src/services/supabase.ts apps/backend/tests/supabase.persistence.test.ts
git commit -m "feat(backend): render Storage persistence + performance-memory query

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: Wire `POST /api/brand` to persist

Persist the result and return `{ id, brandExtraction }` (the spec's contract). `req.user.id` is guaranteed by `requireApprovedUser`.

**Files:**
- Modify: `apps/backend/src/routes/brand.ts`
- Modify: `apps/backend/tests/brand.routes.test.ts`

- [ ] **Step 1: Update the test mock + assertions — `apps/backend/tests/brand.routes.test.ts`**

Replace the supabase mock factory (lines 5–8) with one that also stubs `saveBrandExtraction`:

```ts
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  saveBrandExtraction: vi.fn(),
}));
```

Add `saveBrandExtraction` to the import from `../src/services/supabase.js`:

```ts
import { getUserFromToken, isApproved, saveBrandExtraction } from "../src/services/supabase.js";
```

Replace the "returns 200" test body with one that mocks the save and asserts the `id`:

```ts
  it("returns 200 with { id, brandExtraction } for an approved user", async () => {
    approve();
    vi.mocked(runBrand).mockResolvedValue({ brand_identity: { brand_name: "Acme" }, schema_version: 1 });
    vi.mocked(saveBrandExtraction).mockResolvedValue({ id: "b1" });
    const res = await request(app)
      .post("/api/brand")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("b1");
    expect(res.body.brandExtraction.brand_identity.brand_name).toBe("Acme");
    expect(saveBrandExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", url: "https://acme.com" }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- brand.routes`
Expected: FAIL — `res.body.id` is undefined (route doesn't persist yet).

- [ ] **Step 3: Update `apps/backend/src/routes/brand.ts`**

```ts
import { Router } from "express";
import { runBrand } from "../pipelines/brand.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { saveBrandExtraction } from "../services/supabase.js";

export const brandRouter = Router();

brandRouter.post("/brand", requireApprovedUser, async (req, res) => {
  try {
    const url = req.body?.url ?? "";
    const brandExtraction = await runBrand({ url, measuredSiteData: req.body?.measuredSiteData });
    const { id } = await saveBrandExtraction({
      userId: req.user!.id,
      url,
      brandExtraction,
      measuredSiteData: req.body?.measuredSiteData,
    });
    res.json({ id, brandExtraction });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- brand.routes`
Expected: PASS (4 tests — the ValidationError/OpenRouterError cases still pass because the pipeline rejects before persistence).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/routes/brand.ts apps/backend/tests/brand.routes.test.ts
git commit -m "feat(backend): persist brand extraction; /api/brand returns { id }

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: Wire `POST /api/ad-prompt` — lookup, performance memory, persist

Accept `brandExtractionId | brandExtraction` (resolve the id to the stored extraction when no inline one is given). Assemble performance memory from Supabase when the caller didn't pass one and a `brandExtractionId` is available. Select the `variant` from product-asset presence. Persist and return `{ id, adPrompt }`.

**Files:**
- Modify: `apps/backend/src/routes/ad-prompt.ts`
- Modify: `apps/backend/tests/ad-prompt.routes.test.ts`

- [ ] **Step 1: Update the test mock + add cases — `apps/backend/tests/ad-prompt.routes.test.ts`**

Replace the supabase mock factory (lines 5–8) with:

```ts
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  getBrandExtraction: vi.fn(),
  saveAdPrompt: vi.fn(),
  assemblePerformanceMemory: vi.fn(),
}));
```

Replace the import from `../src/services/supabase.js`:

```ts
import {
  getUserFromToken,
  isApproved,
  getBrandExtraction,
  saveAdPrompt,
  assemblePerformanceMemory,
} from "../src/services/supabase.js";
```

Replace the "returns 200" test, and add a lookup test, so the block reads:

```ts
  it("returns 200 with { id, adPrompt } for an approved user", async () => {
    approve();
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    vi.mocked(saveAdPrompt).mockResolvedValue({ id: "p1" });
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("p1");
    expect(res.body.adPrompt.ad_prompt.goal).toBe("x");
    // inline brandExtraction → no lookup; no productAsset → variant no_asset
    expect(getBrandExtraction).not.toHaveBeenCalled();
    expect(vi.mocked(saveAdPrompt).mock.calls[0][0].variant).toBe("no_asset");
  });

  it("resolves brandExtractionId, assembles performance memory, and persists w_asset", async () => {
    approve();
    vi.mocked(getBrandExtraction).mockResolvedValue({ brand_identity: { brand_name: "Acme" } });
    vi.mocked(assemblePerformanceMemory).mockResolvedValue([{ performance: { ctr: 0.05 }, ad_prompt: {} }]);
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    vi.mocked(saveAdPrompt).mockResolvedValue({ id: "p2" });
    const res = await request(app)
      .post("/api/ad-prompt")
      .set("Authorization", "Bearer ok")
      .send({
        brandExtractionId: "b1",
        referenceAdImage: "data:image/png;base64,REF",
        logoImage: "data:image/png;base64,LOGO",
        productAsset: "data:image/png;base64,ASSET",
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("p2");
    expect(getBrandExtraction).toHaveBeenCalledWith("b1");
    expect(assemblePerformanceMemory).toHaveBeenCalledWith({ userId: "u1", brandExtractionId: "b1" });
    const passedToPipeline = vi.mocked(runAdPrompt).mock.calls[0][0];
    expect(passedToPipeline.performanceMemory).toEqual([{ performance: { ctr: 0.05 }, ad_prompt: {} }]);
    expect(vi.mocked(saveAdPrompt).mock.calls[0][0].variant).toBe("w_asset");
    expect(vi.mocked(saveAdPrompt).mock.calls[0][0].brandExtractionId).toBe("b1");
  });

  it("422s when brandExtractionId is not found", async () => {
    approve();
    vi.mocked(getBrandExtraction).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/ad-prompt")
      .set("Authorization", "Bearer ok")
      .send({ brandExtractionId: "missing", referenceAdImage: "x", logoImage: "y" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(runAdPrompt).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- ad-prompt.routes`
Expected: FAIL — `res.body.id` undefined / lookup not wired.

- [ ] **Step 3: Update `apps/backend/src/routes/ad-prompt.ts`**

```ts
import { Router } from "express";
import { runAdPrompt } from "../pipelines/ad-prompt.js";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { getBrandExtraction, saveAdPrompt, assemblePerformanceMemory } from "../services/supabase.js";
import { loadConfig } from "../config/index.js";

export const adPromptRouter = Router();

adPromptRouter.post("/ad-prompt", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtractionId: string | undefined = req.body?.brandExtractionId;

    let brandExtraction = req.body?.brandExtraction;
    if (!brandExtraction && brandExtractionId) {
      brandExtraction = await getBrandExtraction(brandExtractionId);
      if (!brandExtraction) throw new ValidationError("brandExtractionId not found.");
    }

    let performanceMemory = req.body?.performanceMemory;
    if (performanceMemory === undefined && brandExtractionId) {
      performanceMemory = await assemblePerformanceMemory({ userId, brandExtractionId });
    }

    const adPrompt = await runAdPrompt({
      brandExtraction,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
      customerResearch: req.body?.customerResearch,
      performanceMemory,
      userDirection: req.body?.userDirection,
    });

    const variant: "no_asset" | "w_asset" = req.body?.productAsset ? "w_asset" : "no_asset";
    const { id } = await saveAdPrompt({
      userId,
      brandExtractionId: brandExtractionId ?? null,
      variant,
      adPrompt,
      userDirection: req.body?.userDirection,
      model: loadConfig().stage2Model,
    });
    res.json({ id, adPrompt });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- ad-prompt.routes`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/routes/ad-prompt.ts apps/backend/tests/ad-prompt.routes.test.ts
git commit -m "feat(backend): /api/ad-prompt id-lookup, perf memory, persist; returns { id }

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Wire `POST /api/render` — adPromptId lookup + Storage persistence

Accept `adPromptId | adPrompt`. Render via the (unchanged) pipeline, then persist the image to Storage and return `{ id, imageUrl }` (a signed URL, not the temporary KIE URL). Aspect ratio comes from the prompt's canvas; resolution from config.

**Files:**
- Modify: `apps/backend/src/routes/render.ts`
- Modify: `apps/backend/tests/render.routes.test.ts`

- [ ] **Step 1: Update the test mock + cases — `apps/backend/tests/render.routes.test.ts`**

Replace the supabase mock factory (lines 5–8) with:

```ts
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  getAdPrompt: vi.fn(),
  persistRenderedAd: vi.fn(),
}));
```

Replace the import from `../src/services/supabase.js`:

```ts
import { getUserFromToken, isApproved, getAdPrompt, persistRenderedAd } from "../src/services/supabase.js";
```

Replace the "returns 200" test and add a lookup case so the block reads:

```ts
  it("returns 200 with { id, imageUrl } (signed) for an approved user", async () => {
    approve();
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    vi.mocked(persistRenderedAd).mockResolvedValue({ id: "a1", imageUrl: "https://signed/x.png" });
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("a1");
    expect(res.body.imageUrl).toBe("https://signed/x.png");
    expect(getAdPrompt).not.toHaveBeenCalled(); // inline adPrompt
    const persistArgs = vi.mocked(persistRenderedAd).mock.calls[0][0];
    expect(persistArgs.userId).toBe("u1");
    expect(persistArgs.imageUrl).toBe("https://cdn/out.png");
    expect(persistArgs.aspectRatio).toBe("1:1");
  });

  it("resolves adPromptId before rendering", async () => {
    approve();
    vi.mocked(getAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x", canvas: { aspect_ratio: "9:16" } } });
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    vi.mocked(persistRenderedAd).mockResolvedValue({ id: "a2", imageUrl: "https://signed/y.png" });
    const res = await request(app)
      .post("/api/render")
      .set("Authorization", "Bearer ok")
      .send({ adPromptId: "p1", referenceAdImage: "data:image/png;base64,REF", logoImage: "data:image/png;base64,LOGO" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("a2");
    expect(getAdPrompt).toHaveBeenCalledWith("p1");
    expect(vi.mocked(persistRenderedAd).mock.calls[0][0].adPromptId).toBe("p1");
  });

  it("422s when adPromptId is not found", async () => {
    approve();
    vi.mocked(getAdPrompt).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/render")
      .set("Authorization", "Bearer ok")
      .send({ adPromptId: "missing", referenceAdImage: "x", logoImage: "y" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(runRender).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- render.routes`
Expected: FAIL — `res.body.id` undefined / signed url not returned.

- [ ] **Step 3: Update `apps/backend/src/routes/render.ts`**

```ts
import { Router } from "express";
import { runRender } from "../pipelines/render.js";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { getAdPrompt, persistRenderedAd } from "../services/supabase.js";
import { loadConfig } from "../config/index.js";

export const renderRouter = Router();

renderRouter.post("/render", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const adPromptId: string | undefined = req.body?.adPromptId;

    let adPrompt = req.body?.adPrompt;
    if (!adPrompt && adPromptId) {
      adPrompt = await getAdPrompt(adPromptId);
      if (!adPrompt) throw new ValidationError("adPromptId not found.");
    }

    const imageUrl = await runRender({
      adPrompt,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
    });

    const result = await persistRenderedAd({
      userId,
      imageUrl,
      prompt: JSON.stringify(adPrompt?.ad_prompt ?? adPrompt ?? {}),
      aspectRatio: adPrompt?.ad_prompt?.canvas?.aspect_ratio ?? null,
      resolution: loadConfig().kieResolution || null,
      adPromptId: adPromptId ?? null,
    });
    res.json({ id: result.id, imageUrl: result.imageUrl });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- render.routes`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/routes/render.ts apps/backend/tests/render.routes.test.ts
git commit -m "feat(backend): /api/render adPromptId lookup + Storage persist; returns { id, signed imageUrl }

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 8: Full suite, type-check, and a persistence note

**Files:**
- Modify: `apps/backend/src/services/supabase.ts` (header comment only)

- [ ] **Step 1: Run the full test suite**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the five gated e2e suites (extract, brand, auth, ad-prompt, render) show as skipped. Capture totals incl. skipped count.

- [ ] **Step 2: Type-check the whole backend**

Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Replace the now-stale Plan-5 placeholder comment in `apps/backend/src/services/supabase.ts`**

Replace the existing top comment:

```ts
// Lazily-created service-role client. Server-only: this key bypasses RLS and must
// never reach the browser. Plan 5 (persistence) extends this file — keep additions here.
```

with:

```ts
// Service-role Supabase client + typed persistence. Server-only: this key bypasses RLS,
// so every write sets user_id explicitly (never relies on auth.uid()). Reads/writes throw
// PersistenceError; lookups return null when absent. Never reaches the browser.
```

- [ ] **Step 4: Commit + push**

```bash
git add apps/backend/src/services/supabase.ts
git commit -m "docs(backend): refresh supabase.ts header now that persistence is wired

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Self-Review

**Spec coverage (master spec § Persistence & migration):**
- Adopt CLI migrations; old `schema.sql` becomes the baseline — Task 2 (baseline + 4 ordered files). ✓
- Expand → rename → backfill (contract deferred per spec "only after backend live") — Task 2. ✓
- `brands → brand_extractions` (+`measured_site_data`), `ads → generated_ads` (+`performance`), new `ad_prompts`, `generated_ads.ad_prompt_id` link — Task 2. ✓
- Wire pipelines to Supabase: brand persists (`{id}`), ad-prompt persists + `brandExtractionId|brandExtraction` lookup, render persists to Storage + `adPromptId|adPrompt` lookup, signed library URLs — Tasks 3–7. ✓
- Backend-assembled performance memory, derived by query, with request override honored — Task 4 (`assemblePerformanceMemory`) + Task 6 (route only assembles when not passed inline). ✓
- `user_id` from `req.user.id`, set explicitly under service-role — Tasks 3, 5, 6, 7. ✓
- Payload `schema_version` stamped on old rows; tolerant zod already in place — Task 2 backfill. ✓
- Endpoint contracts (`{id, brandExtraction}`, `{id, adPrompt}`, `{id, imageUrl}`) — Tasks 5–7 match the spec's endpoint table. ✓
- De-risk on a preview branch — Task 2 owner-action note (agent authors, owner applies). ✓

**Type consistency:** `saveBrandExtraction({userId,url,brandExtraction,measuredSiteData})→{id}`, `getBrandExtraction(id)→BrandExtraction|null`, `saveAdPrompt({userId,brandExtractionId,variant,adPrompt,userDirection,model})→{id}`, `getAdPrompt(id)→AdPrompt|null`, `persistRenderedAd({userId,imageUrl,prompt,aspectRatio,resolution,adPromptId?})→{id,imageUrl}`, `assemblePerformanceMemory({userId,brandExtractionId})→Array<{performance,ad_prompt}>|undefined` — defined in Tasks 3/4 and called with those exact names/shapes in Tasks 5/6/7 routes and asserted in their tests. `variant` is `'no_asset'|'w_asset'` everywhere. `PersistenceError` (`PERSISTENCE_ERROR`/500/`persistence`) defined Task 1, thrown in Tasks 3/4, mapped by existing `toHttpError`.

**Placeholders:** none — every code step has full content. The only "copy verbatim" is the baseline migration (Task 2 Step 1), pointing at the concrete existing `supabase/schema.sql`.

**Design notes:**
- Pipelines and run scripts are untouched: persistence orchestration lives in routes, so `runBrand`/`runAdPrompt`/`runRender` stay pure and independently runnable, and `run-*.ts` scripts keep printing without DB writes. This honors the master spec's "pipelines have no HTTP/Express awareness, independently runnable."
- `assemblePerformanceMemory` returns `undefined` until `generated_ads.performance` is populated (a future tagging path) — the query + wiring are in place now, matching the spec, and degrade to "no performance section" cleanly.
- Render persists `ad_prompt_id` (not `brand_id`); performance memory reaches the brand via the `ad_prompts!inner.brand_extraction_id` join, so it only includes ads rendered from a saved prompt (`adPromptId`) — an acceptable, spec-aligned limitation.
- Migrations are not executed here (no local DB; the Supabase CLI is intentionally not installed). Verification of the SQL is the owner applying it to a preview branch (Task 2 note).
