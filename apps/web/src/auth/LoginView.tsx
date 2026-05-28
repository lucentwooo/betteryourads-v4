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
          <p style={{ marginTop: "var(--space-3)", color: msg.type === "error" ? "var(--bya-oxblood)" : "var(--fg-2)" }}>{msg.text}</p>
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
