# SSR Foundation (Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web` as a Next.js (App Router) app that server-renders the shell and hydrates on the client, with a hand-rolled stale-while-revalidate client cache, proven by Home + Library.

**Architecture:** Next App Router owns the document (`app/layout.tsx`); auth + data stay client-side (a `"use client"` providers subtree). `/api/*` is proxied to the unchanged Express backend via a `next.config` rewrite. A small client cache (`src/data/cache.tsx`) serves data from memory and revalidates in the background, replacing spinner-on-every-mount.

**Tech Stack:** Next.js 14.2 (App Router), React 18.3, TypeScript, Vitest + Testing Library (Vite stays only as the test engine), Supabase JS (client-side auth, unchanged).

**Spec:** [Spec #1 — SSR Foundation](../specs/2026-05-30-ssr-foundation-design.md) · **Roadmap:** [program](../specs/2026-05-30-ssr-refactor-roadmap.md)

**Working dir:** worktree `C:\Users\jerem\worktrees\bya-massive-refactor`, branch `worktree/refactor/massive-refactor`. Run commands from the repo root unless stated. Push after each commit is NOT required for this spec phase.

**Key decisions baked in:**
- Next 14.2 + React 18.3 (not Next 15/React 19) — lowest-risk match to the existing React version.
- Next dev runs on **port 3001** (backend keeps 3000); `/api` rewrites to `BACKEND_ORIGIN` (default `http://localhost:3000`).
- `react-router-dom` stays installed this spec (Workbench/Admin/etc. still import it); only AppShell + Home + Library migrate off it. Other routes are stubbed. Full react-router removal is Spec #3.
- `@bya/shared` is raw TS; Next resolves it via `transpilePackages`.
- Plain `<img>` (not `next/image`) — matches current code; no image-domain config needed.

---

### Task 1: Next.js scaffold — deps + config

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/.gitignore`

- [ ] **Step 1: Add Next, update scripts in `apps/web/package.json`**

Replace the whole file with:

```json
{
  "name": "@bya/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@bya/shared": "*",
    "@supabase/supabase-js": "^2.106.2",
    "next": "^14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

(Note: `vite`, `@vitejs/plugin-react`, and `vitest` stay as devDependencies — Vitest runs on Vite. `react-router-dom` stays a runtime dep until Spec #3.)

- [ ] **Step 2: Create `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig = {
  reactStrictMode: true,
  // @bya/shared is published as raw TS source; Next must transpile it.
  transpilePackages: ["@bya/shared"],
  // We use plain <img> and our own lint setup; don't fail the build on Next's lint defaults.
  eslint: { ignoreDuringBuilds: true },
  // One origin for the browser: forward /api/* to the Express backend (unchanged).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 3: Replace `apps/web/tsconfig.json` with a Next-compatible config**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "declaration": false,
    "allowJs": true,
    "incremental": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/web/vitest.config.ts`** (test config, since `vite.config.ts` is being removed in Task 8)

```ts
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@bya/shared": shared } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] },
});
```

- [ ] **Step 5: Create `apps/web/.gitignore`** (the worktree is outside OneDrive, so a normal gitignore is fine)

```
.next/
next-env.d.ts
out/
```

- [ ] **Step 6: Install**

Run: `npm install`
Expected: completes; `apps/web/node_modules/.bin/next` exists. (This adds Next.js — a pre-authorized dependency per the roadmap.)

- [ ] **Step 7: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/package.json apps/web/next.config.mjs apps/web/tsconfig.json apps/web/vitest.config.ts apps/web/.gitignore package-lock.json
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "chore(web): add Next.js scaffold (config, scripts, deps)"
```

---

### Task 2: Client data cache (TDD)

**Files:**
- Create: `apps/web/src/data/cache.tsx`
- Test: `apps/web/src/data/cache.test.tsx`

- [ ] **Step 1: Write the failing test** — create `apps/web/src/data/cache.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { CacheProvider, useResource } from "./cache";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getBrands: vi.fn(), getAds: vi.fn(), getUsage: vi.fn() } };
});
import { api } from "../api/client";

beforeEach(() => vi.clearAllMocks());

function AdsProbe() {
  const { data, status } = useResource<{ id: string }[]>("ads");
  return <div data-testid="probe">{`${status}:${(data ?? []).length}`}</div>;
}

describe("client data cache", () => {
  it("transitions idle→loading→ready and exposes fetched data", async () => {
    vi.mocked(api.getAds).mockResolvedValue([{ id: "a1" }] as never);
    render(
      <CacheProvider>
        <AdsProbe />
      </CacheProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ready:1"));
    expect(api.getAds).toHaveBeenCalledTimes(1);
  });

  it("serves cached data on remount and revalidates in the background (stale-while-revalidate)", async () => {
    vi.mocked(api.getAds).mockResolvedValue([{ id: "a1" }] as never);

    function Harness() {
      const [show, setShow] = useState(true);
      return (
        <CacheProvider>
          <button onClick={() => setShow((v) => !v)}>toggle</button>
          {show ? <AdsProbe /> : null}
        </CacheProvider>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("ready:1"));

    // unmount the consumer, then remount it — the provider (and its store) stays alive
    act(() => void screen.getByText("toggle").click()); // hide
    act(() => void screen.getByText("toggle").click()); // show again

    // cached data is present immediately (length never returns to 0)...
    expect(screen.getByTestId("probe").textContent).not.toBe("ready:0");
    expect(screen.getByTestId("probe").textContent?.endsWith(":1")).toBe(true);
    // ...and a background refresh fires
    await waitFor(() => expect(api.getAds).toHaveBeenCalledTimes(2));
  });

  it("captures the error message when the fetch rejects", async () => {
    vi.mocked(api.getAds).mockRejectedValue(new Error("boom"));
    function ErrProbe() {
      const { status, error } = useResource("ads");
      return <div data-testid="err">{`${status}:${error ?? ""}`}</div>;
    }
    render(
      <CacheProvider>
        <ErrProbe />
      </CacheProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("err").textContent).toBe("error:boom"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @bya/web -- src/data/cache.test.tsx`
Expected: FAIL — `Failed to resolve import "./cache"` (module doesn't exist yet).

- [ ] **Step 3: Write the implementation** — create `apps/web/src/data/cache.tsx`

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "../api/client";

export type ResourceKey = "brands" | "ads" | "usage";
export type ResourceStatus = "idle" | "loading" | "ready" | "error";
type Entry<T> = { data: T | null; status: ResourceStatus; error: string | null };

const FETCHERS: Record<ResourceKey, () => Promise<unknown>> = {
  brands: () => api.getBrands(),
  ads: () => api.getAds(),
  usage: () => api.getUsage(),
};

type Store = {
  get(key: ResourceKey): Entry<unknown>;
  subscribe(cb: () => void): () => void;
  /** First-load if idle, otherwise a background refresh; no-op while already loading. */
  load(key: ResourceKey): void;
  refresh(key: ResourceKey): void;
  invalidate(key: ResourceKey): void;
};

function createStore(): Store {
  const entries = new Map<ResourceKey, Entry<unknown>>();
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((cb) => cb());

  // get() must return a STABLE reference until the entry changes (useSyncExternalStore contract),
  // so we materialise the default entry once and replace the object on every set().
  function get(key: ResourceKey): Entry<unknown> {
    let e = entries.get(key);
    if (!e) {
      e = { data: null, status: "idle", error: null };
      entries.set(key, e);
    }
    return e;
  }
  function set(key: ResourceKey, patch: Partial<Entry<unknown>>) {
    entries.set(key, { ...get(key), ...patch });
    emit();
  }
  function refresh(key: ResourceKey) {
    set(key, { status: "loading", error: null }); // keep existing data → stale-while-revalidate
    FETCHERS[key]()
      .then((data) => set(key, { data, status: "ready", error: null }))
      .catch((err) =>
        set(key, { status: "error", error: err instanceof Error ? err.message : "Failed to load" }),
      );
  }
  function load(key: ResourceKey) {
    if (get(key).status === "loading") return;
    refresh(key);
  }

  return {
    get,
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    load,
    refresh,
    invalidate(key) {
      set(key, { data: null, status: "idle", error: null });
    },
  };
}

const CacheContext = createContext<Store | null>(null);

export function CacheProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Store | null>(null);
  if (!ref.current) ref.current = createStore();
  return <CacheContext.Provider value={ref.current}>{children}</CacheContext.Provider>;
}

function useStore(): Store {
  const store = useContext(CacheContext);
  if (!store) throw new Error("useResource must be used within <CacheProvider>");
  return store;
}

export function useResource<T>(key: ResourceKey): {
  data: T | null;
  status: ResourceStatus;
  error: string | null;
  refresh: () => void;
} {
  const store = useStore();
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.get(key), [store, key]);
  // Client + server snapshots are the same idle/empty entry → SSR renders the loading shell,
  // the fetch is kicked off only in the effect below (which never runs on the server).
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as Entry<T>;
  useEffect(() => {
    store.load(key);
  }, [store, key]);
  const refresh = useCallback(() => store.refresh(key), [store, key]);
  return { data: entry.data, status: entry.status, error: entry.error, refresh };
}

/** Returns a function that eagerly loads brands + ads — call once when auth is approved so the
 *  first navigation is instant (mirrors the legacy boot-load). */
export function usePrimeAfterAuth(): () => void {
  const store = useStore();
  return useCallback(() => {
    store.load("brands");
    store.load("ads");
  }, [store]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @bya/web -- src/data/cache.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/src/data/cache.tsx apps/web/src/data/cache.test.tsx
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "feat(web): hand-rolled stale-while-revalidate client cache"
```

---

### Task 3: RootLayout + providers (+ cache primer)

**Files:**
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/providers.tsx`

- [ ] **Step 1: Create `apps/web/app/providers.tsx`** (the client app subtree)

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "../src/auth/AuthProvider";
import { useAuth } from "../src/auth/useAuth";
import { AuthGate } from "../src/shell/AuthGate";
import { AppShell } from "../src/shell/AppShell";
import { CacheProvider, usePrimeAfterAuth } from "../src/data/cache";

/** Warms the cache once the user is approved, so Home/Library are instant on first nav. */
function CachePrimer() {
  const { status } = useAuth();
  const prime = usePrimeAfterAuth();
  useEffect(() => {
    if (status === "approved") prime();
  }, [status, prime]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CacheProvider>
        <CachePrimer />
        <AuthGate>
          <AppShell>{children}</AppShell>
        </AuthGate>
      </CacheProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/layout.tsx`** (server component; owns the document + global CSS)

```tsx
import type { Metadata, Viewport } from "next";
import "../src/styles/app.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BetterYourAds",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Move static public assets** so `/favicon.svg` etc. still resolve

Run:
```bash
mkdir -p C:/Users/jerem/worktrees/bya-massive-refactor/apps/web/public
git -C C:/Users/jerem/worktrees/bya-massive-refactor mv apps/web/public/favicon.svg apps/web/public/favicon.svg 2>/dev/null || true
```
Expected: `apps/web/public/` already exists with `favicon.svg`, `grain.svg`, `logo-mark.png` (Next serves `public/` at `/`). No move needed if already there — this step is a verification that the folder is present.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/app/layout.tsx apps/web/app/providers.tsx
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "feat(web): Next RootLayout + client providers (auth, cache, shell)"
```

---

### Task 4: Migrate AppShell off react-router

**Files:**
- Modify: `apps/web/src/shell/AppShell.tsx`
- Modify: `apps/web/src/shell/AppShell.test.tsx`

- [ ] **Step 1: Update the test first** — replace `apps/web/src/shell/AppShell.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      email: null,
      signOut: async () => undefined,
    } as ReturnType<typeof useAuth>);
  });

  it("renders the rail brand and its children", () => {
    render(
      <AppShell>
        <div>CHILD</div>
      </AppShell>,
    );
    expect(screen.getByText("BetterYourAds")).toBeInTheDocument();
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @bya/web -- src/shell/AppShell.test.tsx`
Expected: FAIL — AppShell still imports `react-router-dom` / takes no `children` prop.

- [ ] **Step 3: Rewrite `apps/web/src/shell/AppShell.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../auth/useAuth";
import { IconHome, IconSparkle, IconGrid, IconUsers } from "../ui/icons";

const NAV = [
  { to: "/", label: "Home", Icon: IconHome, end: true },
  { to: "/create", label: "Make an ad", Icon: IconSparkle, end: false },
  { to: "/library", label: "Library", Icon: IconGrid, end: false },
] as const;

const CRUMBS: Record<string, string> = {
  "/": "Home",
  "/create": "Make an ad",
  "/library": "Library",
  "/admin": "Accounts",
  "/admin/reference-ads": "Reference ads",
};

// Only this account sees / can reach the admin dashboard (mirrors the backend gate).
const ADMIN_EMAIL = "admin@betteryourads.dev";

function initial(email: string | null): string {
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

function isActive(pathname: string, to: string, end: boolean): boolean {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { email, signOut } = useAuth();
  const pathname = usePathname() ?? "/";
  const current = CRUMBS[pathname] ?? "Make an ad";
  const isAdmin = email?.toLowerCase() === ADMIN_EMAIL;

  return (
    <div className="app">
      <nav className="rail" aria-label="Primary">
        <Link className="brand" href="/">
          <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
            <rect x="1" y="1" width="26" height="26" rx="6" fill="var(--fg)" />
            <path d="M8 19 14 8l6 11" stroke="var(--bg)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.5 15h7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="wordmark">BetterYour<span className="ads">Ads</span></span>
        </Link>

        <div className="nav-section">
          <h6>Workspace</h6>
          {NAV.map(({ to, label, Icon, end }) => (
            <Link key={to} href={to} className={`nav-item${isActive(pathname, to, end) ? " active" : ""}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </div>

        {isAdmin && (
          <div className="nav-section">
            <h6>Admin</h6>
            <Link href="/admin" className={`nav-item${isActive(pathname, "/admin", true) ? " active" : ""}`}>
              <IconUsers />
              <span>Accounts</span>
            </Link>
            <Link href="/admin/reference-ads" className={`nav-item${isActive(pathname, "/admin/reference-ads", false) ? " active" : ""}`}>
              <IconGrid />
              <span>Reference ads</span>
            </Link>
          </div>
        )}

        <div className="footer">
          <div className="user">
            <span className="avatar">{initial(email)}</span>
            <span className="meta">
              <span className="name">{email ?? "Signed in"}</span>
              <button className="role" onClick={() => void signOut()} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
                Sign out
              </button>
            </span>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb">BetterYourAds</span>
            <span className="crumb-sep">/</span>
            <span className="crumb current">{current}</span>
          </div>
          <div className="actions">
            <span className="meta">{email ?? ""}</span>
          </div>
        </header>
        <div className="canvas">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @bya/web -- src/shell/AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/src/shell/AppShell.tsx apps/web/src/shell/AppShell.test.tsx
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "refactor(web): AppShell uses next/link + usePathname, renders children"
```

---

### Task 5: Route pages (Home + Library real; others stubbed)

**Files:**
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/library/page.tsx`
- Create: `apps/web/app/create/page.tsx`
- Create: `apps/web/app/admin/page.tsx`
- Create: `apps/web/app/admin/reference-ads/page.tsx`

- [ ] **Step 1: Create `apps/web/app/page.tsx`**

```tsx
import Home from "../src/home/Home";

export default function Page() {
  return <Home />;
}
```

- [ ] **Step 2: Create `apps/web/app/library/page.tsx`**

```tsx
import Library from "../../src/library/Library";

export default function Page() {
  return <Library />;
}
```

- [ ] **Step 3: Create the three stub pages** (rebuilt in later specs — intentionally do NOT import the react-router-based components yet)

`apps/web/app/create/page.tsx`:
```tsx
export default function Page() {
  return <div className="stack"><h1>Make an ad</h1><p className="lead">Coming in a later spec.</p></div>;
}
```

`apps/web/app/admin/page.tsx`:
```tsx
export default function Page() {
  return <div className="stack"><h1>Accounts</h1><p className="lead">Coming in a later spec.</p></div>;
}
```

`apps/web/app/admin/reference-ads/page.tsx`:
```tsx
export default function Page() {
  return <div className="stack"><h1>Reference ads</h1><p className="lead">Coming in a later spec.</p></div>;
}
```

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/app/page.tsx apps/web/app/library/page.tsx apps/web/app/create/page.tsx apps/web/app/admin/page.tsx apps/web/app/admin/reference-ads/page.tsx
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "feat(web): App Router pages (home, library) + stubs for create/admin"
```

---

### Task 6: Migrate Library to the cache (TDD)

**Files:**
- Modify: `apps/web/src/library/Library.tsx`
- Modify: `apps/web/src/library/Library.test.tsx`

- [ ] **Step 1: Update the test** — replace `apps/web/src/library/Library.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Library from "./Library";
import { CacheProvider } from "../data/cache";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn() } };
});
import { api, ApiError } from "../api/client";

beforeEach(() => vi.clearAllMocks());

function renderLibrary() {
  return render(
    <CacheProvider>
      <Library />
    </CacheProvider>,
  );
}

describe("Library", () => {
  it("renders a grid of ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
      { id: "a2", imageUrl: "https://signed/2.png", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z" },
    ]);
    renderLibrary();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  });

  it("shows an empty state when there are no ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });

  it("renders an 'image unavailable' placeholder for an ad with no signed url", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
      { id: "a2", imageUrl: null, imageError: "Signing failed", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z" },
    ]);
    renderLibrary();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByLabelText(/image unavailable/i)).toBeInTheDocument();
  });

  it("shows an error state with a retry when the fetch fails", async () => {
    vi.mocked(api.getAds).mockRejectedValue(new ApiError("Not authorized", "AUTH_REQUIRED", 401, "auth"));
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/not authorized/i)).toBeInTheDocument());
    expect(screen.queryByText(/no ads yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @bya/web -- src/library/Library.test.tsx`
Expected: FAIL — Library still uses local state / `react-router-dom`.

- [ ] **Step 3: Rewrite `apps/web/src/library/Library.tsx`**

```tsx
"use client";

import Link from "next/link";
import type { AdSummary } from "@bya/shared";
import { useResource } from "../data/cache";

export default function Library() {
  const { data, status, error, refresh } = useResource<AdSummary[]>("ads");
  const ads = data ?? [];
  const loading = data === null && (status === "loading" || status === "idle");
  const showError = data === null && status === "error";

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h1>Ad library</h1>
        <Link href="/create" className="btn primary">Make an ad</Link>
      </div>

      {loading && (
        <div className="status-row"><span className="spinner" /> Loading your ads…</div>
      )}

      {showError && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error ?? "Could not load your ads."}</p>
            <button className="btn" onClick={() => refresh()}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !showError && ads.length === 0 && (
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>No ads yet</p>
          <p className="small" style={{ margin: 0 }}>Generate one and it'll show up here.</p>
          <Link href="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Make an ad</Link>
        </div>
      )}

      {!loading && !showError && ads.length > 0 && (
        <div className="lib-grid">
          {ads.map((ad) => (
            <div className="lib-card" key={ad.id}>
              {ad.imageUrl ? (
                <a className="thumb" href={ad.imageUrl} target="_blank" rel="noreferrer">
                  <img src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </a>
              ) : (
                <div className="thumb">
                  <span role="img" aria-label="Image unavailable" className="meta" style={{ padding: "var(--space-4)", textAlign: "center" }}>
                    Image unavailable
                  </span>
                </div>
              )}
              <div className="meta">
                <div className="when">{ad.createdAt.slice(0, 10)} · {ad.aspectRatio} · {ad.resolution}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @bya/web -- src/library/Library.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/src/library/Library.tsx apps/web/src/library/Library.test.tsx
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "refactor(web): Library reads from client cache via useResource"
```

---

### Task 7: Migrate Home to the cache (TDD)

**Files:**
- Modify: `apps/web/src/home/Home.tsx`
- Modify: `apps/web/src/home/Home.test.tsx`

- [ ] **Step 1: Replace `apps/web/src/home/Home.test.tsx`** with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Home from "./Home";
import { CacheProvider } from "../data/cache";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ email: "user@example.com" }) }));
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn(), getBrands: vi.fn() } };
});
import { api } from "../api/client";

beforeEach(() => vi.clearAllMocks());

function renderHome() {
  return render(
    <CacheProvider>
      <Home />
    </CacheProvider>,
  );
}

describe("Home", () => {
  it("shows recent ads once loaded", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    renderHome();
    await waitFor(() => expect(screen.getByText(/recent ads/i)).toBeInTheDocument());
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("shows the empty state when there are no ads", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderHome();
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @bya/web -- src/home/Home.test.tsx`
Expected: FAIL — Home still uses local fetch state and `react-router-dom`.

- [ ] **Step 3: Rewrite `apps/web/src/home/Home.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BrandSummary, AdSummary } from "@bya/shared";
import { useResource } from "../data/cache";
import { useAuth } from "../auth/useAuth";
import { IconSparkle } from "../ui/icons";

function hostname(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

function computeGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function AdThumb({ ad }: { ad: AdSummary }) {
  return (
    <div className="lib-card">
      <div className="thumb">
        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span role="img" aria-label="Image unavailable" className="meta" style={{ padding: "var(--space-4)", textAlign: "center" }}>
            Image unavailable
          </span>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { email } = useAuth();
  const brandsRes = useResource<BrandSummary[]>("brands");
  const adsRes = useResource<AdSummary[]>("ads");
  const brands = brandsRes.data ?? [];
  const ads = adsRes.data ?? [];

  // Greeting depends on the clock → compute after hydration to avoid an SSR mismatch.
  const [greeting, setGreeting] = useState("");
  useEffect(() => setGreeting(computeGreeting()), []);

  const loading =
    (adsRes.data === null && (adsRes.status === "loading" || adsRes.status === "idle")) ||
    (brandsRes.data === null && (brandsRes.status === "loading" || brandsRes.status === "idle"));
  const error = (adsRes.data === null && adsRes.status === "error")
    ? adsRes.error
    : (brandsRes.data === null && brandsRes.status === "error")
      ? brandsRes.error
      : null;

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{greeting}{greeting && email ? `, ${email}` : ""}</h1>
          {!loading && !error && (
            <p className="lead" style={{ marginTop: "var(--space-2)" }}>
              {brands.length} saved {brands.length === 1 ? "brand" : "brands"} · {ads.length} ads generated
            </p>
          )}
        </div>
        <Link href="/create" className="btn primary">
          <IconSparkle className="ico" width={14} height={14} />
          Make today's ad
        </Link>
      </div>

      {loading && (
        <div className="status-row"><span className="spinner" /> Loading your workspace…</div>
      )}

      {!loading && error && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error}</p>
            <button className="btn" onClick={() => { adsRes.refresh(); brandsRes.refresh(); }}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {ads.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h4>Recent ads</h4>
                <Link href="/library" className="small">View all</Link>
              </div>
              <div className="lib-grid">
                {ads.slice(0, 4).map((ad) => <AdThumb key={ad.id} ad={ad} />)}
              </div>
            </section>
          ) : (
            <div className="empty">
              <p className="lead" style={{ margin: 0 }}>No ads yet</p>
              <p className="small" style={{ margin: 0 }}>Generate your first on-brand ad in a couple of minutes.</p>
              <Link href="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Create your first ad</Link>
            </div>
          )}

          {brands.length > 0 && (
            <section className="section">
              <div className="section-head"><h4>Saved brands</h4></div>
              <div className="actions-row">
                {brands.map((b) => (
                  <Link key={b.id} href={`/create?brandId=${b.id}`} className="badge">
                    {hostname(b.websiteUrl)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -w @bya/web -- src/home/Home.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add apps/web/src/home/Home.tsx apps/web/src/home/Home.test.tsx
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "refactor(web): Home reads from client cache; greeting computed post-hydration"
```

---

### Task 8: Remove the old SPA entry + verify build/dev/tests

**Files:**
- Delete: `apps/web/index.html`
- Delete: `apps/web/src/main.tsx`
- Delete: `apps/web/src/App.tsx`
- Delete: `apps/web/vite.config.ts`

- [ ] **Step 1: Delete the dead SPA files**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor rm apps/web/index.html apps/web/src/main.tsx apps/web/src/App.tsx apps/web/vite.config.ts
```
Expected: four files staged for deletion. (Vitest now reads `vitest.config.ts` from Task 1.)

- [ ] **Step 2: Run the full web test suite**

Run: `npm test -w @bya/web`
Expected: PASS. The migrated suites (cache, AppShell, Home, Library) pass; Workbench/Admin/ReferenceAds suites still pass (they keep using `react-router-dom`, still installed). If any suite imports the deleted `App.tsx`, fix by removing that import — none should.

- [ ] **Step 3: Production build**

Run: `npm run build -w @bya/web`
Expected: `next build` succeeds; output lists routes `/`, `/library`, `/create`, `/admin`, `/admin/reference-ads`; a `.next/` directory is produced. No "react-router" or "window is not defined" errors.

- [ ] **Step 4: Manual dev smoke (record result)**

In two terminals:
```
npm run dev -w @bya/backend      # http://localhost:3000
npm run dev -w @bya/web          # http://localhost:3001
```
Open `http://localhost:3001`:
- View source: the served HTML contains shell markup (e.g. `Loading…` from AuthGate or the rail), not an empty `<div id="root">`.
- No hydration-mismatch warnings in the browser console.
- Sign in; confirm `/api/*` requests succeed (Network tab) — proxied to the backend with the Bearer token.
- Navigate Home ⇄ Library: after the first load, revisiting shows ads immediately (no spinner) while a background `/api/ads` request fires.

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add -A
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "chore(web): remove Vite SPA entry (index.html, main, App, vite.config)"
```

---

### Task 9: Record Spec #1 manual checks + FEATURES note

**Files:**
- Create: `docs/superpowers/manual-checks/spec-01-ssr-foundation.md`
- Modify: `docs/FEATURES.md`

(Per the roadmap, per-spec manual checks are recorded now and aggregated into the single `docs/superpowers/MANUAL-CHECKS.md` at the very end of the program.)

- [ ] **Step 1: Create `docs/superpowers/manual-checks/spec-01-ssr-foundation.md`**

```markdown
# Manual checks — Spec #1 (SSR Foundation)

## Schema / migrations
- None. Spec #1 makes no database changes.

## Environment variables
- **`BACKEND_ORIGIN`** (apps/web, Next server): origin of the Express API for the `/api`
  rewrite. Defaults to `http://localhost:3000`. **In any non-local deployment this MUST be set**
  to the backend's real URL, or `/api/*` calls 404.
- Backend keeps its existing env (`OPENROUTER_API_KEY`, `SUPABASE_*`, etc.) — unchanged.

## Ports / processes
- Web (Next) runs on **3001**; backend on **3000**. If the backend runs on another port, set
  `BACKEND_ORIGIN` accordingly. Two processes must run (no combined script added this spec).

## Deployment notes
- The web app is now a Next.js server (`next start -p 3001`), not a static bundle — the host
  must run Node, not just serve static files.
- `public/` assets are served at `/`.

## Click-through smoke
- Load `/`: SSR shell present in view-source; no hydration warnings.
- Sign in → Home and Library show data; revisit is instant (cache) with a background refresh.
```

- [ ] **Step 2: Add a FEATURES.md line** under the web/frontend section:

```markdown
- SSR app shell (Next.js App Router) with a client-side stale-while-revalidate data cache
```
(Place it in the existing frontend section; match surrounding formatting.)

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/jerem/worktrees/bya-massive-refactor add docs/superpowers/manual-checks/spec-01-ssr-foundation.md docs/FEATURES.md
git -C C:/Users/jerem/worktrees/bya-massive-refactor commit -m "docs: record Spec #1 manual checks + FEATURES entry"
```

---

## Self-review (completed by plan author)

**Spec coverage:**
- SSR shell rendered from React, no `index.html` → Tasks 3, 8. ✅
- `apps/web` Next App Router scaffold + `/api` rewrite, backend untouched → Tasks 1, 5. ✅
- Hand-rolled stale-while-revalidate cache (no new data lib) → Task 2. ✅
- Home + Library read the cache (smoke test) → Tasks 6, 7. ✅
- AppShell migrated off react-router; other routes stubbed; react-router still installed → Tasks 4, 5. ✅
- `new Date()` greeting hydration risk handled → Task 7 (post-hydration). ✅
- Tests stay green; cache + SSR covered → Tasks 2, 6, 7, 8. ✅
- Manual checks recorded for the final aggregate doc → Task 9. ✅

**Placeholder scan:** No TBD/TODO; every code + test block is complete; commands have expected output.

**Type consistency:** Cache exposes `{ data, status, error, refresh }` and `usePrimeAfterAuth`; keys `"brands" | "ads" | "usage"` used consistently in cache, Home, Library, primer. `AppShell({ children })` matches `providers.tsx` usage. `useResource<T>` generic used with `AdSummary[]` / `BrandSummary[]` matching `@bya/shared` exports already consumed by the old code.

**Note on scope:** Workbench/Admin/ReferenceAds components and their tests are intentionally untouched (still on react-router); their pages are stubs. Full migration + react-router removal is Spec #3.
```
