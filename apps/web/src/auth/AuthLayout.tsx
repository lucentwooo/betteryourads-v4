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
