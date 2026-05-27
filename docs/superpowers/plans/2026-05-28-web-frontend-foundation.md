# Web Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/web` as a runnable Vite + React + TS walking skeleton: ported design system, Supabase auth + approval gate, a typed API client over `@bya/shared`, and an app shell with routing placeholders.

**Architecture:** Single Vite React app in the existing npm-workspaces monorepo. `@bya/shared` resolved via a Vite alias to its raw-TS entry. Auth state lives in one `AuthProvider` (config fetch → Supabase client → session + `profiles` row → derived status); `AuthGate` switches the UI by status. A single `api` module wraps the backend's `/api/*` endpoints with bearer-token attachment and typed `ApiError` mapping. **Deviation from spec (YAGNI):** the client is type-only — no runtime zod re-validation of responses (the backend already validates outbound); add per-endpoint if a real need appears.

**Tech Stack:** Vite 5, React 18, react-router-dom 6, @supabase/supabase-js 2, Vitest 2 + React Testing Library + jsdom. Dev server proxies `/api` → `http://localhost:3000`.

---

## File Structure

- `apps/web/package.json` — workspace `@bya/web`, deps + scripts
- `apps/web/tsconfig.json` — extends base, adds `jsx`, `noEmit`, DOM/node types
- `apps/web/vite.config.ts` — react plugin, `@bya/shared` alias, `/api` proxy, vitest test block
- `apps/web/index.html` — Vite entry (fonts come via ported `tokens.css` `@import`)
- `apps/web/src/vite-env.d.ts` — vite client types
- `apps/web/src/main.tsx` — imports CSS, mounts `<App/>`
- `apps/web/src/App.tsx` — providers + router + gate + routes
- `apps/web/src/styles/tokens.css`, `app.css` — copied verbatim from `legacy/styles/`
- `apps/web/public/` — `favicon.svg`, `grain.svg`, `logo-mark.png` from `legacy/assets/`
- `apps/web/src/api/client.ts` (+ `client.test.ts`) — typed fetch wrapper + `api` object
- `apps/web/src/auth/status.ts` (+ `status.test.ts`) — pure `deriveStatus` helper + types
- `apps/web/src/auth/AuthProvider.tsx` — context provider
- `apps/web/src/auth/useAuth.ts` — context hook
- `apps/web/src/shell/AppShell.tsx` (+ `AppShell.test.tsx`) — rail + topbar + `<Outlet/>`
- `apps/web/src/shell/AuthGate.tsx` (+ `AuthGate.test.tsx`) — status → screen
- `apps/web/src/test/setup.ts` — RTL jest-dom matchers

Run all commands from `apps/web` unless noted. Push after each commit (repo rule).

---

### Task 1: Scaffold the `apps/web` workspace

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/vite-env.d.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/test/setup.ts`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@bya/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@bya/shared": "*",
    "@supabase/supabase-js": "^2.106.2",
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

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "declaration": false,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `apps/web/vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const shared = fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@bya/shared": shared } },
  server: { proxy: { "/api": "http://localhost:3000" } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] },
});
```

- [ ] **Step 4: Create `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BetterYourAds</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `apps/web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Create `apps/web/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Create a minimal `apps/web/src/App.tsx`** (replaced in Task 6)

```tsx
export default function App() {
  return <div>BetterYourAds</div>;
}
```

- [ ] **Step 8: Create `apps/web/src/main.tsx`** (CSS imports added in Task 2)

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Install workspace deps**

Run (from repo root): `npm install`
Expected: completes; `node_modules/@bya/web` symlink + `@bya/shared` linked.

- [ ] **Step 10: Verify build + typecheck**

Run (from `apps/web`): `npm run build`
Expected: `tsc --noEmit` passes and Vite writes `dist/` with no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold apps/web Vite+React+TS workspace"
git push
```

---

### Task 2: Port the design system

**Files:**
- Create: `apps/web/src/styles/tokens.css`, `apps/web/src/styles/app.css`, `apps/web/public/{favicon.svg,grain.svg,logo-mark.png}`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Copy the stylesheets verbatim**

Copy `legacy/styles/tokens.css` → `apps/web/src/styles/tokens.css` unchanged.
Copy `legacy/styles/app.css` → `apps/web/src/styles/app.css` unchanged.
(`app.css` already `@import url('./tokens.css')` at its top and `tokens.css` `@import`s Google Fonts — both carry over as-is.)

- [ ] **Step 2: Copy the assets**

Copy `legacy/assets/favicon.svg`, `legacy/assets/grain.svg`, `legacy/assets/logo-mark.png` → `apps/web/public/`.

- [ ] **Step 3: Import the stylesheet in `main.tsx`**

Add as the first import in `apps/web/src/main.tsx`:

```tsx
import "./styles/app.css";
```

(Importing `app.css` pulls in `tokens.css` via its `@import`.)

- [ ] **Step 4: Verify build still passes**

Run (from `apps/web`): `npm run build`
Expected: passes; CSS bundled with no unresolved `@import` or asset errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles apps/web/public apps/web/src/main.tsx
git commit -m "feat(web): port legacy design system (tokens + app.css + assets)"
git push
```

---

### Task 3: Typed API client

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/web/src/api/client.test.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, setTokenProvider } from "./client";

describe("api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    setTokenProvider(async () => null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("attaches a bearer token when the provider returns one", async () => {
    setTokenProvider(async () => "tok123");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ title: "T" }), { status: 200 }));
    await api.extract("https://x.com");
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer tok123");
  });

  it("posts to /api/extract with the url body and returns parsed json", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ title: "T" }), { status: 200 }));
    const res = await api.extract("https://x.com");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/extract");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ url: "https://x.com" });
    expect(res).toEqual({ title: "T" });
  });

  it("issues GET for getConfig (no body)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ supabaseUrl: "u", supabaseAnonKey: "k" }), { status: 200 }));
    await api.getConfig();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/config");
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeUndefined();
  });

  it("throws ApiError carrying code/status/stage on error responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_APPROVED", message: "nope", stage: "auth" } }), { status: 403 }),
    );
    await expect(api.extract("https://x.com")).rejects.toMatchObject({
      name: "ApiError",
      code: "NOT_APPROVED",
      status: 403,
      stage: "auth",
    });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run (from `apps/web`): `npm test -- client`
Expected: FAIL — `./client` has no exports yet.

- [ ] **Step 3: Implement `apps/web/src/api/client.ts`**

```ts
import type {
  MeasuredSiteData,
  BrandRequest,
  BrandExtraction,
  AdPromptRequest,
  AdPrompt,
  RenderRequest,
} from "@bya/shared";

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  stage1Model: string;
  stage2Model: string;
  kieModel: string;
  kieResolution: string;
  openrouterConfigured: boolean;
  kieConfigured: boolean;
  supabaseConfigured: boolean;
};

export type ErrorStage =
  | "extract" | "brand" | "ad-prompt" | "render"
  | "validation" | "auth" | "persistence";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly stage?: ErrorStage,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Supplies the current Supabase JWT for authed calls. AuthProvider sets it once the
 *  client exists; getConfig() runs before auth so a missing/null token is fine. */
let tokenProvider: (() => Promise<string | null>) | null = null;
export function setTokenProvider(fn: () => Promise<string | null>): void {
  tokenProvider = fn;
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = tokenProvider ? await tokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(
      err.message ?? `Request failed (${res.status})`,
      err.code ?? "UNKNOWN",
      res.status,
      err.stage,
    );
  }
  return json as T;
}

export const api = {
  getConfig: () => request<AppConfig>("/api/config"),
  extract: (url: string) => request<MeasuredSiteData>("/api/extract", { url }),
  brand: (req: BrandRequest) => request<{ brandExtraction: BrandExtraction }>("/api/brand", req),
  adPrompt: (req: AdPromptRequest) => request<{ adPrompt: AdPrompt }>("/api/ad-prompt", req),
  render: (req: RenderRequest) => request<{ imageUrl: string }>("/api/render", req),
};
```

- [ ] **Step 4: Run the test and confirm it passes**

Run (from `apps/web`): `npm test -- client`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api
git commit -m "feat(web): typed API client over /api with bearer auth + ApiError"
git push
```

---

### Task 4: Auth status helper + provider

**Files:**
- Create: `apps/web/src/auth/status.ts`, `apps/web/src/auth/status.test.ts`, `apps/web/src/auth/AuthProvider.tsx`, `apps/web/src/auth/useAuth.ts`

- [ ] **Step 1: Write the failing test** — `apps/web/src/auth/status.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { deriveStatus } from "./status";

const profile = (approved: boolean) => ({ approved, email: "a@b.com", is_admin: false });

describe("deriveStatus", () => {
  it("is signed-out with no session", () => {
    expect(deriveStatus(false, null)).toBe("signed-out");
  });
  it("is loading with a session but no profile yet", () => {
    expect(deriveStatus(true, null)).toBe("loading");
  });
  it("is approved when the profile is approved", () => {
    expect(deriveStatus(true, profile(true))).toBe("approved");
  });
  it("is awaiting-approval when the profile is not approved", () => {
    expect(deriveStatus(true, profile(false))).toBe("awaiting-approval");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run (from `apps/web`): `npm test -- status`
Expected: FAIL — `./status` not found.

- [ ] **Step 3: Implement `apps/web/src/auth/status.ts`**

```ts
export type AuthStatus = "loading" | "signed-out" | "awaiting-approval" | "approved";

export type Profile = {
  approved: boolean;
  email: string | null;
  is_admin: boolean;
};

/** Pure status derivation. `hasSession` = a Supabase session exists; `profile` = the
 *  user's `profiles` row once loaded (null while still fetching). */
export function deriveStatus(hasSession: boolean, profile: Profile | null): AuthStatus {
  if (!hasSession) return "signed-out";
  if (!profile) return "loading";
  return profile.approved ? "approved" : "awaiting-approval";
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run (from `apps/web`): `npm test -- status`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `apps/web/src/auth/useAuth.ts`**

```ts
import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthStatus, Profile } from "./status";

export type AuthValue = {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  supabase: SupabaseClient | null;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 6: Implement `apps/web/src/auth/AuthProvider.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { api, setTokenProvider } from "../api/client";
import { deriveStatus, type AuthStatus, type Profile } from "./status";
import { AuthContext, type AuthValue } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialized, setInitialized] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);

  // One-time: fetch config, create the Supabase client, wire the API token provider.
  useEffect(() => {
    let active = true;
    api.getConfig().then((cfg) => {
      if (!active) return;
      const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      clientRef.current = client;
      setTokenProvider(async () => {
        const { data } = await client.auth.getSession();
        return data.session?.access_token ?? null;
      });
      client.auth.getSession().then(({ data }) => {
        if (active) {
          setSession(data.session);
          setInitialized(true);
        }
      });
      const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
        setSession(s);
      });
      setSupabase(client);
      return () => sub.subscription.unsubscribe();
    });
    return () => {
      active = false;
    };
  }, []);

  // Load the profile row whenever the session's user changes.
  useEffect(() => {
    const client = clientRef.current;
    const uid = session?.user?.id;
    if (!client || !uid) {
      setProfile(null);
      return;
    }
    let active = true;
    client
      .from("profiles")
      .select("approved,email,is_admin")
      .eq("id", uid)
      .single()
      .then(({ data }) => {
        if (active) setProfile((data as Profile) ?? null);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const status: AuthStatus = !initialized ? "loading" : deriveStatus(Boolean(session), profile);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      userId: session?.user?.id ?? null,
      email: profile?.email ?? session?.user?.email ?? null,
      profile,
      supabase,
      signOut: async () => {
        await clientRef.current?.auth.signOut();
      },
    }),
    [status, session, profile, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 7: Verify build + typecheck**

Run (from `apps/web`): `npm run build`
Expected: passes (the provider compiles against `@supabase/supabase-js` and `@bya/shared`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/auth
git commit -m "feat(web): Supabase AuthProvider + approval-gate status derivation"
git push
```

---

### Task 5: App shell + AuthGate

**Files:**
- Create: `apps/web/src/shell/AppShell.tsx`, `apps/web/src/shell/AppShell.test.tsx`, `apps/web/src/shell/AuthGate.tsx`, `apps/web/src/shell/AuthGate.test.tsx`

- [ ] **Step 1: Write the failing AuthGate test** — `apps/web/src/shell/AuthGate.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGate } from "./AuthGate";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
const mockUseAuth = vi.mocked(useAuth);

const value = (status: string) => ({ status } as ReturnType<typeof useAuth>);

describe("AuthGate", () => {
  beforeEach(() => mockUseAuth.mockReset());

  it("shows a loading screen while loading", () => {
    mockUseAuth.mockReturnValue(value("loading"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("APP")).toBeNull();
  });

  it("shows the sign-in placeholder when signed out", () => {
    mockUseAuth.mockReturnValue(value("signed-out"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it("shows awaiting-approval when not approved", () => {
    mockUseAuth.mockReturnValue(value("awaiting-approval"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/on the list/i)).toBeInTheDocument();
  });

  it("renders children when approved", () => {
    mockUseAuth.mockReturnValue(value("approved"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText("APP")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run (from `apps/web`): `npm test -- AuthGate`
Expected: FAIL — `./AuthGate` not found.

- [ ] **Step 3: Implement `apps/web/src/shell/AuthGate.tsx`**

```tsx
import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--space-6)" }}>
      <div className="stage" style={{ maxWidth: 420, textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return <Centered><p>Loading…</p></Centered>;
  }
  if (status === "signed-out") {
    // Placeholder; the real auth form is built in Slice B.
    return (
      <Centered>
        <h1 style={{ marginBottom: "var(--space-3)" }}>Sign in</h1>
        <p>The sign-in form is coming in the auth-screens slice.</p>
      </Centered>
    );
  }
  if (status === "awaiting-approval") {
    return (
      <Centered>
        <h1 style={{ marginBottom: "var(--space-3)" }}>You're on the list</h1>
        <p>Your account is awaiting approval. We'll email you when it's ready.</p>
      </Centered>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run (from `apps/web`): `npm test -- AuthGate`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing AppShell test** — `apps/web/src/shell/AppShell.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the rail brand and the routed outlet child", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>CHILD</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("BetterYourAds")).toBeInTheDocument();
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run (from `apps/web`): `npm test -- AppShell`
Expected: FAIL — `./AppShell` not found.

- [ ] **Step 7: Implement `apps/web/src/shell/AppShell.tsx`**

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export function AppShell() {
  const { email, signOut } = useAuth();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav className="rail" style={{ width: 232, borderRight: "1px solid var(--fg)" }}>
        <div className="brand">
          <span className="wordmark">BetterYourAds</span>
        </div>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/library">Library</NavLink>
      </nav>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <header className="topbar" style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="crumb">{email ?? ""}</span>
          <button className="btn" onClick={() => void signOut()}>Sign out</button>
        </header>
        <main style={{ padding: "var(--space-6)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the test and confirm it passes**

Run (from `apps/web`): `npm test -- AppShell`
Expected: PASS (1 test).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/shell
git commit -m "feat(web): app shell (rail + topbar) and AuthGate status screens"
git push
```

---

### Task 6: Wire `App.tsx` (providers + router + routes)

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Replace `apps/web/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthGate } from "./shell/AuthGate";
import { AppShell } from "./shell/AppShell";

function HomePlaceholder() {
  return <h1>Home — built in the Workbench/Home slices.</h1>;
}
function LibraryPlaceholder() {
  return <h1>Library — built in the Library slice.</h1>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePlaceholder />} />
              <Route path="/library" element={<LibraryPlaceholder />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run (from `apps/web`): `npm test`
Expected: PASS — all suites (client, status, AuthGate, AppShell) green.

- [ ] **Step 3: Verify build + typecheck**

Run (from `apps/web`): `npm run build`
Expected: `tsc --noEmit` clean, Vite build succeeds.

- [ ] **Step 4: Manual boot smoke (optional, needs backend + .env)**

Run backend (`npm run dev --workspace @bya/backend`) and web (`npm run dev --workspace @bya/web`); open the Vite URL. Expected: app loads; with no Supabase session it shows the "Sign in" placeholder (config fetch + client init succeeded).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): wire providers, router, and gated routes"
git push
```

---

## Self-Review

**Spec coverage** (against `2026-05-28-web-frontend-foundation-design.md`):
- Scaffold (Vite+React+TS, workspace) → Task 1 ✅
- Design system port (tokens/app.css verbatim, assets, fonts via @import) → Task 2 ✅
- Auth: config→client→session→profile→status + approval gate → Tasks 4, 5 ✅
- Typed API client over `@bya/shared`, bearer token, `ApiError` → Task 3 ✅ (type-only; runtime-zod deviation noted in header)
- App shell (rail + topbar + outlet) + routing placeholders → Tasks 5, 6 ✅
- Dev proxy `/api`→`:3000` → Task 1 (vite.config) ✅
- Testing: AuthGate per-status, API client token+error, shell → Tasks 3,4,5 ✅
- `is_admin` read but unused → Task 4 `Profile` carries it, no consumer ✅

**Placeholder scan:** No "TBD"/"add error handling" placeholders. Screen text "built in Slice B/Library slice" is intended runtime copy for the skeleton, not a plan gap. CSS files are copied verbatim (concrete instruction), not authored here.

**Type consistency:** `AuthStatus`/`Profile` defined in `status.ts`, imported by `useAuth.ts`, `AuthProvider.tsx`, `AuthGate` (via `useAuth`). `setTokenProvider`/`api` defined in `client.ts`, consumed in `AuthProvider`. `AuthValue` defined once in `useAuth.ts`, produced by `AuthProvider`. Route response types match backend (`{brandExtraction}`, `{adPrompt}`, `{imageUrl}`); `id` arrives with Plan 5 and is reconciled in the final phase.
