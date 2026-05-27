# Web Frontend Auth Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Foundation `signed-out` placeholder with real auth screens (sign-in / sign-up / magic-link / forgot-password) and add the password-recovery flow.

**Architecture:** All auth runs client-side against the Supabase client exposed by `AuthProvider`. A `LoginView` with a mode union drives the four entry flows; `RecoveryView` handles set-new-password after a `PASSWORD_RECOVERY` event, which `AuthProvider` now tracks as a `recovery` status. A shared `AuthLayout` provides the split brand/card layout.

**Tech Stack:** React 18 + TS, @supabase/supabase-js 2, Vitest + RTL. Supabase auth calls return `{ data, error }` (they do not throw).

**Reference:** `legacy/auth.js` + `legacy/app.html` (auth screen markup/copy). Foundation files: `apps/web/src/auth/{status.ts,useAuth.ts,AuthProvider.tsx}`, `apps/web/src/shell/AuthGate.tsx`.

---

## File Structure

- Modify: `apps/web/src/auth/status.ts` (add `"recovery"`)
- Modify: `apps/web/src/auth/useAuth.ts` (add `clearRecovery` to `AuthValue`)
- Modify: `apps/web/src/auth/AuthProvider.tsx` (recovery tracking + `clearRecovery`)
- Modify: `apps/web/src/shell/AuthGate.tsx` (render LoginView/RecoveryView; AuthLayout for awaiting)
- Modify: `apps/web/src/shell/AuthGate.test.tsx` (signed-out → LoginView; add recovery case)
- Create: `apps/web/src/auth/AuthLayout.tsx`
- Create: `apps/web/src/auth/LoginView.tsx` (+ `LoginView.test.tsx`)
- Create: `apps/web/src/auth/RecoveryView.tsx` (+ `RecoveryView.test.tsx`)

Run all commands from `apps/web`. Push after each commit.

---

### Task 1: Recovery status plumbing (status + provider + context)

**Files:** Modify `apps/web/src/auth/status.ts`, `apps/web/src/auth/useAuth.ts`, `apps/web/src/auth/AuthProvider.tsx`

- [ ] **Step 1: Add `recovery` to the status union** — `status.ts`

Change the `AuthStatus` type to:

```ts
export type AuthStatus = "loading" | "signed-out" | "awaiting-approval" | "approved" | "recovery";
```

(Leave `deriveStatus` and `Profile` unchanged — recovery is layered in the provider.)

- [ ] **Step 2: Add `clearRecovery` to the context type** — `useAuth.ts`

Add to the `AuthValue` type:

```ts
  clearRecovery: () => void;
```

- [ ] **Step 3: Track recovery in the provider** — `AuthProvider.tsx`

Add a recovery state near the other `useState`s:

```ts
  const [recovery, setRecovery] = useState(false);
```

In the `onAuthStateChange` callback, set recovery on the recovery event:

```ts
    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
      setInitialized(true);
    });
```

Change the `status` computation so recovery wins:

```ts
  const status: AuthStatus = recovery
    ? "recovery"
    : !initialized
      ? "loading"
      : deriveStatus(Boolean(session), profile);
```

Add `clearRecovery` to the context value object and clear recovery on sign-out:

```ts
    signOut: async () => {
      setRecovery(false);
      await clientRef.current?.auth.signOut();
    },
    clearRecovery: () => setRecovery(false),
```

- [ ] **Step 4: Verify build + existing tests still pass**

Run: `npm run build` (tsc clean) and `npm test` (all existing suites green — the AuthGate test still passes since `recovery` is just a new union member not yet asserted).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth/status.ts apps/web/src/auth/useAuth.ts apps/web/src/auth/AuthProvider.tsx
git commit -m "feat(web): track Supabase PASSWORD_RECOVERY as a recovery status"
git push
```

---

### Task 2: AuthLayout (shared split layout)

**Files:** Create `apps/web/src/auth/AuthLayout.tsx`

Presentational split layout: left column with brand wordmark + value-prop copy (port the headline from `legacy/app.html` auth screen, e.g. "Stop guessing. Stop overpaying agencies."), right column renders `children` inside a centered `.stage` card. Use ported classes + tokens.

- [ ] **Step 1: Implement** — `AuthLayout.tsx`

```tsx
import type { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <aside style={{ padding: "var(--space-8)", borderRight: "1px solid var(--fg)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <span className="wordmark" style={{ fontWeight: 700, fontSize: "var(--size-20)" }}>BetterYourAds</span>
        <h1 style={{ marginTop: "var(--space-5)", maxWidth: 460 }}>Stop guessing. Stop overpaying agencies.</h1>
        <p style={{ marginTop: "var(--space-3)", color: "var(--fg-3)", maxWidth: 420 }}>
          Generate on-brand ads from your website in minutes.
        </p>
      </aside>
      <main style={{ display: "grid", placeItems: "center", padding: "var(--space-6)" }}>
        <div className="stage" style={{ width: "100%", maxWidth: 380 }}>{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify build** — `npm run build` → passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/auth/AuthLayout.tsx
git commit -m "feat(web): shared AuthLayout split screen"
git push
```

---

### Task 3: LoginView (four modes)

**Files:** Create `apps/web/src/auth/LoginView.tsx`, `apps/web/src/auth/LoginView.test.tsx`

- [ ] **Step 1: Write the failing test** — `LoginView.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginView } from "./LoginView";
import { useAuth } from "./useAuth";

vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ supabase: { auth } } as unknown as ReturnType<typeof useAuth>);
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("LoginView", () => {
  it("signs in with email + password", async () => {
    render(<LoginView />);
    type(/email/i, "a@b.com");
    type(/password/i, "secret1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secret1" }));
  });

  it("shows the error message when sign-in fails", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login" } });
    render(<LoginView />);
    type(/email/i, "a@b.com");
    type(/password/i, "nope");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByText("Invalid login")).toBeInTheDocument());
  });

  it("switches to magic-link mode and sends an OTP", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /magic link/i }));
    type(/email/i, "a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send link/i }));
    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.com", options: { emailRedirectTo: window.location.origin } }));
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
  });

  it("switches to forgot mode and requests a reset", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    type(/email/i, "a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send reset/i }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", { redirectTo: window.location.origin }));
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- LoginView` → FAIL.

- [ ] **Step 3: Implement** — `LoginView.tsx`

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "./useAuth";
import { AuthLayout } from "./AuthLayout";

type Mode = "sign-in" | "sign-up" | "magic-link" | "forgot";
type Msg = { type: "error" | "info"; text: string };

const HEADINGS: Record<Mode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  "magic-link": "Magic link",
  forgot: "Reset password",
};

export function LoginView() {
  const { supabase } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const showPassword = mode === "sign-in" || mode === "sign-up";
  const origin = window.location.origin;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg({ type: "error", text: error.message });
        // success: onAuthStateChange re-renders the gate
      } else if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin } });
        setMsg(error ? { type: "error", text: error.message } : { type: "info", text: "Check your email to verify your account." });
      } else if (mode === "magic-link") {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin } });
        setMsg(error ? { type: "error", text: error.message } : { type: "info", text: "Check your email for the sign-in link." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: origin });
        setMsg(error ? { type: "error", text: error.message } : { type: "info", text: "Check your email for a reset link." });
      }
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : mode === "magic-link" ? "Send link" : "Send reset";

  return (
    <AuthLayout>
      <h2 style={{ marginBottom: "var(--space-4)" }}>{HEADINGS[mode]}</h2>
      <form onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {showPassword && (
          <label className="field" style={{ marginTop: "var(--space-3)" }}>
            <span>Password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
        )}
        {msg && (
          <p style={{ marginTop: "var(--space-3)", color: msg.type === "error" ? "var(--oxblood)" : "var(--fg-2)" }}>{msg.text}</p>
        )}
        <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: "var(--space-4)", width: "100%" }}>
          {busy ? "…" : submitLabel}
        </button>
      </form>
      <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        {mode !== "sign-in" && <button className="btn ghost" type="button" onClick={() => { setMode("sign-in"); setMsg(null); }}>Sign in</button>}
        {mode !== "sign-up" && <button className="btn ghost" type="button" onClick={() => { setMode("sign-up"); setMsg(null); }}>Create account</button>}
        {mode !== "magic-link" && <button className="btn ghost" type="button" onClick={() => { setMode("magic-link"); setMsg(null); }}>Magic link</button>}
        {mode !== "forgot" && <button className="btn ghost" type="button" onClick={() => { setMode("forgot"); setMsg(null); }}>Forgot password</button>}
      </div>
    </AuthLayout>
  );
}
```

Note: `<label className="field"><span>Email</span><input/></label>` associates the label text with the input, so `getByLabelText(/email/i)` works.

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- LoginView` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth/LoginView.tsx apps/web/src/auth/LoginView.test.tsx
git commit -m "feat(web): LoginView — sign-in/up, magic-link, forgot-password"
git push
```

---

### Task 4: RecoveryView (set new password)

**Files:** Create `apps/web/src/auth/RecoveryView.tsx`, `apps/web/src/auth/RecoveryView.test.tsx`

- [ ] **Step 1: Write the failing test** — `RecoveryView.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecoveryView } from "./RecoveryView";
import { useAuth } from "./useAuth";

vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));

const updateUser = vi.fn();
const clearRecovery = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ error: null });
  vi.mocked(useAuth).mockReturnValue({ supabase: { auth: { updateUser } }, clearRecovery } as unknown as ReturnType<typeof useAuth>);
});

describe("RecoveryView", () => {
  it("updates the password and clears recovery on success", async () => {
    render(<RecoveryView />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "newpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "newpass1" }));
    await waitFor(() => expect(clearRecovery).toHaveBeenCalled());
  });

  it("shows an error and does not clear recovery on failure", async () => {
    updateUser.mockResolvedValue({ error: { message: "Too weak" } });
    render(<RecoveryView />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(screen.getByText("Too weak")).toBeInTheDocument());
    expect(clearRecovery).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `npm test -- RecoveryView` → FAIL.

- [ ] **Step 3: Implement** — `RecoveryView.tsx`

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "./useAuth";
import { AuthLayout } from "./AuthLayout";

export function RecoveryView() {
  const { supabase, clearRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else clearRecovery();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h2 style={{ marginBottom: "var(--space-4)" }}>Set a new password</h2>
      <form onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p style={{ marginTop: "var(--space-3)", color: "var(--oxblood)" }}>{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: "var(--space-4)", width: "100%" }}>
          {busy ? "…" : "Set password"}
        </button>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes** — `npm test -- RecoveryView` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth/RecoveryView.tsx apps/web/src/auth/RecoveryView.test.tsx
git commit -m "feat(web): RecoveryView — set new password after reset"
git push
```

---

### Task 5: Wire AuthGate to the real screens

**Files:** Modify `apps/web/src/shell/AuthGate.tsx`, `apps/web/src/shell/AuthGate.test.tsx`

- [ ] **Step 1: Update `AuthGate.tsx`**

Import the new views and render them. Replace the `signed-out` placeholder block with `<LoginView/>`, add a `recovery` branch with `<RecoveryView/>`, and render the awaiting-approval message inside `AuthLayout` for visual consistency. Keep `loading` and the approved passthrough.

```tsx
import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";
import { LoginView } from "../auth/LoginView";
import { RecoveryView } from "../auth/RecoveryView";
import { AuthLayout } from "../auth/AuthLayout";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p>Loading…</p>
      </div>
    );
  }
  if (status === "recovery") return <RecoveryView />;
  if (status === "signed-out") return <LoginView />;
  if (status === "awaiting-approval") {
    return (
      <AuthLayout>
        <h2 style={{ marginBottom: "var(--space-3)" }}>You're on the list</h2>
        <p>Your account is awaiting approval. We'll email you when it's ready.</p>
      </AuthLayout>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Update `AuthGate.test.tsx`**

The mocked `useAuth` value must now supply a `supabase` (LoginView/RecoveryView read `useAuth().supabase`) and `clearRecovery`. Update the `value` helper and the assertions:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGate } from "./AuthGate";
import { useAuth } from "../auth/useAuth";
import type { AuthStatus } from "../auth/status";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
const mockUseAuth = vi.mocked(useAuth);

const fakeSupabase = { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOtp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() } };
const value = (status: AuthStatus) =>
  ({ status, supabase: fakeSupabase, clearRecovery: vi.fn() }) as unknown as ReturnType<typeof useAuth>;

describe("AuthGate", () => {
  beforeEach(() => mockUseAuth.mockReset());

  it("shows a loading screen while loading", () => {
    mockUseAuth.mockReturnValue(value("loading"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("APP")).toBeNull();
  });

  it("renders the login view when signed out", () => {
    mockUseAuth.mockReturnValue(value("signed-out"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByText("APP")).toBeNull();
  });

  it("renders the recovery view in recovery status", () => {
    mockUseAuth.mockReturnValue(value("recovery"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument();
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

- [ ] **Step 3: Run the full suite + build**

Run: `npm test` (all suites green, including the updated AuthGate cases and the new LoginView/RecoveryView suites) and `npm run build` (tsc clean + Vite build).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shell/AuthGate.tsx apps/web/src/shell/AuthGate.test.tsx
git commit -m "feat(web): wire AuthGate to LoginView + RecoveryView"
git push
```

---

## Self-Review

**Spec coverage:** sign-in/up/magic-link/forgot → Task 3 ✅; recovery set-password → Task 4 ✅; `PASSWORD_RECOVERY` → `recovery` status → Task 1 ✅; AuthLayout shared (login/recovery/awaiting = 3 call sites) → Task 2 ✅; gate wiring → Task 5 ✅. Out-of-scope items (home/library/saved-brand, backend, OAuth) correctly absent.

**Placeholder scan:** No gaps. All handlers, Supabase calls, and JSX are fully specified. Left-column copy is concrete (ported headline).

**Type consistency:** `AuthStatus` (now incl. `recovery`) in `status.ts` used by provider/gate. `AuthValue` gains `clearRecovery`, produced by `AuthProvider`, consumed by `RecoveryView` + AuthGate test mock. `LoginView`/`RecoveryView` read `useAuth().supabase` (the `SupabaseClient` exposed since Foundation). Supabase methods match v2 signatures: `signInWithPassword({email,password})`, `signUp({email,password,options})`, `signInWithOtp({email,options})`, `resetPasswordForEmail(email,{redirectTo})`, `updateUser({password})` — all returning `{ data, error }`.
