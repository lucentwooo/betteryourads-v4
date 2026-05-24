# BetterYourAds Creative App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js app that onboards a brand via v4's Playwright website-DNA extraction, displays the 5 stage-one ad concepts + brand vibe, and batch-generates on-brand creatives (Stage 2 prompt → KIE Stage 3 render) into a keep/dismiss Library — all persisted in Supabase behind a shared-password gate.

**Architecture:** Next.js 16 App Router (Node runtime) on local machine. All third-party calls (OpenRouter, KIE, Playwright, Supabase) run server-side in route handlers; secrets never reach the browser. Supabase is a single-tenant datastore accessed with the service-role key. Long-running work (extraction, batch renders) uses synchronous route handlers that write status rows the client polls. The look is ported from the reference repo (`../_betteryourads-ref`) via its `globals.css` design tokens and `AppHeader`/`Wordmark` shell.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui, `@supabase/supabase-js`, Playwright, `next/font` (Bricolage Grotesque / Instrument Serif / JetBrains Mono), Vitest.

**Reference source line ranges** (for verbatim ports — paths relative to repo root):
- `index.html` 183–699 = `STRATEGIST_PROMPT`; 701–1171 = `STAGE2_PROMPT`
- `index.html` 1266–1277 = `stripFences` + `parseJsonLoose`; 1351–1411 = 3-agent grouping/merge; 1521–1534 = `mapAspectRatio`
- `server.js` 52–142 = `extractFromPage`; 144–173 = extract handler; 215–229 = `kieUploadBase64`; 232–301 = KIE generate/result

> These reference files stay in git history; before Phase 1 they are moved to `legacy/` so the new app can own the repo root. Read them from `legacy/index.html` and `legacy/server.js` during implementation.

---

## File structure

```
legacy/                         # moved: old index.html + server.js (read-only reference)
src/
  app/
    layout.tsx                  # root layout, fonts, globals.css
    globals.css                 # ported design tokens
    login/page.tsx              # shared-password form
    api/
      login/route.ts            # verify password -> set signed cookie
      extract/route.ts          # stage-one: playwright + 3-agent analysis -> persist brand+concepts
      brands/[id]/logo/route.ts # logo upload -> storage
      batch/route.ts            # create batch + run stage2/stage3 per concept
      batch/[id]/route.ts       # batch + creatives status (poll)
      creatives/[id]/state/route.ts # keep/dismiss
    (app)/
      layout.tsx                # app shell (AppHeader)
      onboarding/page.tsx       # business -> researching -> confirm
      dashboard/brand/[id]/page.tsx          # combined home+production
      dashboard/brand/[id]/extraction/page.tsx  # full JSON
      dashboard/brand/[id]/batch/[batchId]/page.tsx # generation screen
      dashboard/brand/[id]/library/page.tsx  # keep/dismiss grid
  components/
    AppHeader.tsx  BrandSwitcher.tsx  Wordmark.tsx
    ConceptCard.tsx  CreativeTile.tsx  ProductionClient.tsx
    BatchClient.tsx  LibraryClient.tsx  OnboardingClient.tsx
  lib/
    fonts.ts            # next/font definitions -> CSS vars
    env.ts              # typed env access
    auth.ts             # sign/verify session cookie (Web Crypto HMAC)
    supabase.ts         # admin (service-role) client singleton
    browser.ts          # Playwright chromium singleton
    extract.ts          # extractFromPage + color/json helpers (ported, pure parts tested)
    prompts.ts          # STRATEGIST_PROMPT + STAGE2_PROMPT (verbatim)
    stage1.ts           # 3-agent runner + parse/merge
    stage2.ts           # concept -> ad_prompt (OpenRouter vision)
    kie.ts              # upload + generate + poll
    brand-map.ts        # extraction JSON -> brand row fields + concepts rows
  middleware.ts         # gate everything except /login + /api/login behind cookie
scripts/setup-supabase.mjs  # one-time: create buckets (+ tables if SUPABASE_DB_URL set)
supabase/migrations/0001_initial.sql
tests/                  # vitest unit tests for pure helpers
.env.example
```

---

## Phase 1 — Scaffold & foundations

### Task 1: Move legacy files, scaffold Next.js

**Files:**
- Move: `index.html` → `legacy/index.html`, `server.js` → `legacy/server.js`
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore` (update)

- [ ] **Step 1: Move legacy reference files**

```bash
mkdir legacy
git mv index.html legacy/index.html
git mv server.js legacy/server.js
```

- [ ] **Step 2: Replace package.json**

```json
{
  "name": "betteryourads-v4",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^16.2.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@supabase/supabase-js": "^2.105.1",
    "playwright": "^1.48.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "vitest": "^4.1.6",
    "pg": "^8.13.0",
    "dotenv": "^16.4.5"
  }
}
```

`pg` + `dotenv` are only used by the one-time `scripts/setup-supabase.mjs` (Task 4).

- [ ] **Step 3: Install + Playwright browser**

```bash
npm install
npx playwright install chromium
```
Expected: installs complete; `node_modules` present.

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "legacy"]
}
```

- [ ] **Step 5: Create next.config.ts**

```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Playwright must run in the Node runtime; keep it out of the bundle trace edge.
  serverExternalPackages: ["playwright", "playwright-core"],
};
export default nextConfig;
```

- [ ] **Step 6: Update .gitignore**

Append:
```
node_modules
.next
.env
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: move v4 to legacy/, scaffold Next.js app"
```

### Task 2: Fonts + design tokens

**Files:**
- Create: `src/lib/fonts.ts`, `src/app/globals.css`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/lib/utils.ts`

- [ ] **Step 1: postcss.config.mjs**

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

- [ ] **Step 2: src/lib/fonts.ts** (map Google fonts onto the reference CSS variable names)

```ts
import { Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";

export const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-general-sans", display: "swap" });
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
export const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--font-instrument-serif", display: "swap" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });
```

- [ ] **Step 3: src/app/globals.css**

Copy `../_betteryourads-ref/src/app/globals.css` verbatim, then delete the first three `@import` lines that pull `tw-animate-css` and `shadcn/tailwind.css` (we aren't installing those), keeping `@import "tailwindcss";`. Everything from `@custom-variant` onward is unchanged.

- [ ] **Step 4: src/lib/utils.ts**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 5: src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import { display, instrumentSerif, bricolage, jetbrainsMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = { title: "BetterYourAds", description: "Stage-one-driven ad creative generation." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${instrumentSerif.variable} ${bricolage.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--cream)] text-[var(--ink)]">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Verify it boots**

Run: `npm run dev`
Expected: dev server starts on a port with no compile error (a 404 at `/` is fine — no page yet).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: tailwind v4 + ported design tokens + fonts + root layout"
```

### Task 3: Env access + .env.example

**Files:**
- Create: `src/lib/env.ts`, update `.env.example`

- [ ] **Step 1: .env.example**

```
# Shared password gate
APP_PASSWORD=
SESSION_SECRET=

# OpenRouter (stage 1 + stage 2)
OPENROUTER_API_KEY=
STAGE1_MODEL=deepseek/deepseek-v4-flash
STAGE2_MODEL=openai/gpt-5-nano

# KIE (stage 3 image generation)
KIE_API_KEY=
KIE_IMAGE_MODEL=gpt-image-2-image-to-image
KIE_IMAGE_RESOLUTION=1K

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# Optional — only used by `npm run setup:db` to auto-create tables.
# Supabase dashboard -> Settings -> Database -> Connection string -> URI.
SUPABASE_DB_URL=
```

> Note: the user's existing root `.env` uses the names `SUPABASE_URL` and
> `SUPABASE_SERVICE_ROLE_KEY` with occasional surrounding spaces/quotes. In the
> new local `.env`, set `NEXT_PUBLIC_SUPABASE_URL` to the same project URL value,
> and copy the service-role key across. Strip the surrounding quotes/spaces.

- [ ] **Step 2: src/lib/env.ts**

```ts
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
export const env = {
  appPassword: () => requireEnv("APP_PASSWORD"),
  sessionSecret: () => requireEnv("SESSION_SECRET"),
  openrouterKey: () => requireEnv("OPENROUTER_API_KEY"),
  stage1Model: () => process.env.STAGE1_MODEL || "deepseek/deepseek-v4-flash",
  stage2Model: () => process.env.STAGE2_MODEL || "openai/gpt-5-nano",
  kieKey: () => requireEnv("KIE_API_KEY"),
  kieModel: () => process.env.KIE_IMAGE_MODEL || "gpt-image-2-image-to-image",
  kieResolution: () => process.env.KIE_IMAGE_RESOLUTION || "1K",
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
};
```

- [ ] **Step 3: Create local .env** (not committed) by copying `.env.example` and filling values from the existing `.env` in repo root that the user maintains.

- [ ] **Step 4: Commit**

```bash
git add .env.example src/lib/env.ts
git commit -m "feat: typed env access + .env.example"
```

### Task 4: Supabase admin client + schema migration

**Files:**
- Create: `src/lib/supabase.ts`, `supabase/migrations/0001_initial.sql`

- [ ] **Step 1: src/lib/supabase.ts**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let cached: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

- [ ] **Step 2: supabase/migrations/0001_initial.sql**

```sql
create extension if not exists pgcrypto;

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  business_type text,
  logo_path text,
  brand_vibe text,
  brand_vibe_note text,
  color_primary text, color_secondary text, color_accent text,
  color_background text, color_text text,
  extraction_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  awareness_stage text,            -- reserved for post-MVP; left null
  name text, headline text, subheadline text, cta text,
  angle text, hook text, proof_point text, visual_metaphor text,
  suggested_layout text, rationale text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index concepts_brand_idx on public.concepts(brand_id);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  inspiration_image_path text,
  status text not null default 'running' check (status in ('running','done','partial')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index batches_brand_idx on public.batches(brand_id, created_at desc);

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,
  status text not null default 'generating' check (status in ('generating','done','failed')),
  state text not null default 'inbox' check (state in ('inbox','kept','dismissed')),
  stage2_prompt jsonb,
  image_path text,
  aspect_ratio text, resolution text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index creatives_brand_idx on public.creatives(brand_id, state, created_at desc);
create index creatives_batch_idx on public.creatives(batch_id);
```

- [ ] **Step 3: Create the setup script** `scripts/setup-supabase.mjs`

Auto-creates the 3 storage buckets (works with the service-role key) and, if
`SUPABASE_DB_URL` is set, applies `0001_initial.sql` over a direct Postgres
connection. If `SUPABASE_DB_URL` is absent, it prints the SQL path + a clear
instruction so a human can paste it once.

```js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// 1. Buckets (idempotent).
for (const name of ["logos", "inspiration", "creatives"]) {
  const { error } = await sb.storage.createBucket(name, { public: true });
  if (error && !/already exists/i.test(error.message)) console.warn(`bucket ${name}: ${error.message}`);
  else console.log(`bucket ${name}: ok`);
}

// 2. Schema (only if a DB connection string is provided).
const dbUrl = process.env.SUPABASE_DB_URL;
const sqlPath = join(__dirname, "..", "supabase", "migrations", "0001_initial.sql");
if (dbUrl) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(readFileSync(sqlPath, "utf8"));
  await client.end();
  console.log("schema applied via SUPABASE_DB_URL");
} else {
  console.log(`\nSUPABASE_DB_URL not set — apply the schema once manually:`);
  console.log(`  1. Open Supabase dashboard -> SQL Editor`);
  console.log(`  2. Paste the contents of ${sqlPath} and run it.`);
}
```

- [ ] **Step 4: Add the `setup:db` npm script**

In `package.json` scripts add: `"setup:db": "node scripts/setup-supabase.mjs"`.

- [ ] **Step 5: Run setup**

Run: `npm run setup:db`
Expected: prints `bucket logos: ok` (×3) and either `schema applied via SUPABASE_DB_URL` or the manual-paste instructions. If schema wasn't auto-applied, the smoke-test steps (Tasks 12, 17, 19) depend on the tables existing — note this in the final handoff.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.ts supabase/migrations/0001_initial.sql scripts/setup-supabase.mjs package.json
git commit -m "feat: supabase admin client + schema + automated setup script"
```

### Task 5: Shared-password auth (cookie + middleware + login)

**Files:**
- Create: `src/lib/auth.ts`, `src/middleware.ts`, `src/app/api/login/route.ts`, `src/app/login/page.tsx`
- Test: `tests/auth.test.ts`

- [ ] **Step 1: Write failing test for sign/verify**

`tests/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "@/lib/auth";

describe("session cookie", () => {
  it("verifies a token it signed", async () => {
    const token = await signSession("secret-123");
    expect(await verifySession(token, "secret-123")).toBe(true);
  });
  it("rejects a tampered token", async () => {
    const token = await signSession("secret-123");
    expect(await verifySession(token + "x", "secret-123")).toBe(false);
  });
  it("rejects under a different secret", async () => {
    const token = await signSession("secret-123");
    expect(await verifySession(token, "other")).toBe(false);
  });
});
```

- [ ] **Step 2: Add vitest config + run to confirm failure**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
```
Run: `npm test`
Expected: FAIL — `signSession`/`verifySession` not found.

- [ ] **Step 3: Implement src/lib/auth.ts** (Web Crypto HMAC, edge-safe)

```ts
const enc = new TextEncoder();
const PAYLOAD = "ok";

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}
export async function signSession(secret: string): Promise<string> {
  return `${PAYLOAD}.${await hmac(secret, PAYLOAD)}`;
}
export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (payload !== PAYLOAD || !sig) return false;
  return sig === (await hmac(secret, PAYLOAD));
}
export const SESSION_COOKIE = "bya_session";
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npm test`
Expected: PASS (3 tests).

- [ ] **Step 5: src/middleware.ts**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
export const config = {
  // Gate everything except the login page, the login API, and static assets.
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: src/app/api/login/route.ts**

```ts
import { NextResponse } from "next/server";
import { signSession, SESSION_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  if (password !== env.appPassword()) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(env.sessionSecret()), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
```

- [ ] **Step 7: src/app/login/page.tsx** (client form)

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) router.push("/onboarding");
    else setError((await res.json()).error ?? "Login failed");
  }
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[1.3rem] border hairline bg-card p-6">
        <h1 className="display text-2xl">Enter password</h1>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-4 h-11 w-full rounded-xl border-hairline bg-paper px-3" placeholder="Password" autoFocus />
        {error && <p className="mt-2 text-sm text-coral">{error}</p>}
        <button className="btn-chunk mt-4 w-full justify-center" type="submit">Continue</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 8: Manual verify**

Run `npm run dev`, open `/dashboard` → should redirect to `/login`. Enter the `APP_PASSWORD` from `.env` → redirects to `/onboarding` (404 page for now, expected). Wrong password → error shown.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: shared-password gate (signed cookie + middleware + login)"
```

### Task 6: App shell (Wordmark, BrandSwitcher, AppHeader, app layout)

**Files:**
- Create: `src/components/Wordmark.tsx`, `src/components/BrandSwitcher.tsx`, `src/components/AppHeader.tsx`, `src/app/(app)/layout.tsx`

- [ ] **Step 1: src/components/Wordmark.tsx**

Port `../_betteryourads-ref/src/components/ui/wordmark.tsx` verbatim, changing the import `@/lib/utils` (already exists). Keep the `better`*your*`ads` markup.

- [ ] **Step 2: src/components/BrandSwitcher.tsx** (client)

```tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function BrandSwitcher({ brands, activeId }: { brands: { id: string; name: string }[]; activeId?: string }) {
  const [open, setOpen] = useState(false);
  const active = brands.find((b) => b.id === activeId);
  if (brands.length === 0) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full border hairline bg-paper px-3 py-1.5 text-sm">
        {active?.name ?? "Select brand"} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 min-w-48 rounded-xl border hairline bg-paper p-1 shadow">
          {brands.map((b) => (
            <Link key={b.id} href={`/dashboard/brand/${b.id}`} onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm hover:bg-cream">{b.name}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: src/components/AppHeader.tsx** (server component)

```tsx
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { admin } from "@/lib/supabase";

export async function AppHeader({ activeBrandId }: { activeBrandId?: string }) {
  const { data } = await admin().from("brands").select("id, name").order("created_at", { ascending: false });
  const brands = (data ?? []) as { id: string; name: string }[];
  const active = activeBrandId ?? brands[0]?.id;
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--ink-faint)] bg-[var(--paper)]/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-8 px-8">
        <Link href="/onboarding"><Wordmark size="sm" /></Link>
        <BrandSwitcher brands={brands} activeId={active} />
        <nav className="ml-auto flex items-center gap-6 text-sm">
          {active && <Link href={`/dashboard/brand/${active}`}>Dashboard</Link>}
          {active && <Link href={`/dashboard/brand/${active}/library`}>Library</Link>}
          <Link href="/onboarding" className="text-ink/60 hover:text-ink">+ New brand</Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: src/app/(app)/layout.tsx**

```tsx
import { AppHeader } from "@/components/AppHeader";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      {/* @ts-expect-error async server component */}
      <AppHeader />
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: app shell (wordmark, brand switcher, header, app layout)"
```

---

## Phase 2 — Onboarding & stage-one extraction

### Task 7: Port prompts + pure helpers (TDD)

**Files:**
- Create: `src/lib/prompts.ts`, `src/lib/extract.ts`
- Test: `tests/extract.test.ts`

- [ ] **Step 1: src/lib/prompts.ts**

Create two exported string constants. Copy `STRATEGIST_PROMPT` from `legacy/index.html` lines 183–699 and `STAGE2_PROMPT` from lines 701–1171, verbatim, as backtick template strings:
```ts
export const STRATEGIST_PROMPT = `...verbatim...`;
export const STAGE2_PROMPT = `...verbatim...`;
```

- [ ] **Step 2: Write failing tests for pure helpers**

`tests/extract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { stripFences, parseJsonLoose, mapAspectRatio } from "@/lib/extract";

describe("stripFences", () => {
  it("pulls JSON out of a fenced block", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
describe("parseJsonLoose", () => {
  it("parses fenced JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("parses the outermost object when surrounded by prose", () => {
    expect(parseJsonLoose('here you go: {"a":2} thanks')).toEqual({ a: 2 });
  });
});
describe("mapAspectRatio", () => {
  it("passes supported ratios through", () => { expect(mapAspectRatio("16:9")).toBe("16:9"); });
  it("maps 4:5 to nearest portrait 3:4", () => { expect(mapAspectRatio("4:5")).toBe("3:4"); });
  it("defaults junk to auto", () => { expect(mapAspectRatio("banana")).toBe("auto"); });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npm test -- extract`
Expected: FAIL — module/exports missing.

- [ ] **Step 4: Implement src/lib/extract.ts**

Port from legacy: `stripFences` + `parseJsonLoose` (index.html 1266–1277) and `mapAspectRatio` (index.html 1521–1534) as named exports. Also port `extractFromPage` (server.js 52–142) as a named export `extractFromPage` (a plain function to run inside `page.evaluate`). Example for the pure helpers:
```ts
export function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
export function parseJsonLoose(s: string): unknown {
  const cleaned = stripFences(s);
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
  throw new Error("no JSON object found in response");
}
export function mapAspectRatio(ar?: string): string {
  if (!ar) return "auto";
  const s = String(ar).trim();
  if (["1:1","16:9","9:16","4:3","3:4"].includes(s)) return s;
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
// + extractFromPage ported verbatim from legacy/server.js 52-142
```

- [ ] **Step 5: Run to confirm pass**

Run: `npm test -- extract`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompts.ts src/lib/extract.ts tests/extract.test.ts
git commit -m "feat: port prompts + extraction helpers (tested)"
```

### Task 8: Playwright browser singleton + stage-1 runner

**Files:**
- Create: `src/lib/browser.ts`, `src/lib/stage1.ts`

- [ ] **Step 1: src/lib/browser.ts**

```ts
import { chromium, type Browser } from "playwright";
let p: Promise<Browser> | null = null;
export function getBrowser(): Promise<Browser> {
  if (!p) p = chromium.launch({ headless: true });
  return p;
}
```

- [ ] **Step 2: src/lib/stage1.ts** (extract page data + 3-agent analysis)

Port the grounded-prompt assembly + `AGENT_GROUPS`/`runAgent`/merge from `legacy/index.html` 1330–1411 into a server function. Signature:
```ts
import { getBrowser } from "@/lib/browser";
import { extractFromPage, parseJsonLoose } from "@/lib/extract";
import { STRATEGIST_PROMPT } from "@/lib/prompts";
import { env } from "@/lib/env";

const AGENT_GROUPS = [
  { name: "A", keys: ["brand_identity","visual_brand_system","product_representation","offer_dna"] },
  { name: "B", keys: ["messaging_foundation","proof_library","customer_dna_from_website","external_customer_research_plan","competitor_intelligence","claim_constraints"] },
  { name: "C", keys: ["static_ad_creative_recommendations","missing_information","source_map"] },
];

export async function extractSite(url: string) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const data = await page.evaluate(extractFromPage);
    data.finalUrl = page.url();
    return data;
  } finally { await ctx.close().catch(() => {}); }
}

async function runAgent(basePrompt: string, group: typeof AGENT_GROUPS[number]) {
  const directive = `\n\n=== PARALLEL EXTRACTION DIRECTIVE (OVERRIDES output-format above) ===\nReturn a SINGLE valid JSON object containing EXACTLY these top-level keys and nothing else: ${JSON.stringify(group.keys)}. No markdown fences.`;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openrouterKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.stage1Model(), messages: [{ role: "user", content: basePrompt + directive }] }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`Agent ${group.name}: ${json?.error?.message ?? r.status}`);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Agent ${group.name}: empty`);
  return parseJsonLoose(content) as Record<string, unknown>;
}

export async function runStage1(url: string) {
  const extracted = await extractSite(url);
  const base =
    `Website to analyze: ${extracted.finalUrl || url}\n\n=== MEASURED SITE DATA (authoritative) ===\nUse these EXACT hex codes and font names.\n\n` +
    JSON.stringify({ title: extracted.title, description: extracted.description, colors: extracted.colors, cssColorVariables: extracted.cssColorVariables, fonts: extracted.fonts, logos: extracted.logos }, null, 2) +
    `\n\n=== PAGE TEXT ===\n${extracted.text || ""}\n=== END SITE DATA ===\n\n` + STRATEGIST_PROMPT;
  const settled = await Promise.allSettled(AGENT_GROUPS.map((g) => runAgent(base, g)));
  const merged: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") Object.assign(merged, s.value);
    else errors.push(s.reason instanceof Error ? s.reason.message : String(s.reason));
  }
  if (Object.keys(merged).length === 0) throw new Error(`All agents failed: ${errors.join("; ")}`);
  return { extraction: merged, errors };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/browser.ts src/lib/stage1.ts
git commit -m "feat: playwright singleton + stage-1 3-agent extraction runner"
```

### Task 9: Extraction → brand fields mapping (TDD)

**Files:**
- Create: `src/lib/brand-map.ts`
- Test: `tests/brand-map.test.ts`

- [ ] **Step 1: Write failing test**

`tests/brand-map.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapBrandFields, mapConcepts } from "@/lib/brand-map";

const extraction = {
  visual_brand_system: {
    colors: { primary: ["#111111"], secondary: ["#222222"], accent: ["#333333"], background: ["#ffffff"], text: ["#000000"] },
    ui_style: { overall_mood: "clean enterprise SaaS" },
  },
  static_ad_creative_recommendations: {
    ad_concepts: [
      { concept_name: "Pain Lead", suggested_headline: "Stop losing leads", suggested_cta: "Start free", hook: "h", proof_point: "p", visual_metaphor: "m", suggested_layout: "split", why_this_should_work: "because" },
    ],
  },
};

describe("mapBrandFields", () => {
  it("pulls 5 colors + vibe from extraction", () => {
    const f = mapBrandFields(extraction);
    expect(f.color_primary).toBe("#111111");
    expect(f.color_text).toBe("#000000");
    expect(f.brand_vibe).toBe("clean enterprise SaaS");
  });
  it("tolerates missing fields", () => {
    expect(mapBrandFields({}).color_primary).toBeNull();
  });
});

describe("mapConcepts", () => {
  it("maps ad_concepts into concept rows", () => {
    const c = mapConcepts(extraction);
    expect(c).toHaveLength(1);
    expect(c[0].name).toBe("Pain Lead");
    expect(c[0].headline).toBe("Stop losing leads");
    expect(c[0].cta).toBe("Start free");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- brand-map`
Expected: FAIL.

- [ ] **Step 3: Implement src/lib/brand-map.ts**

```ts
type AnyObj = Record<string, any>;
const first = (a: unknown): string | null => (Array.isArray(a) && a.length ? String(a[0]) : null);

export function mapBrandFields(extraction: AnyObj) {
  const colors = extraction?.visual_brand_system?.colors ?? {};
  return {
    color_primary: first(colors.primary),
    color_secondary: first(colors.secondary),
    color_accent: first(colors.accent),
    color_background: first(colors.background),
    color_text: first(colors.text),
    brand_vibe: extraction?.visual_brand_system?.ui_style?.overall_mood ?? null,
    brand_vibe_note: extraction?.brand_identity?.one_line_description ?? null,
  };
}

export function mapConcepts(extraction: AnyObj) {
  const list = extraction?.static_ad_creative_recommendations?.ad_concepts ?? [];
  return (list as AnyObj[]).map((c) => ({
    name: c.concept_name ?? null,
    headline: c.suggested_headline ?? null,
    subheadline: c.suggested_subheadline ?? null,
    cta: c.suggested_cta ?? null,
    angle: c.main_angle ?? c.ad_angle ?? null,
    hook: c.hook ?? null,
    proof_point: c.proof_point ?? null,
    visual_metaphor: c.visual_metaphor ?? null,
    suggested_layout: c.suggested_layout ?? null,
    rationale: c.why_this_should_work ?? null,
    awareness_stage: null,
    raw: c,
  }));
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm test -- brand-map`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brand-map.ts tests/brand-map.test.ts
git commit -m "feat: map extraction JSON -> brand fields + concept rows (tested)"
```

### Task 10: `/api/extract` route (persist brand + concepts)

**Files:**
- Create: `src/app/api/extract/route.ts`

- [ ] **Step 1: Implement route**

```ts
import { NextResponse } from "next/server";
import { runStage1 } from "@/lib/stage1";
import { mapBrandFields, mapConcepts } from "@/lib/brand-map";
import { admin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { name, url, businessType } = await req.json();
  if (!name || !/^https?:\/\//i.test(url ?? "")) {
    return NextResponse.json({ error: "name and a valid http(s) url are required" }, { status: 400 });
  }
  try {
    const { extraction, errors } = await runStage1(url);
    const fields = mapBrandFields(extraction);
    const db = admin();
    const { data: brand, error: be } = await db.from("brands").insert({
      name, url, business_type: businessType ?? null, extraction_json: extraction, ...fields,
    }).select("id").single();
    if (be) throw be;
    const concepts = mapConcepts(extraction).map((c) => ({ ...c, brand_id: brand.id }));
    if (concepts.length) {
      const { error: ce } = await db.from("concepts").insert(concepts);
      if (ce) throw ce;
    }
    return NextResponse.json({ brandId: brand.id, warnings: errors });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual verify**

With `.env` filled and a brand created later via the UI (Task 12), confirm a `brands` row + `concepts` rows appear in Supabase. (Standalone curl test optional.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/extract/route.ts
git commit -m "feat: /api/extract runs stage 1 and persists brand + concepts"
```

### Task 11: Logo upload route

**Files:**
- Create: `src/app/api/brands/[id]/logo/route.ts`

- [ ] **Step 1: Implement route**

```ts
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${id}/logo.${ext}`;
  const db = admin();
  const { error } = await db.storage.from("logos").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("brands").update({ logo_path: path }).eq("id", id);
  const { data } = db.storage.from("logos").getPublicUrl(path);
  return NextResponse.json({ logoUrl: data.publicUrl, path });
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/brands/[id]/logo/route.ts"
git commit -m "feat: brand logo upload to storage"
```

### Task 12: Onboarding UI

**Files:**
- Create: `src/app/(app)/onboarding/page.tsx`, `src/components/OnboardingClient.tsx`

- [ ] **Step 1: src/components/OnboardingClient.tsx**

Three-step client component (`business` → `researching` → `done`). Port the visual structure from `../_betteryourads-ref/src/app/(app)/onboarding/page.tsx` (the `BusinessStep` + `ResearchingStep` markup, `btn-chunk`, business-type chips). On submit:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["saas-b2b","saas-b2c","dtc","service","other"];

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<"business"|"researching">("business");
  const [name, setName] = useState(""); const [url, setUrl] = useState("");
  const [type, setType] = useState("saas-b2b"); const [error, setError] = useState<string|null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setStep("researching"); setError(null);
    const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, businessType: type }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Extraction failed"); setStep("business"); return; }
    router.push(`/dashboard/brand/${data.brandId}`);
  }
  // ...render business form (name, url, type chips) when step==="business",
  //    and an animated "Reading your site…" panel when step==="researching".
  //    Use the ported markup. Show {error} if present.
}
```
(The logo upload can also be offered here after the brand exists, or deferred to the dashboard — for MVP, upload logo on the dashboard via the existing `/api/brands/[id]/logo` route. Keep onboarding to name/url/type.)

- [ ] **Step 2: src/app/(app)/onboarding/page.tsx**

```tsx
import { OnboardingClient } from "@/components/OnboardingClient";
export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="eyebrow text-ink/55">Onboarding · 01</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">Tell us about <span className="display-italic">your business</span>.</h1>
      <OnboardingClient />
    </main>
  );
}
```

- [ ] **Step 3: Manual verify (end-to-end stage one)**

Run `npm run dev`, log in, go to `/onboarding`, enter a real company + URL, submit. After ~30–60s it should redirect to `/dashboard/brand/<id>` (404 page until Task 13). Confirm `brands` + `concepts` rows in Supabase.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: onboarding UI runs stage-one extraction"
```

---

## Phase 3 — Dashboard (combined home + production)

### Task 13: Brand dashboard page

**Files:**
- Create: `src/app/(app)/dashboard/brand/[id]/page.tsx`, `src/components/ConceptCard.tsx`, `src/components/ProductionClient.tsx`

- [ ] **Step 1: src/components/ConceptCard.tsx**

```tsx
"use client";
export type Concept = { id: string; name: string|null; headline: string|null; subheadline: string|null; cta: string|null; rationale: string|null };
export function ConceptCard({ concept, selected, onToggle }: { concept: Concept; selected: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`rounded-[1.3rem] border p-5 text-left transition ${selected ? "border-[var(--ultra)] bg-[var(--ultra-tint)]" : "border-hairline bg-card hover:border-ink/40"}`}>
      <div className="eyebrow text-ink/50">{concept.name ?? "Concept"}</div>
      <div className="mt-2 h2">{concept.headline ?? "—"}</div>
      {concept.subheadline && <p className="mt-1 text-sm text-ink/70">{concept.subheadline}</p>}
      {concept.rationale && <p className="mt-3 text-xs text-ink/55">{concept.rationale}</p>}
      {concept.cta && <span className="mt-3 inline-block rounded-full border hairline px-3 py-1 text-xs">{concept.cta}</span>}
    </button>
  );
}
```

- [ ] **Step 2: src/components/ProductionClient.tsx** (multi-select + start batch)

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConceptCard, type Concept } from "@/components/ConceptCard";

export function ProductionClient({ brandId, concepts }: { brandId: string; concepts: Concept[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function generate() {
    if (sel.size === 0 || !file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("brandId", brandId);
    fd.append("conceptIds", JSON.stringify([...sel]));
    fd.append("inspiration", file);
    const res = await fetch("/api/batch", { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/dashboard/brand/${brandId}/batch/${data.batchId}`);
  }
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {concepts.map((c) => <ConceptCard key={c.id} concept={c} selected={sel.has(c.id)} onToggle={() => toggle(c.id)} />)}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="btn-chunk" disabled={busy || sel.size === 0 || !file} onClick={generate}>
          Generate {sel.size} creative{sel.size === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: src/app/(app)/dashboard/brand/[id]/page.tsx** (server)

```tsx
import Link from "next/link";
import { admin } from "@/lib/supabase";
import { ProductionClient } from "@/components/ProductionClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data: brand } = await db.from("brands").select("*").eq("id", id).single();
  const { data: concepts } = await db.from("concepts").select("*").eq("brand_id", id).order("created_at");
  if (!brand) return <main className="p-12">Brand not found.</main>;
  const swatches = [["Primary", brand.color_primary],["Secondary", brand.color_secondary],["Accent", brand.color_accent],["Background", brand.color_background],["Text", brand.color_text]] as const;
  const logoUrl = brand.logo_path ? db.storage.from("logos").getPublicUrl(brand.logo_path).data.publicUrl : null;
  const snippet = JSON.stringify(brand.extraction_json).slice(0, 600);
  return (
    <main className="mx-auto max-w-[1200px] px-12 py-10">
      <h1 className="display text-4xl">{brand.name}</h1>
      <p className="mt-1 text-ink/60">{brand.url} · {brand.brand_vibe ?? "—"}</p>
      <section className="mt-6 flex flex-wrap items-center gap-4">
        {logoUrl && <img src={logoUrl} alt="logo" className="h-12 w-12 rounded border hairline object-contain" />}
        {swatches.map(([label, hex]) => hex && (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="h-6 w-6 rounded border hairline" style={{ background: hex }} /> {label} {hex}
          </div>
        ))}
      </section>
      <section className="mt-6 rounded-xl border hairline bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-ink/50">Extraction JSON (preview)</span>
          <Link className="text-sm text-[var(--ultra)]" href={`/dashboard/brand/${id}/extraction`}>View full →</Link>
        </div>
        <pre className="mt-2 overflow-hidden text-xs text-ink/60">{snippet}…</pre>
      </section>
      <h2 className="h2 mt-10">Concepts</h2>
      <div className="mt-4"><ProductionClient brandId={id} concepts={(concepts ?? []) as any} /></div>
    </main>
  );
}
```

- [ ] **Step 4: Manual verify** — dashboard shows brand name, vibe, color swatches, JSON preview, and the 5 concept cards.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: combined dashboard (overview + json preview + concept production)"
```

### Task 14: Full extraction JSON page

**Files:**
- Create: `src/app/(app)/dashboard/brand/[id]/extraction/page.tsx`

- [ ] **Step 1: Implement**

```tsx
import { admin } from "@/lib/supabase";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: brand } = await admin().from("brands").select("name, extraction_json").eq("id", id).single();
  if (!brand) return <main className="p-12">Not found.</main>;
  return (
    <main className="mx-auto max-w-[1000px] px-12 py-10">
      <h1 className="display text-3xl">{brand.name} — full extraction</h1>
      <pre className="mt-6 overflow-auto rounded-xl border hairline bg-card p-4 text-xs leading-relaxed">
        {JSON.stringify(brand.extraction_json, null, 2)}
      </pre>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: full extraction JSON page"
```

---

## Phase 4 — Batch (Stage 2 + Stage 3)

### Task 15: KIE client + Stage-2 prompt builder

**Files:**
- Create: `src/lib/kie.ts`, `src/lib/stage2.ts`

- [ ] **Step 1: src/lib/kie.ts**

Port `kieUploadBase64`, generate (createTask), and poll (recordInfo) from `legacy/server.js` 215–301 into typed functions:
```ts
import { env } from "@/lib/env";

export async function kieUploadBase64(base64Data: string, fileName: string): Promise<string> {
  const r = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
    method: "POST", headers: { Authorization: `Bearer ${env.kieKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Data, uploadPath: "images/ad", fileName }),
  });
  const data = await r.json().catch(() => null);
  const url = data?.data?.downloadUrl;
  if (!r.ok || !url) throw new Error(`image upload failed: ${data?.msg ?? r.status}`);
  return url;
}

export async function kieCreateTask(prompt: string, inputUrls: string[], aspect_ratio: string, resolution: string): Promise<string> {
  if (aspect_ratio === "1:1" && resolution === "4K") resolution = "2K";
  const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST", headers: { Authorization: `Bearer ${env.kieKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.kieModel(), input: { prompt: prompt.slice(0, 20000), input_urls: inputUrls, aspect_ratio, resolution } }),
  });
  const data = await r.json().catch(() => null);
  const taskId = data?.data?.taskId;
  if (!r.ok || data?.code !== 200 || !taskId) throw new Error(`KIE createTask: ${data?.msg ?? r.status}`);
  return taskId;
}

export async function kiePoll(taskId: string): Promise<{ state: string; urls: string[]; failMsg?: string }> {
  const r = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${env.kieKey()}` },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.code !== 200) throw new Error(`KIE recordInfo: ${data?.msg ?? r.status}`);
  const d = data.data ?? {};
  let urls: string[] = [];
  if (d.resultJson) { try { const p = JSON.parse(d.resultJson); urls = p.resultUrls ?? p.result_urls ?? []; } catch {} }
  return { state: String(d.state ?? ""), urls, failMsg: d.failMsg ?? d.failCode };
}
```

- [ ] **Step 2: src/lib/stage2.ts** (concept → ad_prompt via OpenRouter vision)

```ts
import { STAGE2_PROMPT } from "@/lib/prompts";
import { parseJsonLoose, mapAspectRatio } from "@/lib/extract";
import { env } from "@/lib/env";

type Concept = Record<string, any>;

export async function buildAdPrompt(extraction: unknown, concept: Concept, inspirationDataUrl: string) {
  const text = STAGE2_PROMPT +
    `\n\n=== BRAND_EXTRACTION_JSON ===\n${JSON.stringify(extraction)}` +
    `\n\n=== OPTIONAL_USER_DIRECTION ===\nBuild this specific concept: ${JSON.stringify(concept)}` +
    `\n\n=== REFERENCE_AD_IMAGE ===\nThe reference ad image is attached. Analyze it as REFERENCE_AD_IMAGE.`;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${env.openrouterKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.stage2Model(), messages: [{ role: "user", content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: inspirationDataUrl } },
    ] }] }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message ?? `stage2 HTTP ${r.status}`);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("stage2 empty response");
  const parsed = parseJsonLoose(content) as any;
  const adPrompt = parsed?.ad_prompt ?? parsed;
  const aspect = mapAspectRatio(adPrompt?.canvas?.aspect_ratio);
  return { adPrompt, promptText: JSON.stringify(adPrompt), aspect };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/kie.ts src/lib/stage2.ts
git commit -m "feat: KIE client + stage-2 concept->ad_prompt builder"
```

### Task 16: `/api/batch` — create batch, run stage 2+3 per concept

**Files:**
- Create: `src/app/api/batch/route.ts`

- [ ] **Step 1: Implement** (inspiration uploaded to storage; one creative per concept; run sequentially, persist results, store image in `creatives` bucket)

```ts
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { buildAdPrompt } from "@/lib/stage2";
import { kieUploadBase64, kieCreateTask, kiePoll } from "@/lib/kie";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 800;

async function toDataUrl(file: File): Promise<string> {
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return `data:${file.type};base64,${b64}`;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const brandId = String(form.get("brandId"));
  const conceptIds: string[] = JSON.parse(String(form.get("conceptIds") ?? "[]"));
  const inspiration = form.get("inspiration") as File | null;
  if (!brandId || conceptIds.length === 0 || !inspiration) {
    return NextResponse.json({ error: "brandId, conceptIds, inspiration required" }, { status: 400 });
  }
  const db = admin();
  const { data: brand } = await db.from("brands").select("extraction_json, logo_path").eq("id", brandId).single();
  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  // Store inspiration + create batch.
  const inspPath = `${brandId}/${Date.now()}-insp.png`;
  await db.storage.from("inspiration").upload(inspPath, await inspiration.arrayBuffer(), { contentType: inspiration.type, upsert: true });
  const { data: batch } = await db.from("batches").insert({ brand_id: brandId, inspiration_image_path: inspPath }).select("id").single();

  const inspirationDataUrl = await toDataUrl(inspiration);
  const logoUrl = brand.logo_path ? db.storage.from("logos").getPublicUrl(brand.logo_path).data.publicUrl : null;
  const { data: concepts } = await db.from("concepts").select("*").in("id", conceptIds);

  // Kick off processing without blocking the HTTP response longer than needed:
  // we await it (maxDuration is generous) so statuses are written; the client polls.
  let failures = 0;
  for (const concept of concepts ?? []) {
    const { data: creative } = await db.from("creatives").insert({
      batch_id: batch.id, brand_id: brandId, concept_id: concept.id, status: "generating",
    }).select("id").single();
    try {
      const { adPrompt, promptText, aspect } = await buildAdPrompt(brand.extraction_json, concept, inspirationDataUrl);
      const inspKieUrl = await kieUploadBase64(inspirationDataUrl.split(",")[1], "reference.png");
      const inputs = [inspKieUrl];
      if (logoUrl) inputs.push(logoUrl);
      const resolution = env.kieResolution();
      const taskId = await kieCreateTask(promptText, inputs, aspect, resolution);
      // poll up to ~5 min
      const deadline = Date.now() + 300000; let urls: string[] = [];
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const p = await kiePoll(taskId);
        if (p.state.toLowerCase() === "success") { urls = p.urls; break; }
        if (p.state.toLowerCase() === "fail") throw new Error(p.failMsg ?? "KIE failed");
      }
      if (!urls.length) throw new Error("timed out waiting for KIE");
      // download + store
      const imgRes = await fetch(urls[0]);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const imgPath = `${brandId}/${creative.id}.png`;
      await db.storage.from("creatives").upload(imgPath, buf, { contentType: "image/png", upsert: true });
      await db.from("creatives").update({ status: "done", image_path: imgPath, stage2_prompt: adPrompt, aspect_ratio: aspect, resolution, completed_at: new Date().toISOString() }).eq("id", creative.id);
    } catch (e) {
      failures++;
      await db.from("creatives").update({ status: "failed", error: e instanceof Error ? e.message : String(e) }).eq("id", creative.id);
    }
  }
  const status = failures === 0 ? "done" : failures === (concepts?.length ?? 0) ? "partial" : "partial";
  await db.from("batches").update({ status, completed_at: new Date().toISOString() }).eq("id", batch.id);
  return NextResponse.json({ batchId: batch.id });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/batch/route.ts
git commit -m "feat: batch route runs stage 2+3 per concept, persists creatives"
```

### Task 17: Batch status route + generation screen

**Files:**
- Create: `src/app/api/batch/[id]/route.ts`, `src/app/(app)/dashboard/brand/[id]/batch/[batchId]/page.tsx`, `src/components/BatchClient.tsx`, `src/components/CreativeTile.tsx`

- [ ] **Step 1: src/app/api/batch/[id]/route.ts** (status poll)

```ts
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data: batch } = await db.from("batches").select("*").eq("id", id).single();
  const { data: creatives } = await db.from("creatives").select("*").eq("batch_id", id).order("created_at");
  const withUrls = (creatives ?? []).map((c) => ({ ...c, imageUrl: c.image_path ? db.storage.from("creatives").getPublicUrl(c.image_path).data.publicUrl : null }));
  return NextResponse.json({ batch, creatives: withUrls });
}
```

- [ ] **Step 2: src/components/CreativeTile.tsx**

```tsx
"use client";
export function CreativeTile({ c, onKeep, onDismiss }: { c: any; onKeep?: () => void; onDismiss?: () => void }) {
  return (
    <div className="rounded-[1.3rem] border hairline bg-card p-3">
      {c.status === "generating" && <div className="grid h-64 place-items-center text-sm text-ink/50">Generating…</div>}
      {c.status === "failed" && <div className="grid h-64 place-items-center px-3 text-sm text-coral">Failed: {c.error}</div>}
      {c.status === "done" && c.imageUrl && <img src={c.imageUrl} alt="creative" className="w-full rounded-lg" />}
      {(onKeep || onDismiss) && c.status === "done" && (
        <div className="mt-3 flex gap-2">
          <button onClick={onKeep} className="btn-chunk flex-1 justify-center">Keep</button>
          <button onClick={onDismiss} className="btn-ghost-ink flex-1 justify-center">Dismiss</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: src/components/BatchClient.tsx** (poll until batch not running)

```tsx
"use client";
import { useEffect, useState } from "react";
import { CreativeTile } from "@/components/CreativeTile";

export function BatchClient({ batchId }: { batchId: string }) {
  const [creatives, setCreatives] = useState<any[]>([]);
  const [status, setStatus] = useState("running");
  useEffect(() => {
    let live = true;
    async function tick() {
      const res = await fetch(`/api/batch/${batchId}`);
      const data = await res.json();
      if (!live) return;
      setCreatives(data.creatives ?? []);
      setStatus(data.batch?.status ?? "running");
      if ((data.batch?.status ?? "running") === "running") setTimeout(tick, 3000);
    }
    tick();
    return () => { live = false; };
  }, [batchId]);
  return (
    <div>
      <p className="text-sm text-ink/55">Status: {status}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {creatives.map((c) => <CreativeTile key={c.id} c={c} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: batch page**

```tsx
import Link from "next/link";
import { BatchClient } from "@/components/BatchClient";
export default async function Page({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params;
  return (
    <main className="mx-auto max-w-[1200px] px-12 py-10">
      <h1 className="display text-3xl">Generating creatives</h1>
      <Link href={`/dashboard/brand/${id}/library`} className="text-sm text-[var(--ultra)]">Go to library →</Link>
      <div className="mt-6"><BatchClient batchId={batchId} /></div>
    </main>
  );
}
```

- [ ] **Step 5: Manual verify (end-to-end batch)** — from the dashboard, select a concept, upload an inspiration image, Generate → batch page shows "Generating…" tiles that resolve to images. Confirm `creatives` rows + stored images.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: batch generation screen with polling + creative tiles"
```

---

## Phase 5 — Library (keep / dismiss)

### Task 18: Creative state route + Library screen

**Files:**
- Create: `src/app/api/creatives/[id]/state/route.ts`, `src/app/(app)/dashboard/brand/[id]/library/page.tsx`, `src/components/LibraryClient.tsx`

- [ ] **Step 1: src/app/api/creatives/[id]/state/route.ts**

```ts
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { state } = await req.json();
  if (!["inbox","kept","dismissed"].includes(state)) return NextResponse.json({ error: "bad state" }, { status: 400 });
  const { error } = await admin().from("creatives").update({ state }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: src/components/LibraryClient.tsx**

```tsx
"use client";
import { useState } from "react";
import { CreativeTile } from "@/components/CreativeTile";

export function LibraryClient({ initial }: { initial: any[] }) {
  const [items, setItems] = useState(initial);
  async function setState(id: string, state: string) {
    await fetch(`/api/creatives/${id}/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) });
    setItems((xs) => state === "dismissed" ? xs.filter((x) => x.id !== id) : xs.map((x) => x.id === id ? { ...x, state } : x));
  }
  const kept = items.filter((i) => i.state === "kept");
  const inbox = items.filter((i) => i.state === "inbox");
  return (
    <div className="space-y-10">
      <section>
        <h2 className="h2">Inbox</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {inbox.map((c) => <CreativeTile key={c.id} c={c} onKeep={() => setState(c.id, "kept")} onDismiss={() => setState(c.id, "dismissed")} />)}
          {inbox.length === 0 && <p className="text-sm text-ink/50">No new creatives.</p>}
        </div>
      </section>
      <section>
        <h2 className="h2">Kept</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {kept.map((c) => <CreativeTile key={c.id} c={c} onDismiss={() => setState(c.id, "dismissed")} />)}
          {kept.length === 0 && <p className="text-sm text-ink/50">Nothing kept yet.</p>}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: library page** (query `state in (inbox,kept)`, attach public URLs)

```tsx
import { admin } from "@/lib/supabase";
import { LibraryClient } from "@/components/LibraryClient";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = admin();
  const { data } = await db.from("creatives").select("*").eq("brand_id", id).in("state", ["inbox","kept"]).eq("status","done").order("created_at", { ascending: false });
  const items = (data ?? []).map((c) => ({ ...c, imageUrl: c.image_path ? db.storage.from("creatives").getPublicUrl(c.image_path).data.publicUrl : null }));
  return (
    <main className="mx-auto max-w-[1200px] px-12 py-10">
      <h1 className="display text-3xl">Library</h1>
      <div className="mt-6"><LibraryClient initial={items} /></div>
    </main>
  );
}
```

- [ ] **Step 4: Manual verify** — generate a batch, open Library: creatives appear under Inbox; Keep moves to Kept; Dismiss removes from view. Refresh persists.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: library with keep/dismiss"
```

### Task 19: README handoff note (non-technical) + final smoke

**Files:**
- Modify: `README.md`

> This is the LAST task. The README must be readable by someone who does **not**
> understand code at all. Two parts: a short plain-English handoff note at the
> very top, then the technical setup below it.

- [ ] **Step 1: Run the full smoke test first** (so the note can report real status)

Fresh `npm run dev`: login → onboard a real URL → dashboard shows
concepts/colors/vibe → full JSON page → select concepts + upload inspiration →
batch renders → library keep/dismiss. Note whether the Supabase schema was
auto-applied or still needs the one manual paste (from Task 4 Step 5).

- [ ] **Step 2: Write the plain-English handoff at the top of `README.md`**

Write it warmly and simply (no jargon). It MUST include, in this spirit:

```markdown
# BetterYourAds

> **A note for you (finishing up at 4:12 AM)**
>
> Hey — I built the first working version of the ad tool overnight. In plain terms,
> here's what it now does:
>
> - You type in a company name and its website, and the app automatically "reads"
>   that website — its colours, its logo, what it sells, who it's for — and saves
>   all of that.
> - From that, it gives you **5 ready-made ad ideas** for the brand.
> - You pick the ideas you like, upload one example ad as inspiration, and the app
>   **creates real ad images** for you.
> - Everything you make lands in a **Library**, where you can **keep** the ones you
>   like and **throw away** the ones you don't.
>
> **What you need to do to run it:** [fill in the actual outcome from the smoke test —
> e.g. "everything's ready, just run it" OR "do this one 30-second step first:
> open Supabase, paste in one block of text — exact instructions are further down"].
>
> **Next steps / ideas for later:** sorting the 5 ideas by audience "awareness stage",
> polishing the look, and letting you download the finished ads in bulk.
>
> **This is a starting point — change anything you don't like.** Nothing here is
> permanent; if a wording, colour, or step feels off, it can be adjusted.
>
> I can't see how this turned out since I ran it overnight, but — good luck on
> everything today. 🙌
```

Replace the bracketed `[...]` with the real smoke-test outcome. Keep the tone, the
4:12 AM line, the "change anything you don't like" line, and the good-luck sign-off.

- [ ] **Step 3: Below the note, add the technical setup section**

`## Setup` with: `npm install`, `npx playwright install chromium`, copy
`.env.example` → `.env` and fill keys, `npm run setup:db` (and, if it printed the
manual-paste message, the exact steps to paste `supabase/migrations/0001_initial.sql`
into the Supabase SQL editor), then `npm run dev`. Document the shared-password
gate and the flow (onboard → dashboard → batch → library).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: plain-English overnight handoff note + setup"
```

---

## Self-review

**Spec coverage:**
- Shared-password gate → Task 5. ✅
- Local Node runtime + Playwright kept verbatim → Tasks 7–8 (`extractFromPage`, browser singleton), `next.config.ts` external package. ✅
- Stage 1 prompt verbatim, 3-agent merge → Tasks 7–8. ✅
- 5 concepts parsed from `static_ad_creative_recommendations.ad_concepts`, displayed as-is, awareness deferred (nullable column) → Tasks 9, 13; schema Task 4. ✅
- Brand vibe from `visual_brand_system.ui_style.overall_mood` → Task 9. ✅
- 5 named colors + logo surfaced; rest of palette/typography not shown → Task 13; logo Task 11. ✅
- Combined home+production dashboard + JSON preview + separate full-JSON page → Tasks 13–14. ✅
- Stage 2 verbatim, concept via `OPTIONAL_USER_DIRECTION`, full extraction + inspiration image → Task 15. ✅
- Stage 3 KIE image-to-image (inspiration + logo), download+store → Tasks 15–16. ✅
- One creative per selected concept; multiple batches → Task 16. ✅
- Separate generation screen with in-place loading → Task 17. ✅
- Single Library with kept + inbox, keep/dismiss, dismissed hidden → Task 18. ✅
- Supabase single-tenant via service-role server-side; Storage buckets → Tasks 4, 11, 16. ✅
- App shell (AppHeader + BrandSwitcher + Wordmark), nav Dashboard·Library → Task 6. ✅
- Image persistence (KIE URLs expire) → Task 16 downloads to `creatives` bucket. ✅

**Placeholder scan:** No "TBD/TODO" in code steps. The two verbatim ports (prompts, `extractFromPage`) cite exact legacy line ranges to copy rather than reproducing ~1000 lines inline — acceptable since the source is in-repo at `legacy/`.

**Type consistency:** `admin()` used consistently for the Supabase client; `SESSION_COOKIE`, `signSession`/`verifySession` consistent across auth.ts/middleware/login route; `mapBrandFields`/`mapConcepts` names match between brand-map.ts, its test, and the extract route; creative `status` (generating/done/failed) vs `state` (inbox/kept/dismissed) kept distinct everywhere; `buildAdPrompt`/`kieCreateTask`/`kiePoll` signatures match their call sites in the batch route.

**Notes/risks:**
- The batch route processes concepts sequentially within one request (generous `maxDuration`). If a batch exceeds the limit, creatives already written keep their status; a later enhancement could move processing to a fire-and-forget pattern. Acceptable for local single-tenant MVP.
- shadcn components are not installed; UI uses ported tokens + plain elements. If richer primitives are wanted later, run `npx shadcn init` then add components.
