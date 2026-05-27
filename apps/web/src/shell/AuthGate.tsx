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
