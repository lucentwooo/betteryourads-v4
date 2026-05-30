"use client";

import type { ReactNode } from "react";
import { useAuth } from "../auth/useAuth";
import { LoginView } from "../auth/LoginView";
import { RecoveryView } from "../auth/RecoveryView";
import { AuthLayout } from "../auth/AuthLayout";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, error, signOut, email } = useAuth();

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p>Loading…</p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <AuthLayout>
        <h2 style={{ marginBottom: "var(--space-3)" }}>Something went wrong</h2>
        <p>{error ?? "We couldn't start sign-in. Please try again."}</p>
      </AuthLayout>
    );
  }
  if (status === "recovery") return <RecoveryView />;
  if (status === "signed-out") return <LoginView />;
  if (status === "awaiting-approval") {
    return (
      <AuthLayout>
        <h2 style={{ marginBottom: "var(--space-3)" }}>You're on the <span style={{ color: "var(--accent)" }}>list</span>.</h2>
        <p>
          {email ? `You're signed in as ${email}, but your account is awaiting approval. ` : "Your account is awaiting approval. "}
          We'll email you the moment you're in.
        </p>
        <button
          className="btn"
          style={{ marginTop: "var(--space-4)" }}
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </AuthLayout>
    );
  }
  return <>{children}</>;
}
