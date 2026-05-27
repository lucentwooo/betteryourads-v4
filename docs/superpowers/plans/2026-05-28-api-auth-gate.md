# API Auth Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the backend's cost endpoints behind a verified Supabase Auth token for an **approved** user, and expose the public Supabase config so a future frontend can wire up login in one step. No login UI ships in this slice.

**Architecture:** A server-only Supabase service-role client exposes two functions (`getUserFromToken`, `isApproved`). A `requireApprovedUser` Express middleware uses them to 401 on a missing/invalid token, 403 on an unapproved user, and otherwise attach `req.user` and continue. It is applied to the only cost route that exists today (`/api/extract`) and is ready for `brand`/`ad-prompt`/`render` when those routes are created. `GET /api/config` gains `supabaseUrl` + `supabaseAnonKey` (browser-safe). The service-role key never leaves the backend.

**Tech Stack:** TypeScript (ESM), Express 4, `@supabase/supabase-js` (new), Vitest, supertest.

Spec: `docs/superpowers/specs/2026-05-28-api-auth-gate-design.md`. This is Spec ① of 3 (② render reliability, ③ generation quota follow). It is independent of the in-flight master Plans 3–5.

---

## File Structure

Created in this plan:

```
apps/backend/src/services/supabase.ts                NEW  service-role client + getUserFromToken/isApproved
apps/backend/src/middleware/require-approved-user.ts NEW  the gate + Express Request augmentation
apps/backend/tests/supabase.service.test.ts          NEW  unit (mocks @supabase/supabase-js)
apps/backend/tests/auth.middleware.test.ts           NEW  unit (mocks the supabase service)
apps/backend/tests/auth.e2e.test.ts                  NEW  gated real smoke (BYA_AUTH_E2E=1)
```

Modified in this plan:

```
apps/backend/src/lib/errors.ts        EDIT  add AuthError, ForbiddenError; Stage += 'auth'
apps/backend/src/config/index.ts      EDIT  add supabaseUrl + supabaseAnonKey to AppConfig/loadConfig
apps/backend/src/routes/extract.ts    EDIT  apply requireApprovedUser
apps/backend/tests/errors.test.ts     EDIT  cover the two new errors
apps/backend/tests/config.test.ts     EDIT  assert supabase url/anon present
apps/backend/tests/routes.test.ts     EDIT  /extract now requires auth (stub approved user + 401 case)
apps/backend/package.json             EDIT  add @supabase/supabase-js dependency
```

**Coordination note:** `services/supabase.ts` is *created* here and later *extended* by the master Plan 5 (persistence). This slice owns its creation with exactly the two auth functions; Plan 5 appends. Do not let both create it.

---

## Task 1: Typed auth errors

**Files:**
- Modify: `apps/backend/src/lib/errors.ts`
- Test: `apps/backend/tests/errors.test.ts`

- [ ] **Step 1: Add the failing test cases**

Append inside the existing `describe("errors", () => { ... })` block in `apps/backend/tests/errors.test.ts` (and add `AuthError, ForbiddenError` to the import from `../src/lib/errors.js`):

```ts
  it("AuthError carries 401 + auth stage", () => {
    const e = new AuthError("nope");
    expect(e).toBeInstanceOf(AppError);
    expect(e.status).toBe(401);
    expect(e.code).toBe("AUTH_REQUIRED");
    expect(e.stage).toBe("auth");
  });

  it("ForbiddenError maps to 403 NOT_APPROVED via toHttpError", () => {
    expect(toHttpError(new ForbiddenError("pending"))).toEqual({
      status: 403,
      body: { error: { code: "NOT_APPROVED", message: "pending", stage: "auth" } },
    });
  });
```

The top import line becomes:

```ts
import { AppError, ExtractionError, AuthError, ForbiddenError, toHttpError } from "../src/lib/errors.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: FAIL — `AuthError`/`ForbiddenError` are not exported.

- [ ] **Step 3: Add the errors**

In `apps/backend/src/lib/errors.ts`, extend the `Stage` union and add the two classes after `OpenRouterError`:

```ts
export type Stage = "extract" | "brand" | "ad-prompt" | "render" | "validation" | "auth";
```

```ts
export class AuthError extends AppError {
  constructor(message: string) {
    super(message, "AUTH_REQUIRED", 401, "auth");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, "NOT_APPROVED", 403, "auth");
  }
}
```

(`toHttpError` is unchanged — it already maps any `AppError`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/tests/errors.test.ts
git commit -m "feat(backend): AuthError + ForbiddenError typed errors"
git push
```

---

## Task 2: Supabase service-role client

**Files:**
- Create: `apps/backend/src/services/supabase.ts`
- Modify: `apps/backend/package.json` (add dependency)
- Test: `apps/backend/tests/supabase.service.test.ts`

- [ ] **Step 1: Add the dependency**

Run (from repo root): `npm install --workspace @bya/backend @supabase/supabase-js@^2.45.0`
Expected: adds `@supabase/supabase-js` to `apps/backend/package.json` dependencies; no errors.

- [ ] **Step 2: Write the failing test**

`apps/backend/tests/supabase.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser }, from }),
}));

import { getUserFromToken, isApproved } from "../src/services/supabase.js";

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.clearAllMocks(); // clears call history; keeps the chain factory implementations
});

describe("getUserFromToken", () => {
  it("returns id + email for a valid token", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } }, error: null });
    expect(await getUserFromToken("tok")).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("returns null when Supabase reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await getUserFromToken("tok")).toBeNull();
  });
});

describe("isApproved", () => {
  it("is true when the profile row has approved = true", async () => {
    single.mockResolvedValue({ data: { approved: true }, error: null });
    expect(await isApproved("u1")).toBe(true);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("is false when approved = false", async () => {
    single.mockResolvedValue({ data: { approved: false }, error: null });
    expect(await isApproved("u1")).toBe(false);
  });

  it("is false when there is no profile row", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await isApproved("u1")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- supabase.service`
Expected: FAIL — cannot find module `../src/services/supabase.js`.

- [ ] **Step 4: Write the implementation**

`apps/backend/src/services/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazily-created service-role client. Server-only: this key bypasses RLS and must
// never reach the browser. Plan 5 (persistence) extends this file — keep additions here.
let client: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase service-role credentials are not configured.");
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function getUserFromToken(
  token: string,
): Promise<{ id: string; email: string | null } | null> {
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function isApproved(userId: string): Promise<boolean> {
  const { data, error } = await admin().from("profiles").select("approved").eq("id", userId).single();
  if (error || !data) return false;
  return data.approved === true;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- supabase.service`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/supabase.ts apps/backend/package.json package-lock.json apps/backend/tests/supabase.service.test.ts
git commit -m "feat(backend): supabase service-role client (getUserFromToken, isApproved)"
git push
```

---

## Task 3: `requireApprovedUser` middleware

**Files:**
- Create: `apps/backend/src/middleware/require-approved-user.ts`
- Test: `apps/backend/tests/auth.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/auth.middleware.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { requireApprovedUser } from "../src/middleware/require-approved-user.js";

function makeApp() {
  const app = express();
  app.get("/protected", requireApprovedUser, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
}

const app = makeApp();
beforeEach(() => vi.resetAllMocks());

describe("requireApprovedUser", () => {
  it("401s when no Authorization header is present", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(getUserFromToken).not.toHaveBeenCalled();
  });

  it("401s when the token is invalid", async () => {
    vi.mocked(getUserFromToken).mockResolvedValue(null);
    const res = await request(app).get("/protected").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("403s when the user is not approved", async () => {
    vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
    vi.mocked(isApproved).mockResolvedValue(false);
    const res = await request(app).get("/protected").set("Authorization", "Bearer ok");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_APPROVED");
  });

  it("passes through and attaches req.user when approved", async () => {
    vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
    vi.mocked(isApproved).mockResolvedValue(true);
    const res = await request(app).get("/protected").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, user: { id: "u1", email: "a@b.com" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- auth.middleware`
Expected: FAIL — cannot find module `../src/middleware/require-approved-user.js`.

- [ ] **Step 3: Write the implementation**

`apps/backend/src/middleware/require-approved-user.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { getUserFromToken, isApproved } from "../services/supabase.js";
import { AuthError, ForbiddenError, toHttpError } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string | null };
    }
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export async function requireApprovedUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerToken(req.headers.authorization);
    if (!token) throw new AuthError("Authentication required.");
    const user = await getUserFromToken(token);
    if (!user) throw new AuthError("Authentication required.");
    if (!(await isApproved(user.id))) throw new ForbiddenError("Account not approved.");
    req.user = user;
    next();
  } catch (err) {
    // The middleware runs before the route's own try/catch, so it shapes its own response.
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- auth.middleware`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/middleware/require-approved-user.ts apps/backend/tests/auth.middleware.test.ts
git commit -m "feat(backend): requireApprovedUser middleware"
git push
```

---

## Task 4: Expose Supabase URL + anon key in `/api/config`

**Files:**
- Modify: `apps/backend/src/config/index.ts`
- Test: `apps/backend/tests/config.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside `describe("loadConfig", ...)` in `apps/backend/tests/config.test.ts`:

```ts
  it("exposes the browser-safe Supabase url + anon key, never the service-role key", () => {
    const cfg = loadConfig({
      SUPABASE_URL: "https://proj.supabase.co",
      SUPABASE_ANON_KEY: "anon-123",
      SUPABASE_SERVICE_ROLE_KEY: "service-secret-456",
    });
    expect(cfg.supabaseUrl).toBe("https://proj.supabase.co");
    expect(cfg.supabaseAnonKey).toBe("anon-123");
    expect(JSON.stringify(cfg)).not.toContain("service-secret-456");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- config`
Expected: FAIL — `supabaseUrl`/`supabaseAnonKey` are `undefined`.

- [ ] **Step 3: Add the fields**

In `apps/backend/src/config/index.ts`, add to the `AppConfig` interface:

```ts
  supabaseUrl: string;
  supabaseAnonKey: string;
```

and to the object returned by `loadConfig` (alongside the existing fields):

```ts
    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseAnonKey: env.SUPABASE_ANON_KEY ?? "",
```

(The service-role key is deliberately NOT added.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/config/index.ts apps/backend/tests/config.test.ts
git commit -m "feat(backend): expose supabase url + anon key via /api/config"
git push
```

---

## Task 5: Gate `/api/extract`

**Files:**
- Modify: `apps/backend/src/routes/extract.ts`
- Test: `apps/backend/tests/routes.test.ts`

- [ ] **Step 1: Update the route tests to expect auth**

Replace `apps/backend/tests/routes.test.ts` with (the extract suite now mocks the supabase service and sends a token; a new test asserts 401 without one; the config suite is unchanged):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/extract.js", () => ({ runExtract: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { runExtract } from "../src/pipelines/extract.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { ValidationError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("POST /api/extract", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/extract").send({ url: "https://acme.com" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runExtract).not.toHaveBeenCalled();
  });

  it("returns 200 with the measured data for an approved user", async () => {
    approve();
    vi.mocked(runExtract).mockResolvedValue({ title: "Acme" } as any);
    const res = await request(app)
      .post("/api/extract")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Acme");
  });

  it("maps ValidationError to 422 with a typed error body", async () => {
    approve();
    vi.mocked(runExtract).mockRejectedValue(new ValidationError("bad url"));
    const res = await request(app)
      .post("/api/extract")
      .set("Authorization", "Bearer ok")
      .send({ url: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/config", () => {
  it("returns model + key-presence flags, never secret values", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("openrouterConfigured");
    expect(JSON.stringify(res.body)).not.toContain("sk-");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- routes`
Expected: FAIL — the 401 test fails because `/extract` is not yet gated (it returns 200/422 without a token).

- [ ] **Step 3: Apply the middleware to the route**

Replace `apps/backend/src/routes/extract.ts` with:

```ts
import { Router } from "express";
import { runExtract } from "../pipelines/extract.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";

export const extractRouter = Router();

extractRouter.post("/extract", requireApprovedUser, async (req, res) => {
  try {
    const data = await runExtract(req.body?.url ?? "");
    res.json(data);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- routes`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; `auth.e2e` (added next) and the existing `extract.e2e` show as skipped.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/extract.ts apps/backend/tests/routes.test.ts
git commit -m "feat(backend): gate POST /api/extract behind requireApprovedUser"
git push
```

---

## Task 6: Gated real auth smoke test

**Files:**
- Create: `apps/backend/tests/auth.e2e.test.ts`

This hits real Supabase, so it is skipped unless `BYA_AUTH_E2E=1` and a token are provided — no Supabase calls in a normal run.

- [ ] **Step 1: Create the gated test**

`apps/backend/tests/auth.e2e.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadEnvFile } from "../src/config/index.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";

loadEnvFile(process.cwd());

// Provide a real token for an APPROVED test user:
//   BYA_AUTH_E2E=1 BYA_TEST_TOKEN=<jwt> npm --workspace @bya/backend run test -- auth.e2e
const token = process.env.BYA_TEST_TOKEN;
const run = process.env.BYA_AUTH_E2E === "1" && token ? describe : describe.skip;

run("auth e2e (real Supabase)", () => {
  it("resolves the token to a user and confirms approval", async () => {
    const user = await getUserFromToken(token!);
    expect(user).not.toBeNull();
    expect(await isApproved(user!.id)).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 2: Verify it is skipped in the normal run**

Run: `npm --workspace @bya/backend run test -- auth.e2e`
Expected: the suite shows as skipped (no `BYA_AUTH_E2E`).

- [ ] **Step 3: (Optional) Verify against real Supabase**

Approve a test user in the Supabase dashboard and obtain a session JWT for it (e.g. a one-off `signInWithOtp` in a browser, or `admin.generateLink` + `verifyOtp` in a throwaway script), then:

Run (PowerShell): `$env:BYA_AUTH_E2E=1; $env:BYA_TEST_TOKEN="<jwt>"; npm --workspace @bya/backend run test -- auth.e2e; Remove-Item Env:BYA_AUTH_E2E,Env:BYA_TEST_TOKEN`
Run (bash): `BYA_AUTH_E2E=1 BYA_TEST_TOKEN="<jwt>" npm --workspace @bya/backend run test -- auth.e2e`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/tests/auth.e2e.test.ts
git commit -m "test(backend): gated real Supabase auth smoke"
git push
```

---

## Self-Review

**Spec coverage:**
- Service-role client `getUserFromToken` + `isApproved` — Task 2. ✓
- `requireApprovedUser` middleware (401/403/next + `req.user`) — Task 3. ✓
- Typed `AuthError` (401) + `ForbiddenError` (403), `stage: 'auth'`, mapped by existing `toHttpError` — Task 1. ✓
- Gate the existing cost endpoint (`/extract`); middleware ready for brand/ad-prompt/render — Task 5. ✓ (Note: `/brand` route does not exist yet; the spec's "extract and brand" wording predated confirming brand is pipeline-only. Middleware applies to brand at route creation.)
- `/api/config` exposes `supabaseUrl` + `supabaseAnonKey`, never the service-role key — Task 4. ✓
- Unit tests with Supabase mocked; route tests updated (approved stub + 401 case); config test asserts service-role absence; gated real smoke — Tasks 2, 3, 5, 6 + config test in Task 4. ✓
- No schema migration (consumes existing `profiles.approved`) — confirmed; no task creates schema. ✓
- New dependency `@supabase/supabase-js` flagged — Task 2 Step 1. ✓

**Placeholders:** none — every code step contains full content.

**Type consistency:** `getUserFromToken` returns `{ id: string; email: string | null } | null` and `isApproved(userId: string): Promise<boolean>` in Task 2; consumed with those exact signatures by the middleware (Task 3) and mocked with the same shapes in Tasks 3 and 5. `req.user` is typed `{ id: string; email: string | null }` via the augmentation in Task 3 and asserted with that shape in Tasks 3 and 5. `AuthError`/`ForbiddenError` codes (`AUTH_REQUIRED`/`NOT_APPROVED`) are identical across Tasks 1, 3, and 5.
