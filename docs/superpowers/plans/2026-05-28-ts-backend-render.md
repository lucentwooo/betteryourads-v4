# TS Backend — Render (Stage 3) Slice (Plan 4 of 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the fourth backend vertical slice — `POST /api/render`: given `{ adPrompt, referenceAdImage, logoImage, productAsset? }`, render the final static ad via KIE (GPT-Image image-to-image) and return `{ imageUrl }`.

**Architecture:** Adds a `RenderRequest` zod contract in `packages/shared`; a `services/kie.ts` with three thin clients (`uploadBase64`, `createTask`, `pollResult`); a typed `KieError`; and the `runRender` pipeline that uploads the images, creates the KIE task, and polls (3s interval, 120s ceiling) until the image is ready. Aspect ratio is auto-detected from `ad_prompt.canvas.aspect_ratio`; resolution + model are config-driven. The route is gated by the existing `requireApprovedUser`.

**Tech Stack:** TypeScript, Node ≥ 20 (ESM), Express 4, KIE jobs API (via `fetch`), zod, Vitest, supertest, tsx.

This is **Plan 4 of 5**. Supabase Storage persistence (download the KIE image into the `ads` bucket + signed library URLs), `id`, and `adPromptId` lookup are deferred to **Plan 5** — `POST /api/render` takes `adPrompt` inline and returns `{ imageUrl }` (the KIE-hosted result URL), mirroring Plan 2/3. Spec: `docs/superpowers/specs/2026-05-28-ts-backend-render-design.md`. Master spec: `docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md`.

**Conventions carried from earlier plans:** Windows + PowerShell; repo lives in OneDrive (transient file locks — retry once). Never run a bare emitting `tsc` — always `tsc --noEmit`; before committing run `git status --porcelain` and stage only the explicit paths. Commit messages end with a trailing `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` line. Push after each commit.

---

## File Structure

```
packages/shared/
  src/render.ts                       # NEW — RenderRequest zod contract (wraps AdPrompt)
  src/index.ts                        # MODIFY — re-export render
apps/backend/
  package.json                        # MODIFY — add "run:render" script
  src/lib/errors.ts                   # MODIFY — add KieError
  src/services/kie.ts                 # NEW — uploadBase64 / createTask / pollResult
  src/pipelines/render.ts             # NEW — runRender() upload → createTask → poll
  src/routes/render.ts                # NEW — POST /api/render (gated)
  src/server.ts                       # MODIFY — wire renderRouter
  scripts/run-render.ts               # NEW — manual runner (ad-prompt json + images → image URL)
  tests/errors.test.ts                # MODIFY — KieError case
  tests/kie.service.test.ts           # NEW — kie clients (fetch mocked)
  tests/render.pipeline.test.ts       # NEW — runRender orchestration + poll states + errors
  tests/render.routes.test.ts         # NEW — POST /api/render (auth + mapping)
  tests/render.e2e.test.ts            # NEW — gated real KIE render smoke
```

No new npm dependencies. `Stage` already includes `"render"`; `kieModel` + `kieResolution` already exist in `AppConfig`.

---

## Task 1: `KieError` typed error

**Files:**
- Modify: `apps/backend/src/lib/errors.ts`
- Modify: `apps/backend/tests/errors.test.ts`

- [ ] **Step 1: Add the failing test**

Add `KieError` to the import from `../src/lib/errors.js` in `apps/backend/tests/errors.test.ts`, and append this `describe` block:

```ts
describe("KieError", () => {
  it("maps to a 502 with the render stage", () => {
    const e = new KieError("task failed");
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("KIE_ERROR");
    expect(e.status).toBe(502);
    expect(e.stage).toBe("render");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: FAIL — `KieError` is not exported.

- [ ] **Step 3: Add `KieError` to `apps/backend/src/lib/errors.ts`**

Add after `OpenRouterError` (leave everything else unchanged):

```ts
export class KieError extends AppError {
  constructor(message: string) {
    super(message, "KIE_ERROR", 502, "render");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: PASS.

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/lib/errors.ts apps/backend/tests/errors.test.ts
git commit -m "feat(backend): KieError typed error

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 2: `RenderRequest` contract

**Files:**
- Create: `packages/shared/src/render.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/src/render.ts`**

```ts
import { z } from "zod";
import { AdPrompt } from "./ad-prompt.js";

/** Request body for POST /api/render. Images are base64 data URLs. */
export const RenderRequest = z.object({
  adPrompt: AdPrompt,
  referenceAdImage: z.string(),
  logoImage: z.string(),
  productAsset: z.string().optional(),
});

export type RenderRequest = z.infer<typeof RenderRequest>;
```

- [ ] **Step 2: Re-export from `packages/shared/src/index.ts`**

Add below `export * from "./ad-prompt.js";`:

```ts
export * from "./render.js";
```

- [ ] **Step 3: Type-check**

Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit + push**

```bash
git add packages/shared/src/render.ts packages/shared/src/index.ts
git commit -m "feat(shared): RenderRequest zod contract

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 3: `services/kie.ts` — KIE clients

Three thin clients over `fetch`. Auth via `Authorization: Bearer ${KIE_API_KEY}`. Upload strips the data-URL prefix (KIE wants raw base64). All failures map to `KieError`.

**Files:**
- Create: `apps/backend/src/services/kie.ts`
- Create: `apps/backend/tests/kie.service.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/kie.service.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadBase64, createTask, pollResult } from "../src/services/kie.js";
import { KieError } from "../src/lib/errors.js";

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.KIE_API_KEY = "kie-test";
});
afterEach(() => {
  delete process.env.KIE_API_KEY;
  vi.unstubAllGlobals();
});

describe("uploadBase64", () => {
  it("strips the data-URL prefix, posts raw base64, returns the downloadUrl", async () => {
    const fn = mockFetchOnce(200, { data: { downloadUrl: "https://cdn/x.png" } });
    const url = await uploadBase64("data:image/png;base64,AAAA", "reference.png");
    expect(url).toBe("https://cdn/x.png");
    const [endpoint, init] = fn.mock.calls[0];
    expect(endpoint).toBe("https://kieai.redpandaai.co/api/file-base64-upload");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer kie-test");
    const sent = JSON.parse(init.body);
    expect(sent.base64Data).toBe("AAAA"); // prefix stripped
    expect(sent.uploadPath).toBe("images/ad-stage3");
  });

  it("throws KieError when no downloadUrl comes back", async () => {
    mockFetchOnce(500, { msg: "nope" });
    await expect(uploadBase64("AAAA", "x.png")).rejects.toBeInstanceOf(KieError);
  });
});

describe("createTask", () => {
  it("posts model + input and returns the taskId", async () => {
    const fn = mockFetchOnce(200, { code: 200, data: { taskId: "task-1" } });
    const id = await createTask({
      model: "gpt-image-2-image-to-image",
      prompt: "P",
      inputUrls: ["https://cdn/ref.png", "https://cdn/logo.png"],
      aspectRatio: "1:1",
      resolution: "1K",
    });
    expect(id).toBe("task-1");
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-image-2-image-to-image");
    expect(body.input.input_urls).toHaveLength(2);
    expect(body.input.aspect_ratio).toBe("1:1");
    expect(body.input.resolution).toBe("1K");
  });

  it("throws KieError when code is not 200", async () => {
    mockFetchOnce(200, { code: 400, msg: "bad" });
    await expect(
      createTask({ model: "m", prompt: "P", inputUrls: [], aspectRatio: "1:1", resolution: "1K" }),
    ).rejects.toBeInstanceOf(KieError);
  });
});

describe("pollResult", () => {
  it("parses resultJson into urls and returns the state", async () => {
    mockFetchOnce(200, {
      code: 200,
      data: { state: "success", progress: 1, resultJson: JSON.stringify({ resultUrls: ["https://cdn/out.png"] }) },
    });
    const r = await pollResult("task-1");
    expect(r.state).toBe("success");
    expect(r.urls).toEqual(["https://cdn/out.png"]);
  });

  it("returns a fail state with failMsg", async () => {
    mockFetchOnce(200, { code: 200, data: { state: "fail", failMsg: "content policy" } });
    const r = await pollResult("task-1");
    expect(r.state).toBe("fail");
    expect(r.failMsg).toBe("content policy");
  });

  it("throws KieError on an HTTP error", async () => {
    mockFetchOnce(500, { code: 500 });
    await expect(pollResult("task-1")).rejects.toBeInstanceOf(KieError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- kie.service`
Expected: FAIL — cannot find module `../src/services/kie.js`.

- [ ] **Step 3: Create `apps/backend/src/services/kie.ts`**

```ts
import { KieError } from "../lib/errors.js";

const UPLOAD_URL = "https://kieai.redpandaai.co/api/file-base64-upload";
const CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";

function apiKey(): string {
  const k = process.env.KIE_API_KEY;
  if (!k) throw new KieError("KIE_API_KEY is not set.");
  return k;
}

/** KIE wants raw base64, not a data URL. */
function rawBase64(s: string): string {
  const m = String(s).match(/^data:[^;]+;base64,(.*)$/s);
  return m ? m[1] : s;
}

async function asJson(res: Response): Promise<{ code?: number; msg?: string; message?: string; data?: unknown }> {
  return (await res.json().catch(() => null)) as never;
}

export async function uploadBase64(image: string, fileName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data: rawBase64(image), uploadPath: "images/ad-stage3", fileName }),
    });
  } catch (e) {
    throw new KieError(e instanceof Error ? e.message : String(e));
  }
  const data = await asJson(res);
  const url = (data?.data as { downloadUrl?: string } | undefined)?.downloadUrl;
  if (!res.ok || !url) throw new KieError(`image upload failed: ${data?.msg ?? data?.message ?? "HTTP " + res.status}`);
  return url;
}

export type CreateTaskArgs = {
  model: string;
  prompt: string;
  inputUrls: string[];
  aspectRatio: string;
  resolution: string;
};

export async function createTask(args: CreateTaskArgs): Promise<string> {
  let res: Response;
  try {
    res = await fetch(CREATE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        input: {
          prompt: String(args.prompt).slice(0, 20000),
          input_urls: args.inputUrls,
          aspect_ratio: args.aspectRatio,
          resolution: args.resolution,
        },
      }),
    });
  } catch (e) {
    throw new KieError(e instanceof Error ? e.message : String(e));
  }
  const data = await asJson(res);
  const taskId = (data?.data as { taskId?: string } | undefined)?.taskId;
  if (!res.ok || data?.code !== 200 || !taskId) {
    throw new KieError(`createTask failed: ${data?.msg ?? data?.message ?? "HTTP " + res.status}`);
  }
  return taskId;
}

export type TaskResult = { state: string; progress?: number; urls: string[]; failMsg: string };

export async function pollResult(taskId: string): Promise<TaskResult> {
  let res: Response;
  try {
    res = await fetch(`${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
  } catch (e) {
    throw new KieError(e instanceof Error ? e.message : String(e));
  }
  const data = await asJson(res);
  if (!res.ok || data?.code !== 200) {
    throw new KieError(`recordInfo failed: ${data?.msg ?? data?.message ?? "HTTP " + res.status}`);
  }
  const d = (data?.data ?? {}) as { state?: string; progress?: number; resultJson?: string; failMsg?: string; failCode?: string };
  let urls: string[] = [];
  if (d.resultJson) {
    try {
      const p = JSON.parse(d.resultJson) as { resultUrls?: string[]; result_urls?: string[] };
      urls = p.resultUrls ?? p.result_urls ?? [];
    } catch {
      /* leave urls empty */
    }
  }
  return { state: d.state ?? "", progress: d.progress, urls, failMsg: d.failMsg ?? d.failCode ?? "" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- kie.service`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/services/kie.ts apps/backend/tests/kie.service.test.ts
git commit -m "feat(backend): KIE service client (uploadBase64, createTask, pollResult)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 4: Render pipeline (`runRender`)

Validates the request, requires `ad_prompt`, derives aspect/resolution, uploads the images (reference → logo → optional asset), creates the KIE task, and polls (poll-then-sleep, 3s interval, 120s ceiling). Interval/ceiling are injectable for fast tests. The kie service is mocked in the unit test.

**Files:**
- Create: `apps/backend/src/pipelines/render.ts`
- Create: `apps/backend/tests/render.pipeline.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/render.pipeline.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/kie.js", () => ({
  uploadBase64: vi.fn(),
  createTask: vi.fn(),
  pollResult: vi.fn(),
}));

import { uploadBase64, createTask, pollResult } from "../src/services/kie.js";
import { runRender } from "../src/pipelines/render.js";
import { ValidationError, KieError } from "../src/lib/errors.js";

const adPrompt = { ad_prompt: { goal: "x", canvas: { aspect_ratio: "1:1 (1080x1080)" } }, schema_version: 1 };
const REF = "data:image/png;base64,REF";
const LOGO = "data:image/png;base64,LOGO";
const ASSET = "data:image/png;base64,ASSET";
const fast = { pollIntervalMs: 1, pollTimeoutMs: 1000 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(uploadBase64).mockImplementation(async (_img, name) => `https://cdn/${name}`);
  vi.mocked(createTask).mockResolvedValue("task-1");
});

describe("runRender", () => {
  it("rejects a malformed request before calling KIE", async () => {
    await expect(runRender({ adPrompt, referenceAdImage: REF } as never, fast)).rejects.toBeInstanceOf(ValidationError);
    expect(uploadBase64).not.toHaveBeenCalled();
  });

  it("rejects when ad_prompt is missing", async () => {
    await expect(
      runRender({ adPrompt: { schema_version: 1 }, referenceAdImage: REF, logoImage: LOGO }, fast),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("uploads reference+logo, creates the task, and returns the first result URL", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "success", urls: ["https://cdn/out.png"], failMsg: "" });
    const url = await runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast);
    expect(url).toBe("https://cdn/out.png");
    expect(uploadBase64).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createTask).mock.calls[0][0].aspect_ratio ?? vi.mocked(createTask).mock.calls[0][0].aspectRatio).toBe("1:1");
  });

  it("uploads the product asset as a third image when present", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "success", urls: ["https://cdn/out.png"], failMsg: "" });
    await runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO, productAsset: ASSET }, fast);
    expect(uploadBase64).toHaveBeenCalledTimes(3);
    expect(vi.mocked(createTask).mock.calls[0][0].inputUrls).toHaveLength(3);
  });

  it("polls until success", async () => {
    vi.mocked(pollResult)
      .mockResolvedValueOnce({ state: "processing", progress: 0.5, urls: [], failMsg: "" })
      .mockResolvedValueOnce({ state: "success", urls: ["https://cdn/out.png"], failMsg: "" });
    const url = await runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast);
    expect(url).toBe("https://cdn/out.png");
    expect(pollResult).toHaveBeenCalledTimes(2);
  });

  it("throws KieError when the task fails", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "fail", urls: [], failMsg: "content policy" });
    await expect(runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast)).rejects.toBeInstanceOf(KieError);
  });

  it("throws KieError when polling times out", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "processing", urls: [], failMsg: "" });
    await expect(
      runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, { pollIntervalMs: 1, pollTimeoutMs: 0 }),
    ).rejects.toBeInstanceOf(KieError);
  });

  it("propagates an upstream upload KieError", async () => {
    vi.mocked(uploadBase64).mockRejectedValue(new KieError("upload down"));
    await expect(runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast)).rejects.toBeInstanceOf(KieError);
  });
});
```

> Note: the `createTask` mock-call assertion uses `inputUrls`/`aspectRatio` — the exact `CreateTaskArgs` property names from Task 3. The `aspect_ratio ?? aspectRatio` fallback in the success test tolerates either; the implementation below uses `aspectRatio`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- render.pipeline`
Expected: FAIL — cannot find module `../src/pipelines/render.js`.

- [ ] **Step 3: Create `apps/backend/src/pipelines/render.ts`**

```ts
import { RenderRequest } from "@bya/shared";
import { uploadBase64, createTask, pollResult } from "../services/kie.js";
import { ValidationError, KieError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

export type RenderInput = {
  adPrompt: unknown;
  referenceAdImage: unknown;
  logoImage: unknown;
  productAsset?: unknown;
};

export type RenderTiming = { pollIntervalMs?: number; pollTimeoutMs?: number };

/** Normalize a free-form aspect ratio to one KIE accepts (ported from legacy mapAspectRatio). */
function mapAspectRatio(ar?: string): string {
  if (!ar) return "auto";
  const s = String(ar).trim();
  if (["1:1", "16:9", "9:16", "4:3", "3:4"].includes(s)) return s;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const r = parseFloat(m[1]) / parseFloat(m[2]);
    if (!isFinite(r) || r <= 0) return "auto";
    if (Math.abs(r - 1) < 0.05) return "1:1";
    if (r > 1) return r >= 1.55 ? "16:9" : "4:3";
    return r <= 0.62 ? "9:16" : "3:4";
  }
  return "auto";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runRender(input: RenderInput, timing: RenderTiming = {}): Promise<string> {
  const parsed = RenderRequest.safeParse(input);
  if (!parsed.success) throw new ValidationError("render request is missing or malformed.");
  const req = parsed.data;
  if (!req.adPrompt.ad_prompt) throw new ValidationError("adPrompt.ad_prompt is required to render.");

  const cfg = loadConfig();
  const aspectRatio = mapAspectRatio(req.adPrompt.ad_prompt.canvas?.aspect_ratio);
  let resolution = cfg.kieResolution || "1K";
  if (aspectRatio === "1:1" && resolution === "4K") resolution = "2K"; // KIE forbids this combo

  const inputUrls = [
    await uploadBase64(req.referenceAdImage, "reference.png"),
    await uploadBase64(req.logoImage, "logo.png"),
  ];
  if (req.productAsset) inputUrls.push(await uploadBase64(req.productAsset, "product1.png"));

  const prompt = JSON.stringify(req.adPrompt.ad_prompt, null, 2);
  const taskId = await createTask({ model: cfg.kieModel, prompt, inputUrls, aspectRatio, resolution });

  const intervalMs = timing.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = timing.pollTimeoutMs ?? POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const poll = await pollResult(taskId);
    const state = poll.state.toLowerCase();
    if (state === "success") {
      if (!poll.urls.length) throw new KieError("Render finished but returned no image.");
      return poll.urls[0];
    }
    if (state === "fail") throw new KieError(`Render failed: ${poll.failMsg || "unknown error"}`);
    if (Date.now() >= deadline) throw new KieError("Render timed out. The task may still finish.");
    await sleep(intervalMs);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- render.pipeline`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit + push**

```bash
git add apps/backend/src/pipelines/render.ts apps/backend/tests/render.pipeline.test.ts
git commit -m "feat(backend): render pipeline — KIE upload + createTask + bounded poll

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 5: Route (`POST /api/render`) + wiring

**Files:**
- Create: `apps/backend/src/routes/render.ts`
- Modify: `apps/backend/src/server.ts`
- Create: `apps/backend/tests/render.routes.test.ts`

- [ ] **Step 1: Write the failing test — `apps/backend/tests/render.routes.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/render.js", () => ({ runRender: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { runRender } from "../src/pipelines/render.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { ValidationError, KieError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const body = {
  adPrompt: { ad_prompt: { goal: "x", canvas: { aspect_ratio: "1:1" } } },
  referenceAdImage: "data:image/png;base64,REF",
  logoImage: "data:image/png;base64,LOGO",
};

describe("POST /api/render", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/render").send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runRender).not.toHaveBeenCalled();
  });

  it("returns 200 with { imageUrl } for an approved user", async () => {
    approve();
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBe("https://cdn/out.png");
  });

  it("maps ValidationError to 422", async () => {
    approve();
    vi.mocked(runRender).mockRejectedValue(new ValidationError("bad input"));
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps KieError to 502 with stage render", async () => {
    approve();
    vi.mocked(runRender).mockRejectedValue(new KieError("render failed"));
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("KIE_ERROR");
    expect(res.body.error.stage).toBe("render");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- render.routes`
Expected: FAIL — cannot find module `../src/routes/render.js`.

- [ ] **Step 3: Create `apps/backend/src/routes/render.ts`**

```ts
import { Router } from "express";
import { runRender } from "../pipelines/render.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";

export const renderRouter = Router();

renderRouter.post("/render", requireApprovedUser, async (req, res) => {
  try {
    const imageUrl = await runRender({
      adPrompt: req.body?.adPrompt,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
    });
    res.json({ imageUrl });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Wire the router into `apps/backend/src/server.ts`**

Add the import alongside the others and mount under `/api` (after `app.use("/api", adPromptRouter);`):

```ts
import { renderRouter } from "./routes/render.js";
```

```ts
  app.use("/api", renderRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- render.routes`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite + type-check**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the four gated e2e suites (extract, brand, auth, ad-prompt) show as skipped (render e2e added next).
Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit + push**

```bash
git add apps/backend/src/routes/render.ts apps/backend/src/server.ts apps/backend/tests/render.routes.test.ts
git commit -m "feat(backend): POST /api/render route + wiring (gated)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 6: Manual run script (`run-render.ts`)

Renders from local files: an ad-prompt JSON + a reference ad + a logo (+ optional asset). Requires `KIE_API_KEY` in the root `.env`.

**Files:**
- Create: `apps/backend/scripts/run-render.ts`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Add the script to `apps/backend/package.json`**

Add to `"scripts"` (after `"run:ad-prompt"`):

```json
    "run:render": "tsx scripts/run-render.ts",
```

- [ ] **Step 2: Create `apps/backend/scripts/run-render.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runRender } from "../src/pipelines/render.js";

loadEnvFile(process.cwd());

const [adPromptPath, refPath, logoPath, assetPath] = process.argv.slice(2);
if (!adPromptPath || !refPath || !logoPath) {
  console.error(
    "Usage: npm --workspace @bya/backend run run:render -- <ad-prompt.json> <reference-ad.(png|jpg)> <logo.(png|jpg)> [product-asset.(png|jpg)]",
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
    const adPrompt = JSON.parse(fs.readFileSync(adPromptPath, "utf8"));
    const imageUrl = await runRender({
      adPrompt,
      referenceAdImage: toDataUrl(refPath),
      logoImage: toDataUrl(logoPath),
      productAsset: assetPath ? toDataUrl(assetPath) : undefined,
    });
    console.log("imageUrl:", imageUrl);
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
```

- [ ] **Step 3: Run it against real inputs (if available)**

Accepts an `ad-prompt.json` whose top level is `{ "ad_prompt": { … } }` (or a full `AdPrompt`). With a reference ad + logo available, e.g.:
`npm --workspace @bya/backend run run:render -- ./ad-prompt.json ./reference-ad.png ./logo.png`
(real KIE render — uploads + createTask + polls; can take up to 2 minutes; use a generous timeout). Expected: prints `imageUrl: https://…`.
If no sample reference-ad/logo images are available in this environment, report DONE_WITH_CONCERNS (the mocked unit tests cover the logic), same convention as Plan 2/3.

- [ ] **Step 4: Commit + push**

```bash
git add apps/backend/scripts/run-render.ts apps/backend/package.json
git commit -m "chore(backend): manual run script for render pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task 7: Gated real e2e smoke

Skipped unless `BYA_E2E=1` **and** `KIE_API_KEY` **and** `BYA_REF_AD_PATH`/`BYA_LOGO_PATH` are present — so the default suite stays fast, offline, and cost-free.

**Files:**
- Create: `apps/backend/tests/render.e2e.test.ts`

- [ ] **Step 1: Create `apps/backend/tests/render.e2e.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runRender } from "../src/pipelines/render.js";

loadEnvFile(process.cwd());

const ref = process.env.BYA_REF_AD_PATH;
const logo = process.env.BYA_LOGO_PATH;
const enabled = process.env.BYA_E2E === "1" && Boolean(ref) && Boolean(logo) && Boolean(process.env.KIE_API_KEY);
const run = enabled ? describe : describe.skip;

function toDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

run("render e2e (real KIE)", () => {
  it("renders an image from an ad prompt + reference + logo", async () => {
    const adPrompt = {
      ad_prompt: {
        goal: "Promote Acme",
        canvas: { aspect_ratio: "1:1" },
        copy: { brand_name: "Acme", headline: "Ship faster" },
      },
    };
    const imageUrl = await runRender({
      adPrompt,
      referenceAdImage: toDataUrl(ref!),
      logoImage: toDataUrl(logo!),
    });
    expect(typeof imageUrl).toBe("string");
    expect(imageUrl).toMatch(/^https?:\/\//);
  }, 180_000);
});
```

- [ ] **Step 2: Verify it is skipped in the normal run**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the render e2e suite shows as skipped (alongside extract, brand, auth, ad-prompt). Capture totals incl. skipped count.

- [ ] **Step 3: (Optional) Verify when enabled (requires real images + KIE key)**

Run (PowerShell): `$env:BYA_E2E=1; $env:BYA_REF_AD_PATH="<path>"; $env:BYA_LOGO_PATH="<path>"; npm --workspace @bya/backend run test -- render.e2e; Remove-Item Env:BYA_E2E,Env:BYA_REF_AD_PATH,Env:BYA_LOGO_PATH`
Expected: PASS (1 test). If sample images are unavailable, the suite stays skipped — report that distinctly (not a code failure).

- [ ] **Step 4: Commit + push**

```bash
git add apps/backend/tests/render.e2e.test.ts
git commit -m "test(backend): gated real e2e smoke for render pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Self-Review

**Spec coverage:**
- `POST /api/render` → `{ imageUrl }`, gated — Task 5 (persistence/`id`/storage deferred to Plan 5). ✓
- `RenderRequest` contract wrapping `AdPrompt` — Task 2. ✓
- `services/kie.ts`: `uploadBase64` (strips data-URL, returns `downloadUrl`), `createTask` (model+input, `taskId`, `code===200`), `pollResult` (parses `resultJson.resultUrls`, state) — Task 3. ✓
- Typed `KieError` (502, stage `render`), mapped by existing `toHttpError` — Tasks 1, 5. ✓
- Pipeline: validate → require `ad_prompt` → aspect via `mapAspectRatio` → resolution config + `1:1`/`4K`→`2K` guard → upload reference→logo→[asset] → createTask → bounded poll (3s/120s) — Task 4. ✓
- Images uploaded as hosted URLs in order; prompt = `ad_prompt` JSON capped at 20k — Tasks 3, 4. ✓
- Model + resolution config-driven (`kieModel`, `kieResolution`) — Task 4. ✓
- Verification: kie service unit + pipeline unit + route + run script + gated e2e — Tasks 3–7. ✓

**Type consistency:** `RenderRequest` (shared, Task 2) is validated in the pipeline (Task 4). `CreateTaskArgs` (`model`, `prompt`, `inputUrls`, `aspectRatio`, `resolution`) defined in Task 3 is constructed with those exact names in Task 4 and asserted in Tasks 3/4 tests. `TaskResult` (`state`, `progress?`, `urls`, `failMsg`) from Task 3 is consumed by the poll loop in Task 4. `runRender(RenderInput, RenderTiming?)` has the same shape at pipeline (Task 4), route (Task 5), script (Task 6), e2e (Task 7). `KieError` code (`KIE_ERROR`)/status (502)/stage (`render`) identical across Tasks 1, 3, 4, 5.

**Placeholders:** none — every code step contains full content. `mapAspectRatio` is ported verbatim from `legacy/bya-pipeline.js`.

**Design notes:**
- KIE result URLs are temporary (legacy noted ~3 days); returning them directly is fine for this verify-the-pipeline slice. Plan 5 downloads + persists to Supabase Storage and serves signed library URLs.
- The render is synchronous (route awaits the 2-min-ceiling poll), matching legacy. Batch/async job handling is the master spec's explicit future extension, not this slice.
