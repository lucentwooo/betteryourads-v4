"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandSummary } from "@bya/shared";
import { useResource } from "../data/cache";

type Props = { open: boolean; onClose: () => void };

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function StartModal({ open, onClose }: Props) {
  const router = useRouter();
  const { data: brands } = useResource<BrandSummary[]>("brands");
  const [url, setUrl] = useState("");

  function go() {
    const u = url.trim();
    if (!u) return;
    router.push(`/onboarding?url=${encodeURIComponent(u)}`);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-scrim"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-modal-title"
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: "var(--space-2)" }}>
          <div>
            <div className="eyebrow-acc">new ad</div>
            <h2 id="start-modal-title" style={{ margin: "4px 0 0" }}>Which brand?</h2>
            <p style={{ margin: "4px 0 0", fontFamily: "var(--font-sans)", fontSize: "var(--size-14)", color: "var(--fg-2)" }}>
              Pick a brand you've already analyzed, or add a new one.
            </p>
          </div>
          <button
            className="btn ghost icon"
            aria-label="Close"
            onClick={onClose}
            style={{ flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); go(); }}
          style={{ display: "flex", gap: 8, marginBottom: "var(--space-3)" }}
        >
          <input
            className="input"
            type="url"
            placeholder="https://yourcompany.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ flex: 1 }}
            aria-label="Website URL"
          />
          <button className="btn primary" type="submit">go</button>
        </form>

        {brands && brands.length > 0 && (
          <>
          <div className="eyebrow" style={{ margin: "4px 0 8px" }}>or your saved brands</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {brands.map((brand) => (
              <button
                key={brand.id}
                className="nav-item"
                style={{ width: "100%" }}
                onClick={() => { router.push(`/board/${brand.id}`); onClose(); }}
              >
                {hostname(brand.websiteUrl)}
              </button>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
