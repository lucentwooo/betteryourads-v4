"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "./useAuth";
import { AuthLayout } from "./AuthLayout";

type Mode = "sign-in" | "sign-up" | "forgot";
type Msg = { type: "error" | "info"; text: string };

const HEADINGS: Record<Mode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  forgot: "Reset password",
};

export function LoginView() {
  const { supabase } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  const showPassword = mode === "sign-in" || mode === "sign-up";
  const origin = window.location.origin;

  function switchMode(next: Mode) {
    setMode(next);
    setMsg(null);
    setConfirmPassword("");
  }

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
        if (password !== confirmPassword) {
          setMsg({ type: "error", text: "Passwords don't match." });
          setBusy(false);
          return;
        }
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin } });
        setMsg(error ? { type: "error", text: error.message } : { type: "info", text: "Check your email to verify your account." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: origin });
        setMsg(error ? { type: "error", text: error.message } : { type: "info", text: "Check your email for a reset link." });
      }
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link";

  return (
    <AuthLayout>
      <h2>{HEADINGS[mode]}</h2>

      {mode === "forgot" ? (
        <p className="sub">Enter your email and we'll send you a link to reset your password.</p>
      ) : (
        <div className="auth-tabs">
          <button
            type="button"
            aria-pressed={mode === "sign-in"}
            className={`auth-tab${mode === "sign-in" ? " active" : ""}`}
            onClick={() => switchMode("sign-in")}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "sign-up"}
            className={`auth-tab${mode === "sign-up" ? " active" : ""}`}
            onClick={() => switchMode("sign-up")}
          >
            Create account
          </button>
        </div>
      )}

      <form onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {showPassword && (
          <label className="field">
            <span>Password</span>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        )}
        {mode === "sign-up" && (
          <label className="field" htmlFor="confirm-password">
            <span>Re-enter password</span>
            <input
              id="confirm-password"
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
        )}
        {msg && (
          <p className={`msg${msg.type === "error" ? " error" : ""}`} role={msg.type === "error" ? "alert" : undefined}>
            {msg.text}
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: "var(--space-4)", width: "100%" }}>
          {busy ? "…" : submitLabel}
        </button>
      </form>

      <div className="auth-foot">
        {mode === "sign-in" && (
          <button className="link-btn" type="button" onClick={() => switchMode("forgot")}>
            Forgot password?
          </button>
        )}
        {mode === "forgot" && (
          <button className="link-btn" type="button" onClick={() => switchMode("sign-in")}>
            Back to sign in
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
