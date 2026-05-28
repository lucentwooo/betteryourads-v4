# Reference Ad Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two curated reference-ad libraries (with-product-asset / no-product-asset) that approved users browse in the workbench and that an admin manages, while keeping the existing per-ad upload.

**Architecture:** A new `reference_ads` Postgres table + private `reference-ads` Storage bucket hold curated references, written only through admin endpoints (service-role key) and read through a single user endpoint that returns signed URLs. The workbench's Stage-2 `PickRef` gains a library grid (variant auto-derived from whether a product asset is present) that, on click, loads the image as a base64 data URL and reuses the existing `SET_REF` action — so Stages 2/3 are unchanged. A new admin page manages each library.

**Tech Stack:** TypeScript, Express, `@supabase/supabase-js` (service-role), zod (`@bya/shared`), React + Vite + react-router, vitest + supertest (backend) / vitest + Testing Library (web).

**Branch:** Create `feature/reference-ad-library` from `dev` before Task 1 (the user will do this / it is done via the worktree skill at execution time).

**Conventions to follow (already in the codebase):**
- Backend route tests mock `../src/services/supabase.js` entirely and drive the real `createServer()` with supertest (see `apps/backend/tests/admin.routes.test.ts`, `library.routes.test.ts`).
- All Supabase access is server-side through the service-role client (`admin()` in `services/supabase.ts`); RLS is defensive only. Reads return `null`/throw `PersistenceError`.
- Shared zod schemas live one-per-file in `packages/shared/src/` and are re-exported from `index.ts`.
- Frontend API calls go through the `api` object in `apps/web/src/api/client.ts`.
- **Frontend styling/UX for Tasks 8 and 9 MUST use the `ui-ux-pro-max` skill** (invoke it before writing the JSX/CSS for those tasks).

---

## File Structure

- `packages/shared/src/reference-ad.ts` (create) — `ReferenceAdVariant`, `ReferenceAd` schema/type.
- `packages/shared/src/index.ts` (modify) — re-export the new module.
- `supabase/migrations/20260528120500_reference_ads.sql` (create) — table + bucket + RLS. Hand-applied.
- `apps/backend/src/services/supabase.ts` (modify) — `listReferenceAds`, `createReferenceAd`, `deleteReferenceAd`.
- `apps/backend/src/routes/reference-ads.ts` (create) — `GET /api/reference-ads`.
- `apps/backend/src/routes/admin.ts` (modify) — `POST` / `DELETE /api/admin/reference-ads`.
- `apps/backend/src/server.ts` (modify) — mount the read router.
- `apps/backend/tests/reference-ads.routes.test.ts` (create) — read route.
- `apps/backend/tests/admin.routes.test.ts` (modify) — admin write routes.
- `apps/web/src/api/client.ts` (modify) — `getReferenceAds`, `adminCreateReferenceAd`, `adminDeleteReferenceAd`.
- `apps/web/src/api/client.test.ts` (modify) — new client methods.
- `apps/web/src/workbench/Workbench.tsx` (modify) — library grid + hint in `PickRef`.
- `apps/web/src/workbench/Workbench.test.tsx` (modify) — library picker behavior.
- `apps/web/src/admin/ReferenceAdsAdmin.tsx` (create) — admin management page.
- `apps/web/src/admin/ReferenceAdsAdmin.test.tsx` (create) — admin page behavior.
- `apps/web/src/App.tsx` (modify) — route `/admin/reference-ads`.
- `apps/web/src/shell/AppShell.tsx` (modify) — admin nav link + crumb.
- `docs/FEATURES.md` (modify) — one-line feature entry.

**Design note (new files):** `ReferenceAdsAdmin.tsx` is a separate page rather than a section inside `AdminDashboard.tsx` because that file is already ~260 lines and focused on accounts; a sibling page keeps each file single-purpose and matches the existing one-page-per-route admin pattern (`/admin` → Accounts). The read router is its own file to mirror `library.ts` (user reads) vs `admin.ts` (admin writes).

---

## Task 1: Shared `ReferenceAd` schema

**Files:**
- Create: `packages/shared/src/reference-ad.ts`
- Modify: `packages/shared/src/index.ts:5` (add export after `./library.js`)

- [ ] **Step 1: Write the schema file**

Create `packages/shared/src/reference-ad.ts`:

```typescript
import { z } from "zod";

/** Which library a curated reference belongs to. `with_asset` references are designed to
 *  feature a product image; `no_asset` references don't use one. Mirrors the Stage-2 prompt
 *  variant selection in the backend. */
export const ReferenceAdVariant = z.enum(["with_asset", "no_asset"]);
export type ReferenceAdVariant = z.infer<typeof ReferenceAdVariant>;

/** A curated reference ad as returned to the client (GET /api/reference-ads, and the rows the
 *  admin endpoints create). `url` is a freshly-signed Storage URL; the storage path stays
 *  server-side. */
export const ReferenceAd = z.object({
  id: z.string(),
  variant: ReferenceAdVariant,
  label: z.string().nullable(),
  url: z.string(),
  createdAt: z.string(),
});
export type ReferenceAd = z.infer<typeof ReferenceAd>;
```

- [ ] **Step 2: Re-export from the package index**

In `packages/shared/src/index.ts`, add after line 5 (`export * from "./library.js";`):

```typescript
export * from "./reference-ad.js";
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build -w @bya/shared`
Expected: PASS (tsc emits with no errors). If `@bya/shared` has no `build` script, run `npm run build -w @bya/web` which type-checks against the shared package; expected PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/reference-ad.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ReferenceAd schema and variant"
```

---

## Task 2: Migration SQL (hand-applied)

**Files:**
- Create: `supabase/migrations/20260528120500_reference_ads.sql`

This migration is authored as a file but **applied by hand** (pasted into the Supabase dashboard SQL editor) — do not run `supabase db push`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260528120500_reference_ads.sql`:

```sql
-- Curated reference-ad libraries. Two variants: references built around a product asset, and
-- references that don't use one. Rows are written only by the admin endpoints via the
-- service-role key, and read back through the service-role client, so RLS is left with no
-- policies (service role bypasses RLS; anon/auth clients get no direct access).
create table if not exists public.reference_ads (
  id           uuid primary key default gen_random_uuid(),
  variant      text not null check (variant in ('with_asset', 'no_asset')),
  label        text,
  storage_path text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.reference_ads enable row level security;

-- Private bucket for the reference images (idempotent).
insert into storage.buckets (id, name, public)
values ('reference-ads', 'reference-ads', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Verify the file exists and is ordered last**

Run: `ls supabase/migrations`
Expected: `20260528120500_reference_ads.sql` sorts after `20260528120400_backfill.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528120500_reference_ads.sql
git commit -m "feat(db): reference_ads table and storage bucket migration"
```

- [ ] **Step 4: Hand off to the owner (not a code step)**

Tell the owner: paste the contents of `supabase/migrations/20260528120500_reference_ads.sql` into the Supabase dashboard → SQL Editor → Run. Verify with:
`select table_name from information_schema.tables where table_name = 'reference_ads';`

---

## Task 3: Supabase service functions

**Files:**
- Modify: `apps/backend/src/services/supabase.ts` (add new functions; import `ReferenceAd`/`ReferenceAdVariant` types at the top)

These are exercised by the route tests in Tasks 4–5 (the codebase tests storage/service logic at the route boundary, mocking this module — see existing `*.routes.test.ts`). No standalone unit test here.

- [ ] **Step 1: Extend the shared-type import**

In `apps/backend/src/services/supabase.ts`, change line 3 to also import the new types:

```typescript
import { BrandExtraction, AdPrompt, type BrandSummary, type AdSummary, type BrandDetail, type AdminUser, type ReferenceAd, type ReferenceAdVariant } from "@bya/shared";
```

- [ ] **Step 2: Add the three functions at the end of the file**

Append to `apps/backend/src/services/supabase.ts`:

```typescript
/** Map a variant to its folder prefix within the `reference-ads` bucket. */
function refVariantPrefix(variant: ReferenceAdVariant): "with-asset" | "no-asset" {
  return variant === "with_asset" ? "with-asset" : "no-asset";
}

/** Decode a `data:<mime>;base64,<data>` URL to bytes + content type. Throws ValidationError on
 *  a non-image or malformed data URL so the admin gets a clear 422. */
function decodeImageDataUrl(dataUrl: string): { bytes: Buffer; contentType: string } {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new ValidationError("Expected a base64 image data URL.");
  return { bytes: Buffer.from(m[2], "base64"), contentType: m[1] };
}

/** All curated references for one variant, newest first, each with a freshly-signed URL.
 *  Rows whose URL can't be signed are skipped (a missing file shouldn't break the grid). */
export async function listReferenceAds(variant: ReferenceAdVariant): Promise<ReferenceAd[]> {
  const { data, error } = await admin()
    .from("reference_ads")
    .select("id, variant, label, storage_path, created_at")
    .eq("variant", variant)
    .order("created_at", { ascending: false });
  if (error) throw new PersistenceError(`Listing reference ads failed: ${error.message}`);
  type Row = { id: string; variant: ReferenceAdVariant; label: string | null; storage_path: string; created_at: string };
  const rows = (data ?? []) as unknown as Row[];
  const out: ReferenceAd[] = [];
  for (const r of rows) {
    const signed = await admin().storage.from("reference-ads").createSignedUrl(r.storage_path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data) continue;
    out.push({ id: r.id, variant: r.variant, label: r.label, url: signed.data.signedUrl, createdAt: r.created_at });
  }
  return out;
}

/** Upload a curated reference image to the bucket and insert its row. On a failed insert the
 *  just-uploaded object is removed so no orphan file is left. Returns the row with a signed URL. */
export async function createReferenceAd(args: {
  variant: ReferenceAdVariant;
  label: string | null;
  dataUrl: string;
  createdBy: string;
}): Promise<ReferenceAd> {
  const { bytes, contentType } = decodeImageDataUrl(args.dataUrl);
  const storagePath = `${refVariantPrefix(args.variant)}/${randomUUID()}.png`;
  const up = await admin().storage.from("reference-ads").upload(storagePath, bytes, { contentType, upsert: false });
  if (up.error) throw new PersistenceError(`Uploading the reference ad failed: ${up.error.message}`);

  const { data, error } = await admin()
    .from("reference_ads")
    .insert({ variant: args.variant, label: args.label, storage_path: storagePath, created_by: args.createdBy })
    .select("id, created_at")
    .single();
  if (error || !data) {
    const removed = await admin().storage.from("reference-ads").remove([storagePath]);
    const suffix = removed.error ? ` (cleanup of orphaned upload also failed: ${removed.error.message})` : "";
    throw new PersistenceError(`Saving the reference ad failed: ${error?.message ?? "no row"}${suffix}`);
  }
  const row = data as unknown as { id: string; created_at: string };
  const signed = await admin().storage.from("reference-ads").createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) throw new PersistenceError(`Signing the reference ad URL failed: ${signed.error?.message ?? "no url"}`);
  return { id: row.id, variant: args.variant, label: args.label, url: signed.data.signedUrl, createdAt: row.created_at };
}

/** Remove a curated reference: delete its storage object (best-effort if already gone) then
 *  the row. Throws PersistenceError if the row delete fails. */
export async function deleteReferenceAd(id: string): Promise<void> {
  const { data, error } = await admin().from("reference_ads").select("storage_path").eq("id", id).single();
  if (error || !data) throw new PersistenceError(`Reference ad not found: ${error?.message ?? "no row"}`);
  const storagePath = (data as { storage_path: string }).storage_path;
  await admin().storage.from("reference-ads").remove([storagePath]); // best-effort; ignore missing file
  const del = await admin().from("reference_ads").delete().eq("id", id);
  if (del.error) throw new PersistenceError(`Deleting the reference ad failed: ${del.error.message}`);
}
```

- [ ] **Step 3: Add the `ValidationError` import if missing**

`decodeImageDataUrl` uses `ValidationError`. Confirm the top of the file imports it from `../lib/errors.js`. Line 4 currently imports only `PersistenceError`. Change it to:

```typescript
import { PersistenceError, ValidationError } from "../lib/errors.js";
```

- [ ] **Step 4: Verify the backend type-checks**

Run: `npm run build -w @bya/backend` (or `npx tsc --noEmit -p apps/backend` if there is no build script)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/supabase.ts
git commit -m "feat(backend): reference-ad storage/service functions"
```

---

## Task 4: Read route `GET /api/reference-ads`

**Files:**
- Create: `apps/backend/src/routes/reference-ads.ts`
- Modify: `apps/backend/src/server.ts:11` (import) and `:23` (mount)
- Test: `apps/backend/tests/reference-ads.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/tests/reference-ads.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listReferenceAds: vi.fn(),
}));

import { getUserFromToken, isApproved, listReferenceAds } from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("GET /api/reference-ads", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/reference-ads?variant=no_asset");
    expect(res.status).toBe(401);
    expect(listReferenceAds).not.toHaveBeenCalled();
  });

  it("422s on a missing/invalid variant", async () => {
    approve();
    const res = await request(app).get("/api/reference-ads?variant=bogus").set("Authorization", "Bearer ok");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(listReferenceAds).not.toHaveBeenCalled();
  });

  it("returns references for the requested variant", async () => {
    approve();
    vi.mocked(listReferenceAds).mockResolvedValue([
      { id: "r1", variant: "with_asset", label: "Hero", url: "https://signed/r1.png", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    const res = await request(app).get("/api/reference-ads?variant=with_asset").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe("r1");
    expect(listReferenceAds).toHaveBeenCalledWith("with_asset");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @bya/backend -- reference-ads.routes`
Expected: FAIL (route not mounted → 404, or module not found).

- [ ] **Step 3: Write the route**

Create `apps/backend/src/routes/reference-ads.ts`:

```typescript
import { Router } from "express";
import { ReferenceAdVariant } from "@bya/shared";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { listReferenceAds } from "../services/supabase.js";

export const referenceAdsRouter = Router();

referenceAdsRouter.get("/reference-ads", requireApprovedUser, async (req, res) => {
  try {
    const parsed = ReferenceAdVariant.safeParse(req.query.variant);
    if (!parsed.success) throw new ValidationError("`variant` must be 'with_asset' or 'no_asset'.");
    res.json(await listReferenceAds(parsed.data));
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Mount the router in `server.ts`**

In `apps/backend/src/server.ts`, add the import after line 11 (`import { adminRouter } ...`):

```typescript
import { referenceAdsRouter } from "./routes/reference-ads.js";
```

And add the mount after line 23 (`app.use("/api", adminRouter);`):

```typescript
  app.use("/api", referenceAdsRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w @bya/backend -- reference-ads.routes`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/reference-ads.ts apps/backend/src/server.ts apps/backend/tests/reference-ads.routes.test.ts
git commit -m "feat(backend): GET /api/reference-ads read route"
```

---

## Task 5: Admin write routes `POST` / `DELETE /api/admin/reference-ads`

**Files:**
- Modify: `apps/backend/src/routes/admin.ts`
- Test: `apps/backend/tests/admin.routes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/backend/tests/admin.routes.test.ts`, extend the `vi.mock` factory (top of file) to add the two new service functions:

```typescript
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listAllUsers: vi.fn(),
  deleteUser: vi.fn(),
  setUserApproved: vi.fn(),
  createReferenceAd: vi.fn(),
  deleteReferenceAd: vi.fn(),
}));
```

Update the import line to include them:

```typescript
import { getUserFromToken, isApproved, setUserApproved, createReferenceAd, deleteReferenceAd } from "../src/services/supabase.js";
```

Then append these describe blocks to the file:

```typescript
describe("POST /api/admin/reference-ads", () => {
  const body = { variant: "with_asset", label: "Hero", dataUrl: "data:image/png;base64,AAAA" };

  it("creates a reference for an admin", async () => {
    asAdmin();
    vi.mocked(createReferenceAd).mockResolvedValue({ id: "r1", variant: "with_asset", label: "Hero", url: "https://signed/r1.png", createdAt: "2026-05-28T00:00:00Z" });
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("r1");
    expect(createReferenceAd).toHaveBeenCalledWith({ variant: "with_asset", label: "Hero", dataUrl: "data:image/png;base64,AAAA", createdBy: "admin-id" });
  });

  it("422s on an invalid variant", async () => {
    asAdmin();
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send({ ...body, variant: "nope" });
    expect(res.status).toBe(422);
    expect(createReferenceAd).not.toHaveBeenCalled();
  });

  it("422s when dataUrl is missing", async () => {
    asAdmin();
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send({ variant: "no_asset" });
    expect(res.status).toBe(422);
    expect(createReferenceAd).not.toHaveBeenCalled();
  });

  it("403s for a non-admin", async () => {
    asNonAdmin();
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(403);
    expect(createReferenceAd).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/reference-ads/:id", () => {
  it("deletes a reference for an admin", async () => {
    asAdmin();
    vi.mocked(deleteReferenceAd).mockResolvedValue(undefined);
    const res = await request(app).delete("/api/admin/reference-ads/r1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(deleteReferenceAd).toHaveBeenCalledWith("r1");
  });

  it("403s for a non-admin", async () => {
    asNonAdmin();
    const res = await request(app).delete("/api/admin/reference-ads/r1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(403);
    expect(deleteReferenceAd).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @bya/backend -- admin.routes`
Expected: FAIL (new routes return 404; `createReferenceAd`/`deleteReferenceAd` undefined).

- [ ] **Step 3: Implement the routes**

In `apps/backend/src/routes/admin.ts`, update imports:

```typescript
import { ReferenceAdVariant } from "@bya/shared";
import { listAllUsers, deleteUser, setUserApproved, createReferenceAd, deleteReferenceAd } from "../services/supabase.js";
```

Add these handlers to `adminRouter` (after the existing ones):

```typescript
adminRouter.post("/admin/reference-ads", requireApprovedUser, requireAdmin, async (req, res) => {
  try {
    const variant = ReferenceAdVariant.safeParse(req.body?.variant);
    if (!variant.success) throw new ValidationError("`variant` must be 'with_asset' or 'no_asset'.");
    const dataUrl = req.body?.dataUrl;
    if (typeof dataUrl !== "string" || dataUrl.length === 0) throw new ValidationError("`dataUrl` is required.");
    const rawLabel = req.body?.label;
    const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : null;
    const created = await createReferenceAd({ variant: variant.data, label, dataUrl, createdBy: req.user!.id });
    res.json(created);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

adminRouter.delete("/admin/reference-ads/:id", requireApprovedUser, requireAdmin, async (req, res) => {
  try {
    await deleteReferenceAd(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

(`ValidationError` is already imported in `admin.ts` line 2.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @bya/backend -- admin.routes`
Expected: PASS (original tests + 6 new).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/admin.ts apps/backend/tests/admin.routes.test.ts
git commit -m "feat(backend): admin create/delete reference-ad routes"
```

---

## Task 6: Frontend API client methods

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test**

First open `apps/web/src/api/client.test.ts` to match its existing `fetch`-mock style, then add a block following that same style. The expected shape:

```typescript
describe("reference ads", () => {
  it("getReferenceAds requests the variant", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: "r1", variant: "no_asset", label: null, url: "u", createdAt: "t" }]), { status: 200 }),
    );
    const out = await api.getReferenceAds("no_asset");
    expect(fetchMock).toHaveBeenCalledWith("/api/reference-ads?variant=no_asset", expect.objectContaining({ method: "GET" }));
    expect(out[0].id).toBe("r1");
  });

  it("adminDeleteReferenceAd issues a DELETE", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await api.adminDeleteReferenceAd("r1");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/reference-ads/r1", expect.objectContaining({ method: "DELETE" }));
  });
});
```

If `client.test.ts` mocks `fetch` differently (e.g. a module-level helper), mirror that approach instead — the assertions (URL + method) are what matter.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @bya/web -- client`
Expected: FAIL (`api.getReferenceAds` is not a function).

- [ ] **Step 3: Implement the client methods**

In `apps/web/src/api/client.ts`, add `ReferenceAd`, `ReferenceAdVariant` to the type import from `@bya/shared` (the import block at the top), then add to the `api` object (after `setUserApproval`):

```typescript
  getReferenceAds: (variant: ReferenceAdVariant) =>
    request<ReferenceAd[]>(`/api/reference-ads?variant=${variant}`),
  adminCreateReferenceAd: (variant: ReferenceAdVariant, dataUrl: string, label: string | null) =>
    request<ReferenceAd>("/api/admin/reference-ads", { variant, dataUrl, label }),
  adminDeleteReferenceAd: (id: string) =>
    request<{ ok: true }>(`/api/admin/reference-ads/${id}`, undefined, "DELETE"),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @bya/web -- client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/client.ts apps/web/src/api/client.test.ts
git commit -m "feat(web): reference-ad API client methods"
```

---

## Task 7: Workbench library picker (Stage 2)

**Files:**
- Modify: `apps/web/src/workbench/Workbench.tsx` (the `PickRef` component)
- Test: `apps/web/src/workbench/Workbench.test.tsx`

**Behavior:** In `PickRef`, the existing "Reference ad" `Dropzone` is presented as the primary input. Below it, a **library grid** is the secondary "or browse our references" option. The grid fetches `api.getReferenceAds(variant)` where `variant = state.productAsset ? "with_asset" : "no_asset"`, re-fetching whenever `state.productAsset` toggles between present/absent. Clicking a thumbnail fetches that image URL, converts it to a base64 data URL, and dispatches `{ type: "SET_REF", dataUrl }` — identical to an upload. A **hint line** sits with the grid (copy below). The "Make my ad" button stays disabled while `!state.refImage` (this is the required-reference enforcement — generation can never proceed without one).

**Note:** No reducer/state change is needed — library selection reuses `SET_REF`. Don't add a new action.

- [ ] **Step 1: Invoke the styling skill**

Before writing JSX/CSS, invoke the `ui-ux-pro-max` skill and apply its guidance to the grid + hint (thumbnail grid, selected state, secondary-affordance treatment). Keep using existing CSS variables/classes (`stage`, `field`, `hint`, `btn`) for consistency.

- [ ] **Step 2: Write the failing test**

In `apps/web/src/workbench/Workbench.test.tsx`, add a test that, in the `pick-ref` stage, the no-asset hint text renders and the library is requested with `no_asset`. Mirror the file's existing render/mock setup (it wraps `<Workbench />` in `MemoryRouter` and mocks `../api/client`). Expected assertions:

```typescript
// api.getReferenceAds mocked to resolve []
expect(api.getReferenceAds).toHaveBeenCalledWith("no_asset");
expect(screen.getByText(/Add a product asset/i)).toBeInTheDocument();
```

To reach `pick-ref` directly, use the existing brand-preset path the test file already uses (`MemoryRouter initialEntries={["/create?brandId=b1"]}` with `api.getBrand` mocked), matching the pattern at `Workbench.test.tsx:120`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @bya/web -- Workbench`
Expected: FAIL (hint text / getReferenceAds call absent).

- [ ] **Step 4: Implement the picker in `PickRef`**

Add a small fetch helper near the top of `Workbench.tsx` (module scope):

```typescript
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not load reference image."));
    reader.readAsDataURL(blob);
  });
}
```

Inside `PickRef`, derive the variant and load the library:

```typescript
import { useEffect, useState } from "react"; // ensure these are imported at top of file
import type { ReferenceAd } from "@bya/shared";
// ...
const variant: "with_asset" | "no_asset" = state.productAsset ? "with_asset" : "no_asset";
const [library, setLibrary] = useState<ReferenceAd[]>([]);
const [libError, setLibError] = useState<string | null>(null);
useEffect(() => {
  let active = true;
  setLibError(null);
  api.getReferenceAds(variant)
    .then((rows) => { if (active) setLibrary(rows); })
    .catch(() => { if (active) { setLibrary([]); setLibError("Couldn't load the reference library — upload your own above."); } });
  return () => { active = false; };
}, [variant]);
```

Then, directly below the existing "Reference ad" `Dropzone` (keep that Dropzone as the primary input), render the secondary library section:

```tsx
<div className="field" style={{ marginBottom: 0 }}>
  <span className="hint">
    {state.productAsset
      ? "Or browse our references — showing references designed to feature your product asset."
      : "Or browse our references — these don't use a product image. Add a product asset above and a different library, built around your product, will appear here."}
  </span>
  {libError && <span className="hint" style={{ color: "var(--bya-oxblood)" }}>{libError}</span>}
  <div className="ref-library-grid">
    {library.map((ref) => (
      <button
        type="button"
        key={ref.id}
        className="ref-thumb"
        onClick={() => { void urlToDataUrl(ref.url).then((d) => dispatch({ type: "SET_REF", dataUrl: d })); }}
        aria-label={ref.label ?? "Reference ad"}
      >
        <img src={ref.url} alt={ref.label ?? "Reference ad"} />
      </button>
    ))}
  </div>
</div>
```

Add minimal styles for `.ref-library-grid` / `.ref-thumb` per the `ui-ux-pro-max` guidance (grid of small thumbnails; the existing global stylesheet is where other component classes live — follow that file's conventions). The "Make my ad" button's existing `disabled={!(state.refImage && state.logoImage) || capped}` already enforces the required reference; leave it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w @bya/web -- Workbench`
Expected: PASS.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev -w @bya/web` (with the backend running). Analyze a brand, confirm: no product asset → no-asset library + its hint; add a product asset → grid swaps to the with-asset library + its hint; clicking a thumbnail fills the reference preview; "Make my ad" stays disabled until a reference (uploaded or picked) is present.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/workbench/Workbench.tsx apps/web/src/workbench/Workbench.test.tsx
git commit -m "feat(web): reference-ad library picker in Stage 2"
```

---

## Task 8: Admin reference-ads management page

**Files:**
- Create: `apps/web/src/admin/ReferenceAdsAdmin.tsx`
- Test: `apps/web/src/admin/ReferenceAdsAdmin.test.tsx`
- Modify: `apps/web/src/App.tsx` (add route), `apps/web/src/shell/AppShell.tsx` (nav link + crumb)

- [ ] **Step 1: Invoke the styling skill**

Invoke `ui-ux-pro-max` and apply its guidance to the page (two variant tabs, thumbnail grid, upload control, per-item delete). Reuse existing admin classes (`section-head`, `btn`, `badge`, `empty`, modal scrim) from `AdminDashboard.tsx` for visual consistency.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/admin/ReferenceAdsAdmin.test.tsx`. Mirror the mocking style used in `apps/web/src/admin/` tests / `Library.test.tsx` (mock `../api/client`, mock `useAuth` to return the admin email). Assert that on mount it loads the default tab's library and renders an empty state when none exist:

```typescript
// api.getReferenceAds mocked to resolve []
expect(api.getReferenceAds).toHaveBeenCalledWith("with_asset");
expect(await screen.findByText(/No reference ads/i)).toBeInTheDocument();
```

(Default the page to the `with_asset` tab.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -w @bya/web -- ReferenceAdsAdmin`
Expected: FAIL (module doesn't exist).

- [ ] **Step 4: Implement the page**

Create `apps/web/src/admin/ReferenceAdsAdmin.tsx` with:
- An admin-email guard identical to `AdminDashboard.tsx:88-95` (render "Not authorized" otherwise).
- State: `variant` tab (`"with_asset" | "no_asset"`, default `with_asset`), `items: ReferenceAd[]`, `loading`, `error`, per-action busy flags.
- On mount and on tab change: `api.getReferenceAds(variant)` → `setItems`.
- Upload control: a file input → `fileToDataUrl` (import from `../workbench/fileToDataUrl`) → optional label text input → `api.adminCreateReferenceAd(variant, dataUrl, label)` → prepend the returned item.
- Grid of thumbnails, each with a delete button → `api.adminDeleteReferenceAd(id)` → remove from `items` (reuse the type-to-confirm modal pattern from `AdminDashboard.tsx` only if you want symmetry; a simple confirm button is acceptable here since references aren't user data).
- Empty state ("No reference ads in this library yet.") and error handling mirroring `AdminDashboard.tsx`.

Use the exact `ReferenceAd`/`ReferenceAdVariant` types from `@bya/shared`.

- [ ] **Step 5: Add the route**

In `apps/web/src/App.tsx`, import the page and add a route after `/admin` (line 20):

```tsx
import ReferenceAdsAdmin from "./admin/ReferenceAdsAdmin";
// ...
<Route path="/admin/reference-ads" element={<ReferenceAdsAdmin />} />
```

- [ ] **Step 6: Add the nav link + crumb**

In `apps/web/src/shell/AppShell.tsx`: add `"/admin/reference-ads": "Reference ads"` to the `CRUMBS` map (after line 15), and inside the `isAdmin` nav section (after the Accounts `NavLink`, line 64) add:

```tsx
<NavLink to="/admin/reference-ads" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
  <IconGrid />
  <span>Reference ads</span>
</NavLink>
```

(`IconGrid` is already imported in `AppShell.tsx:3`.)

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -w @bya/web -- ReferenceAdsAdmin`
Expected: PASS.

- [ ] **Step 8: Manually verify in the browser**

As the admin account, open `/admin/reference-ads`: upload an image to each tab, confirm it appears, delete it, confirm it disappears; then in the workbench confirm the uploaded reference shows up in the matching library.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/admin/ReferenceAdsAdmin.tsx apps/web/src/admin/ReferenceAdsAdmin.test.tsx apps/web/src/App.tsx apps/web/src/shell/AppShell.tsx
git commit -m "feat(web): admin reference-ad library management page"
```

---

## Task 9: Full verification + feature catalog

**Files:**
- Modify: `docs/FEATURES.md`

- [ ] **Step 1: Run the whole backend + web suites**

Run: `npm test -w @bya/backend` then `npm test -w @bya/web`
Expected: all pass (gated e2e tests skip without keys).

- [ ] **Step 2: Type-check / build the web app**

Run: `npm run build -w @bya/web`
Expected: PASS.

- [ ] **Step 3: Add the feature-catalog entry**

Open `docs/FEATURES.md`, find the section that lists user-facing features / routes, and add a one-line entry, e.g. under the relevant heading:

```
- Reference ad library — curated with-asset / no-asset reference libraries, admin-managed, pickable in Stage 2 (`/api/reference-ads`, `/admin/reference-ads`).
```

Match the file's existing bullet style/section names (read it first).

- [ ] **Step 4: Commit**

```bash
git add docs/FEATURES.md
git commit -m "docs: catalog reference ad library feature"
```

- [ ] **Step 5: Final reminder (not a code step)**

Confirm the owner has applied `20260528120500_reference_ads.sql` in the Supabase dashboard before this is used against a real environment — the read/admin routes will error until the table and bucket exist.

---

## Self-Review

- **Spec coverage:** two variant libraries (Tasks 1–8), curated + user upload kept (Task 7 keeps the Dropzone primary; library secondary), admin upload UI (Task 8), auto variant switching following product asset (Task 7), flat thumbnail grids (Tasks 7–8), required reference / no silent skip (Task 7 keeps the disabled-button enforcement), hint mentioning the asset-variant library (Task 7 copy), storage bucket + table + signed URLs (Tasks 2–3), shared types (Task 1), FEATURES.md sync (Task 9). All covered.
- **Type consistency:** `ReferenceAdVariant` values are `"with_asset" | "no_asset"` everywhere (shared, service, routes, client, UI); bucket prefixes `with-asset` / `no-asset` are an internal mapping in `refVariantPrefix` only. Service fns `listReferenceAds`/`createReferenceAd`/`deleteReferenceAd` have identical signatures in their definition (Task 3), mocks (Tasks 4–5), and calls (Tasks 4–6). Client methods `getReferenceAds`/`adminCreateReferenceAd`/`adminDeleteReferenceAd` match between definition (Task 6) and use (Tasks 7–8).
- **Placeholders:** none — every code step shows the code. The only intentionally-described-not-shown pieces are CSS specifics and the admin page's JSX body, which are delegated to the `ui-ux-pro-max` skill per the user's explicit instruction; their behavior, props, types, and API calls are fully specified.
