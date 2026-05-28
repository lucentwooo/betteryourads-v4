import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { IconHome, IconSparkle, IconGrid } from "../ui/icons";

const NAV = [
  { to: "/", label: "Home", Icon: IconHome, end: true },
  { to: "/create", label: "Make an ad", Icon: IconSparkle, end: false },
  { to: "/library", label: "Library", Icon: IconGrid, end: false },
] as const;

const CRUMBS: Record<string, string> = {
  "/": "Home",
  "/create": "Make an ad",
  "/library": "Library",
};

function initial(email: string | null): string {
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

export function AppShell() {
  const { email, signOut } = useAuth();
  const { pathname } = useLocation();
  const current = CRUMBS[pathname] ?? "Make an ad";

  return (
    <div className="app">
      <nav className="rail" aria-label="Primary">
        <Link className="brand" to="/">
          <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
            <rect x="1" y="1" width="26" height="26" rx="6" fill="var(--fg)" />
            <path d="M8 19 14 8l6 11" stroke="var(--bg)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.5 15h7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="wordmark">BetterYour<span className="ads">Ads</span></span>
        </Link>

        <div className="nav-section">
          <h6>Workspace</h6>
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="footer">
          <div className="user">
            <span className="avatar">{initial(email)}</span>
            <span className="meta">
              <span className="name">{email ?? "Signed in"}</span>
              <button className="role" onClick={() => void signOut()} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}>
                Sign out
              </button>
            </span>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <span className="crumb">BetterYourAds</span>
            <span className="crumb-sep">/</span>
            <span className="crumb current">{current}</span>
          </div>
          <div className="actions">
            <span className="meta">{email ?? ""}</span>
          </div>
        </header>
        <div className="canvas">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
