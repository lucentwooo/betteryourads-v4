"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../auth/useAuth";
import { IconHome, IconSparkle, IconGrid, IconUsers, IconCog } from "../ui/icons";
import { useResource } from "../data/cache";
import type { BrandSummary } from "@bya/shared";
import { StartModal } from "./StartModal";

const CRUMBS: Record<string, string> = {
  "/": "concept board",
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

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { email, signOut } = useAuth();
  const pathname = usePathname() ?? "/";
  const current = CRUMBS[pathname] ?? "Make an ad";
  const isAdmin = email?.toLowerCase() === ADMIN_EMAIL;

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: brands } = useResource<BrandSummary[]>("brands");
  const savedBrands = brands ? brands.slice(0, 6) : [];

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
          <img className="mark" src="/logo-mark.png" alt="" width={28} height={28} />
          <span className="wordmark">BetterYour<span className="ads">Ads</span></span>
        </Link>

        <div className="nav-section">
          <Link href="/" className={`nav-item${isActive(pathname, "/", true) ? " active" : ""}`}>
            <IconHome />
            <span>Home</span>
          </Link>
          <button
            className={`nav-item${isActive(pathname, "/create", false) ? " active" : ""}`}
            onClick={() => setModalOpen(true)}
          >
            <IconSparkle />
            <span>Make an ad</span>
          </button>
          <Link href="/library" className={`nav-item${isActive(pathname, "/library", false) ? " active" : ""}`}>
            <IconGrid />
            <span>My ads</span>
          </Link>
          <Link href="/library" className="nav-item">
            <IconUsers />
            <span>Brands</span>
          </Link>
          <Link href="/onboarding" className="nav-item">
            <span>+ Add client</span>
          </Link>
        </div>

        {savedBrands.length > 0 && (
          <div className="nav-section">
            <h6>Your brands</h6>
            {savedBrands.map((brand) => (
              <Link
                key={brand.id}
                href={`/board/${brand.id}`}
                className={`nav-item${isActive(pathname, `/board/${brand.id}`, false) ? " active" : ""}`}
              >
                <span>{hostname(brand.websiteUrl)}</span>
              </Link>
            ))}
          </div>
        )}

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
        </header>
        <div className="canvas">{children}</div>
      </div>

      <StartModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
