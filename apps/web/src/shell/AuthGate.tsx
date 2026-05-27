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
