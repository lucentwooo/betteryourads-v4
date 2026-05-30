"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../auth/useAuth";
import { IconHome, IconSparkle, IconGrid, IconUsers, IconCog } from "../ui/icons";

const NAV = [
  { to: "/", label: "Home", Icon: IconHome, end: true },
  { to: "/create", label: "Make an ad", Icon: IconSparkle, end: false },
  { to: "/library", label: "Library", Icon: IconGrid, end: false },
] as const;

const CRUMBS: Record<string, string> = {
  "/": "Home",
  "/create": "Make an ad",
  "/library": "Library",
  "/admin": "Accounts",
  "/admin/reference-ads": "Reference ads",
};

// Only this account sees / can reach the admin dashboard (mirrors the backend gate).
const ADMIN_EMAIL = "admin@betteryourads.dev";

function initial(email: string | null): string {
  return email?.trim()?.[0]?.toUpperCase() ?? "?";
}

function isActive(pathname: string, to: string, end: boolean): boolean {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { email, signOut } = useAuth();
  const pathname = usePathname() ?? "/";
  const current = CRUMBS[pathname] ?? "Make an ad";
  const isAdmin = email?.toLowerCase() === ADMIN_EMAIL;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="app">
      <nav className="rail" aria-label="Primary">
        <Link className="brand" href="/">
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
            <Link key={to} href={to} className={`nav-item${isActive(pathname, to, end) ? " active" : ""}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </div>

        {isAdmin && (
          <div className="nav-section">
            <h6>Admin</h6>
            <Link href="/admin" className={`nav-item${isActive(pathname, "/admin", true) ? " active" : ""}`}>
              <IconUsers />
              <span>Accounts</span>
            </Link>
            <Link href="/admin/reference-ads" className={`nav-item${isActive(pathname, "/admin/reference-ads", false) ? " active" : ""}`}>
              <IconGrid />
              <span>Reference ads</span>
            </Link>
          </div>
        )}

        <div className="footer">
          <div className="user" ref={menuRef}>
            <span className="avatar">{initial(email)}</span>
            <span className="meta">
              <span className="name">{email ?? "Signed in"}</span>
            </span>
            <button
              className="user-menu-cog btn ghost icon"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <IconCog />
            </button>

            {menuOpen && (
              <div className="user-menu-popover">
                <span className="user-menu-email">{email ?? ""}</span>
                <button
                  className="user-menu-signout"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
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
        <div className="canvas">{children}</div>
      </div>
    </div>
  );
}
