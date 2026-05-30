"use client";

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
      <h2 style={{ marginBottom: "var(--space-2)" }}>Set a new password</h2>
      <p className="sub" style={{ marginBottom: "var(--space-4)" }}>Choose a new password for your account.</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p style={{ marginTop: "var(--space-3)", color: "var(--bya-oxblood)" }}>{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: "var(--space-4)", width: "100%" }}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
}
