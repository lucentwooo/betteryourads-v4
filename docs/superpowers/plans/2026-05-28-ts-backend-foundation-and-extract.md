# TS Backend Foundation + Extract Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TypeScript workspaces monorepo with the current app archived under `legacy/`, and ship the first working, verified backend vertical slice: `POST /api/extract` (Playwright site measurement) plus `GET /api/config`.

**Architecture:** npm workspaces monorepo. `apps/backend` is a TypeScript Express app (ESM, run via `tsx`, tested via Vitest). `packages/shared` holds zod schemas + inferred TS types that are the API contract. The backend is layered: thin `routes/` → `pipelines/` (typed, no HTTP) → `services/` (external clients). Secrets stay server-side via a hand-rolled env loader (preserving the legacy convention: real `process.env` wins over `.env`).

**Tech Stack:** TypeScript, Node ≥ 20 (ESM), Express 4, Playwright (chromium), zod, Vitest, supertest, tsx.

This is Plan 1 of 5. Plans 2–5 (Brand DNA, Ad-Prompt, Render, Persistence+migrations) build on the types and patterns established here. Spec: `docs/superpowers/specs/2026-05-28-typescript-backend-rebuild-design.md`.

---

## File Structure

Created in this plan:

```
package.json                         # NEW workspace root: workspaces ["apps/*","packages/*"]
tsconfig.base.json                   # NEW shared compiler options + @bya/shared path alias
legacy/                              # MOVED here: the entire current app (kept runnable)
  server.js  app.html  admin.html  library.html
  auth.js  bya-pipeline.js  bya-prompts.js
  styles/  assets/  scripts/  package.json  package-lock.json
packages/shared/
  package.json                       # name "@bya/shared", type module
  tsconfig.json
  src/index.ts                       # re-exports
  src/measured-site-data.ts          # MeasuredSiteData zod schema + type
apps/backend/
  package.json                       # name "@bya/backend", type module
  tsconfig.json
  vitest.config.ts
  src/config/index.ts                # typed env (loadEnv + config object)
  src/lib/errors.ts                  # typed error classes + http mapping
  src/services/extract-in-page.ts    # the function that runs INSIDE the browser
  src/services/browser.ts            # Playwright singleton + extractSite(url)
  src/pipelines/extract.ts           # extract pipeline (typed url -> MeasuredSiteData)
  src/routes/extract.ts              # POST /api/extract
  src/routes/config.ts               # GET /api/config
  src/server.ts                      # express wiring
  src/index.ts                       # entrypoint (port start w/ auto-increment)
  scripts/run-extract.ts             # manual pipeline runner
  tests/config.test.ts
  tests/errors.test.ts
  tests/extract.pipeline.test.ts
  tests/routes.test.ts
  tests/extract.e2e.test.ts          # gated real Playwright smoke
```

Kept at repo root (NOT moved): `.env`, `.env.example`, `.gitignore`, `CLAUDE.md`, `README.md`, `docs/`, `supabase/` (the latter is shared infra; migrations land in Plan 5).

---

## Task 1: Workspace root + archive current app under `legacy/`

**Files:**
- Create: `package.json` (root), `tsconfig.base.json`
- Modify: `.gitignore`
- Move: app files into `legacy/`

- [ ] **Step 1: Move the current app into `legacy/` with git mv**

Run (from repo root; OneDrive can transiently lock files — if a move fails, wait a second and re-run just that line):

```bash
mkdir -p legacy
git mv server.js app.html admin.html library.html auth.js bya-pipeline.js bya-prompts.js package.json package-lock.json styles assets scripts legacy/
```

Note: `supabase/`, `docs/`, `.env`, `.env.example`, `.gitignore`, `CLAUDE.md`, `README.md` stay at root.

- [ ] **Step 2: Verify legacy still self-describes as runnable**

Run: `cat legacy/package.json`
Expected: shows the existing `"start": "node server.js"` script. (Legacy runs via `cd legacy && npm install && npm start`.)

- [ ] **Step 3: Create the workspace root `package.json`**

```json
{
  "name": "betteryourads",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "baseUrl": ".",
    "paths": { "@bya/shared": ["packages/shared/src/index.ts"] }
  }
}
```

(`DOM` is in `lib` so the in-page extraction function type-checks; it runs in the browser, not Node.)

- [ ] **Step 5: Append build/tooling ignores to `.gitignore`**

Add these lines (per the OneDrive-locks memory, prefer .gitignore over deleting artifacts):

```
node_modules/
dist/
*.tsbuildinfo
.vitest/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: archive current app under legacy/, add workspace root"
```

---

## Task 2: `packages/shared` with the `MeasuredSiteData` contract

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/measured-site-data.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@bya/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.23.8" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/src/measured-site-data.ts`**

This mirrors exactly what the legacy `extractFromPage()` returns (`legacy/server.js`).

```ts
import { z } from "zod";

export const ColorCount = z.object({ hex: z.string(), count: z.number() });

export const MeasuredSiteData = z.object({
  title: z.string(),
  description: z.string(),
  colors: z.object({
    text: z.array(ColorCount),
    background: z.array(ColorCount),
    border: z.array(ColorCount),
    accent_cta: z.array(ColorCount),
  }),
  cssColorVariables: z.record(z.string(), z.string()),
  fonts: z.object({
    body: z.string().nullable(),
    heading: z.string().nullable(),
    button: z.string().nullable(),
  }),
  logos: z.array(z.string()),
  text: z.string(),
  finalUrl: z.string().optional(),
});

export type MeasuredSiteData = z.infer<typeof MeasuredSiteData>;
```

- [ ] **Step 4: Create `packages/shared/src/index.ts`**

```ts
export * from "./measured-site-data.js";
```

- [ ] **Step 5: Install workspace deps**

Run (from repo root): `npm install`
Expected: installs zod into the workspace; no errors.

- [ ] **Step 6: Commit**

```bash
git add packages package.json package-lock.json
git commit -m "feat(shared): MeasuredSiteData zod contract"
```

---

## Task 3: `apps/backend` scaffold that boots

**Files:**
- Create: `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/vitest.config.ts`, `apps/backend/src/server.ts`, `apps/backend/src/index.ts`

- [ ] **Step 1: Create `apps/backend/package.json`**

```json
{
  "name": "@bya/backend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "run:extract": "tsx scripts/run-extract.ts"
  },
  "dependencies": {
    "@bya/shared": "*",
    "express": "^4.19.2",
    "playwright": "^1.48.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 3: Create `apps/backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@bya/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Create `apps/backend/src/server.ts`**

```ts
import express, { type Express } from "express";

export function createServer(): Express {
  const app = express();
  // Base64 images (reference ad, logo, product) make request bodies large.
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}
```

- [ ] **Step 5: Create `apps/backend/src/index.ts`**

Port the legacy port auto-increment behavior.

```ts
import { createServer } from "./server.js";

function start(port: number, attemptsLeft: number): void {
  const app = createServer();
  const server = app.listen(port, () => {
    console.log(`\n  BetterYourAds backend running.\n  http://localhost:${port}\n`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`  Port ${port} busy, trying ${port + 1}…`);
      start(port + 1, attemptsLeft - 1);
    } else {
      console.error("  Could not start server:", err.message);
      process.exit(1);
    }
  });
}

start(Number(process.env.PORT) || 3000, 20);
```

- [ ] **Step 6: Install and verify it boots**

Run (from repo root): `npm install`
Then: `npm --workspace @bya/backend run start`
Expected: prints "BetterYourAds backend running." Visit `http://localhost:3000/api/health` → `{"ok":true}`. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add apps package.json package-lock.json
git commit -m "feat(backend): scaffold express app that boots with /api/health"
```

---

## Task 4: Typed config module (env loader)

**Files:**
- Create: `apps/backend/src/config/index.ts`, `apps/backend/tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config/index.js";

describe("loadConfig", () => {
  it("reads models and key-presence flags from the given env", () => {
    const cfg = loadConfig({
      STAGE1_MODEL: "x/stage1",
      STAGE2_MODEL: "x/stage2",
      KIE_IMAGE_MODEL: "gpt-image-2-image-to-image",
      KIE_IMAGE_RESOLUTION: "1K",
      OPENROUTER_API_KEY: "sk-or",
    });
    expect(cfg.stage1Model).toBe("x/stage1");
    expect(cfg.kieResolution).toBe("1K");
    expect(cfg.openrouterConfigured).toBe(true);
    expect(cfg.kieConfigured).toBe(false);
  });

  it("defaults KIE resolution to 1K when unset", () => {
    expect(loadConfig({}).kieResolution).toBe("1K");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- config`
Expected: FAIL — cannot find module `../src/config/index.js`.

- [ ] **Step 3: Write the implementation**

`apps/backend/src/config/index.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

type Env = Record<string, string | undefined>;

/** Hand-rolled .env loader (legacy convention): real process.env wins over the file. */
export function loadEnvFile(dir: string = process.cwd()): void {
  try {
    const txt = fs.readFileSync(path.join(dir, ".env"), "utf8");
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
  } catch {
    /* no .env — rely on real environment variables */
  }
}

export interface AppConfig {
  stage1Model: string;
  stage2Model: string;
  kieModel: string;
  kieResolution: string;
  openrouterConfigured: boolean;
  kieConfigured: boolean;
  supabaseConfigured: boolean;
}

export function loadConfig(env: Env = process.env): AppConfig {
  return {
    stage1Model: env.STAGE1_MODEL ?? "",
    stage2Model: env.STAGE2_MODEL ?? "",
    kieModel: env.KIE_IMAGE_MODEL ?? "gpt-image-2-image-to-image",
    kieResolution: env.KIE_IMAGE_RESOLUTION ?? "1K",
    openrouterConfigured: Boolean(env.OPENROUTER_API_KEY),
    kieConfigured: Boolean(env.KIE_API_KEY),
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- config`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/config apps/backend/tests/config.test.ts
git commit -m "feat(backend): typed config + .env loader"
```

---

## Task 5: Typed errors + HTTP mapping

**Files:**
- Create: `apps/backend/src/lib/errors.ts`, `apps/backend/tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AppError, ExtractionError, toHttpError } from "../src/lib/errors.js";

describe("errors", () => {
  it("ExtractionError carries stage + 502 status", () => {
    const e = new ExtractionError("nav failed");
    expect(e).toBeInstanceOf(AppError);
    expect(e.stage).toBe("extract");
    expect(e.status).toBe(502);
  });

  it("toHttpError maps AppError to its status/code/stage", () => {
    expect(toHttpError(new ExtractionError("boom"))).toEqual({
      status: 502,
      body: { error: { code: "EXTRACTION_ERROR", message: "boom", stage: "extract" } },
    });
  });

  it("toHttpError maps unknown errors to a 500 without leaking internals", () => {
    const r = toHttpError(new Error("secret stack detail"));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("INTERNAL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: FAIL — cannot find module `../src/lib/errors.js`.

- [ ] **Step 3: Write the implementation**

`apps/backend/src/lib/errors.ts`:

```ts
export type Stage = "extract" | "brand" | "ad-prompt" | "render" | "validation";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly stage: Stage,
  ) {
    super(message);
    this.name = code;
  }
}

export class ExtractionError extends AppError {
  constructor(message: string) {
    super(message, "EXTRACTION_ERROR", 502, "extract");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 422, "validation");
  }
}

export interface HttpError {
  status: number;
  body: { error: { code: string; message: string; stage?: Stage } };
}

export function toHttpError(err: unknown): HttpError {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, stage: err.stage } } };
  }
  // Never leak arbitrary internals to the client.
  return { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error." } } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- errors`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/lib apps/backend/tests/errors.test.ts
git commit -m "feat(backend): typed errors + HTTP mapping"
```

---

## Task 6: Browser service (Playwright singleton + in-page extraction)

**Files:**
- Create: `apps/backend/src/services/extract-in-page.ts`, `apps/backend/src/services/browser.ts`

There is no unit test here (it drives a real browser); it is exercised by the gated e2e test in Task 10 and the run script in Task 9. The extraction logic is ported **verbatim** from `legacy/server.js` `extractFromPage()`.

- [ ] **Step 1: Create the in-page function**

`apps/backend/src/services/extract-in-page.ts` (runs INSIDE the browser via `page.evaluate`; uses DOM globals only — no Node imports):

```ts
import type { MeasuredSiteData } from "@bya/shared";

// NOTE: This function is serialized and executed in the browser context.
// It must be self-contained and reference only DOM globals.
export function extractFromPage(): Omit<MeasuredSiteData, "finalUrl"> {
  const toHex = (c: string | null): string | null => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    const a = p[3];
    if (a !== undefined && a < 0.1) return null;
    const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return "#" + h(p[0]) + h(p[1]) + h(p[2]);
  };

  type Counts = Record<string, number>;
  const counts: Record<"text" | "background" | "border" | "accent_cta", Counts> = {
    text: {}, background: {}, border: {}, accent_cta: {},
  };
  const bump = (obj: Counts, hex: string | null, w: number) => {
    if (!hex) return;
    obj[hex] = (obj[hex] || 0) + (w || 1);
  };

  const els = Array.from(document.querySelectorAll("*"));
  for (const el of els) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const areaWeight = Math.max(1, Math.round((Math.max(0, r.width) * Math.max(0, r.height)) / 2000));
    bump(counts.text, toHex(cs.color), 1);
    bump(counts.background, toHex(cs.backgroundColor), areaWeight);
    bump(counts.border, toHex(cs.borderTopColor), 1);
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && el.className.toString ? el.className.toString() : "").toLowerCase();
    const isCta =
      tag === "button" ||
      (tag === "a" && /btn|button|cta|primary|signup|sign-up|get-started|try/.test(cls)) ||
      /btn|button|cta/.test(cls);
    if (isCta) bump(counts.accent_cta, toHex(cs.backgroundColor), 3);
    if (cs.fill && cs.fill !== "none") bump(counts.accent_cta, toHex(cs.fill), 1);
  }

  const top = (obj: Counts, n: number) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n || 8).map(([hex, count]) => ({ hex, count }));

  const cssVars: Record<string, string> = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try { rules = sheet.cssRules; } catch { continue; }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const style = (rule as CSSStyleRule).style;
      if (!style) continue;
      for (let i = 0; i < style.length; i++) {
        const prop = style[i];
        if (prop.startsWith("--")) {
          const val = style.getPropertyValue(prop).trim();
          if (/#[0-9a-f]{3,8}\b|rgb|hsl/i.test(val) && !cssVars[prop]) cssVars[prop] = val;
        }
      }
    }
  }

  const fontOf = (sel: string) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : null;
  };

  const logos = Array.from(document.querySelectorAll("img"))
    .filter((i) => /logo|brand/i.test((i.src || "") + " " + (i.alt || "") + " " + (i.className || "")))
    .map((i) => i.src)
    .filter((s, idx, arr) => s && arr.indexOf(s) === idx)
    .slice(0, 6);

  const metaDesc = document.querySelector('meta[name="description"]');

  return {
    title: document.title || "",
    description: metaDesc ? metaDesc.getAttribute("content") || "" : "",
    colors: {
      text: top(counts.text, 6),
      background: top(counts.background, 6),
      border: top(counts.border, 5),
      accent_cta: top(counts.accent_cta, 6),
    },
    cssColorVariables: cssVars,
    fonts: { body: fontOf("body"), heading: fontOf("h1") || fontOf("h2"), button: fontOf("button") || fontOf("a") },
    logos,
    text: (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000),
  };
}
```

- [ ] **Step 2: Create the browser service**

`apps/backend/src/services/browser.ts` (Playwright singleton + navigation, ported from `legacy/server.js`):

```ts
import { chromium, type Browser } from "playwright";
import type { MeasuredSiteData } from "@bya/shared";
import { extractFromPage } from "./extract-in-page.js";
import { ExtractionError } from "../lib/errors.js";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((e) => {
      browserPromise = null; // allow relaunch on next call if launch failed
      throw e;
    });
  }
  return browserPromise;
}

export async function extractSite(url: string): Promise<MeasuredSiteData> {
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const data = (await page.evaluate(extractFromPage)) as MeasuredSiteData;
    data.finalUrl = page.url();
    return data;
  } catch (e) {
    throw new ExtractionError(e instanceof Error ? e.message : String(e));
  } finally {
    if (context) await context.close().catch(() => {});
  }
}
```

- [ ] **Step 3: Type-check (no test to run yet)**

Run: `npm --workspace @bya/backend exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Install the Chromium binary (one-time)**

Run: `npm --workspace @bya/backend exec playwright install chromium`
Expected: downloads/loads chromium with no error.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services
git commit -m "feat(backend): Playwright browser service + in-page extraction"
```

---

## Task 7: Extract pipeline (typed, validated)

**Files:**
- Create: `apps/backend/src/pipelines/extract.ts`, `apps/backend/tests/extract.pipeline.test.ts`

- [ ] **Step 1: Write the failing test (mock the browser service)**

`apps/backend/tests/extract.pipeline.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/browser.js", () => ({
  extractSite: vi.fn(),
}));

import { extractSite } from "../src/services/browser.js";
import { runExtract } from "../src/pipelines/extract.js";
import { ValidationError } from "../src/lib/errors.js";

const valid = {
  title: "Acme", description: "do things",
  colors: { text: [], background: [], border: [], accent_cta: [] },
  cssColorVariables: {}, fonts: { body: null, heading: null, button: null },
  logos: [], text: "hello", finalUrl: "https://acme.com/",
};

describe("runExtract", () => {
  it("rejects a non-http URL before touching the browser", async () => {
    await expect(runExtract("ftp://nope")).rejects.toBeInstanceOf(ValidationError);
    expect(extractSite).not.toHaveBeenCalled();
  });

  it("returns validated MeasuredSiteData for a valid URL", async () => {
    vi.mocked(extractSite).mockResolvedValue(valid as any);
    const out = await runExtract("https://acme.com");
    expect(out.title).toBe("Acme");
  });

  it("throws ValidationError when the browser returns a malformed shape", async () => {
    vi.mocked(extractSite).mockResolvedValue({ title: 123 } as any);
    await expect(runExtract("https://acme.com")).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @bya/backend run test -- extract.pipeline`
Expected: FAIL — cannot find module `../src/pipelines/extract.js`.

- [ ] **Step 3: Write the implementation**

`apps/backend/src/pipelines/extract.ts`:

```ts
import { MeasuredSiteData } from "@bya/shared";
import { extractSite } from "../services/browser.js";
import { ValidationError } from "../lib/errors.js";

export async function runExtract(rawUrl: string): Promise<MeasuredSiteData> {
  const url = (rawUrl ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new ValidationError("Provide a valid http(s) URL.");
  }
  const data = await extractSite(url);
  const parsed = MeasuredSiteData.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Extraction returned an unexpected shape.");
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- extract.pipeline`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/pipelines apps/backend/tests/extract.pipeline.test.ts
git commit -m "feat(backend): extract pipeline with zod validation"
```

---

## Task 8: Routes (`/api/extract`, `/api/config`) + wiring

**Files:**
- Create: `apps/backend/src/routes/extract.ts`, `apps/backend/src/routes/config.ts`, `apps/backend/tests/routes.test.ts`
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Write the failing test (mock the pipeline)**

`apps/backend/tests/routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/extract.js", () => ({ runExtract: vi.fn() }));

import { runExtract } from "../src/pipelines/extract.js";
import { ValidationError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

describe("POST /api/extract", () => {
  it("returns 200 with the measured data", async () => {
    vi.mocked(runExtract).mockResolvedValue({ title: "Acme" } as any);
    const res = await request(app).post("/api/extract").send({ url: "https://acme.com" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Acme");
  });

  it("maps ValidationError to 422 with a typed error body", async () => {
    vi.mocked(runExtract).mockRejectedValue(new ValidationError("bad url"));
    const res = await request(app).post("/api/extract").send({ url: "nope" });
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
Expected: FAIL — cannot find module `../src/routes/extract.js`.

- [ ] **Step 3: Create `apps/backend/src/routes/extract.ts`**

```ts
import { Router } from "express";
import { runExtract } from "../pipelines/extract.js";
import { toHttpError } from "../lib/errors.js";

export const extractRouter = Router();

extractRouter.post("/extract", async (req, res) => {
  try {
    const data = await runExtract(req.body?.url ?? "");
    res.json(data);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
```

- [ ] **Step 4: Create `apps/backend/src/routes/config.ts`**

```ts
import { Router } from "express";
import { loadConfig } from "../config/index.js";

export const configRouter = Router();

configRouter.get("/config", (_req, res) => {
  res.json(loadConfig());
});
```

- [ ] **Step 5: Wire routers into `apps/backend/src/server.ts`**

Replace the file with:

```ts
import express, { type Express } from "express";
import { extractRouter } from "./routes/extract.js";
import { configRouter } from "./routes/config.js";

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", extractRouter);
  app.use("/api", configRouter);
  return app;
}
```

- [ ] **Step 6: Load .env at startup — modify `apps/backend/src/index.ts`**

Add the import + call at the very top (so config sees `.env` values), above `createServer` import:

```ts
import { loadEnvFile } from "./config/index.js";
loadEnvFile(process.cwd());
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm --workspace @bya/backend run test -- routes`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/routes apps/backend/src/server.ts apps/backend/src/index.ts apps/backend/tests/routes.test.ts
git commit -m "feat(backend): /api/extract + /api/config routes"
```

---

## Task 9: Manual run script for the extract pipeline

**Files:**
- Create: `apps/backend/scripts/run-extract.ts`

- [ ] **Step 1: Create `apps/backend/scripts/run-extract.ts`**

```ts
import { loadEnvFile } from "../src/config/index.js";
import { runExtract } from "../src/pipelines/extract.js";

loadEnvFile(process.cwd());

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm --workspace @bya/backend run run:extract -- <https-url>");
  process.exit(1);
}

runExtract(url)
  .then((data) => {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAILED:", err?.message ?? err);
    process.exit(1);
  });
```

- [ ] **Step 2: Run it against a real site to verify the slice end-to-end**

Run: `npm --workspace @bya/backend run run:extract -- https://stripe.com`
Expected: prints a JSON object with non-empty `title`, populated `colors.background`, and `fonts`. (Requires the Chromium install from Task 6 Step 4.)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/scripts/run-extract.ts
git commit -m "chore(backend): manual run script for extract pipeline"
```

---

## Task 10: Gated real e2e smoke test

**Files:**
- Create: `apps/backend/tests/extract.e2e.test.ts`

- [ ] **Step 1: Create the gated test**

`apps/backend/tests/extract.e2e.test.ts` (skipped by default; opt in with `BYA_E2E=1`):

```ts
import { describe, it, expect } from "vitest";
import { runExtract } from "../src/pipelines/extract.js";

const run = process.env.BYA_E2E === "1" ? describe : describe.skip;

run("extract e2e (real Playwright)", () => {
  it("measures a real site", async () => {
    const data = await runExtract("https://example.com");
    expect(data.title.length).toBeGreaterThan(0);
    expect(data.finalUrl).toMatch(/^https?:\/\//);
  }, 90_000);
});
```

- [ ] **Step 2: Verify it is skipped in the normal run**

Run: `npm --workspace @bya/backend run test`
Expected: all suites pass; the e2e suite shows as skipped.

- [ ] **Step 3: Verify it passes when enabled**

Run (bash): `BYA_E2E=1 npm --workspace @bya/backend run test -- extract.e2e`
Run (PowerShell): `$env:BYA_E2E=1; npm --workspace @bya/backend run test -- extract.e2e; Remove-Item Env:BYA_E2E`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/tests/extract.e2e.test.ts
git commit -m "test(backend): gated real Playwright e2e smoke for extract"
```

---

## Self-Review

**Spec coverage (this slice):**
- Workspaces monorepo (`apps/backend`, `packages/shared`) — Tasks 1–3. ✓
- `legacy/` archive kept runnable — Task 1. ✓
- Layered backend (routes → pipelines → services) — Tasks 6–8. ✓
- zod contract validation at boundaries (incl. malformed extraction output) — Tasks 2, 7. ✓
- Typed stage-aware errors + HTTP mapping, no secret leakage — Task 5, Task 8 (config test asserts no `sk-`). ✓
- `.env` loader, real `process.env` wins — Task 4. ✓
- `POST /api/extract` + `GET /api/config` — Task 8. ✓
- Verification: per-pipeline run script + mocked unit tests + gated real e2e — Tasks 7–10. ✓
- Out of this slice (later plans): brand/ad-prompt/render pipelines, persistence, migrations, auth. ✓ (scoped out intentionally)

**Type consistency:** `MeasuredSiteData` (shared) is the single return type used by `extractSite` (Task 6), `runExtract` (Task 7), and the route (Task 8). `runExtract(url: string)` signature is identical across the pipeline (Task 7), route (Task 8), and run script (Task 9). `AppError`/`ValidationError`/`ExtractionError` and `toHttpError` (Task 5) are used consistently in the browser service, pipeline, and routes.

**Placeholders:** none — every code step contains full content.
