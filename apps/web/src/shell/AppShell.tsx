import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export function AppShell() {
  const { email, signOut } = useAuth();
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <nav className="rail" style={{ width: 232, borderRight: "1px solid var(--fg)" }}>
        <div className="brand">
          <span className="wordmark">BetterYourAds</span>
        </div>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/create">Make an ad</NavLink>
        <NavLink to="/library">Library</NavLink>
      </nav>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
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
