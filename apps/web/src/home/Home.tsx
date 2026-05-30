"use client";

import Link from "next/link";
import type { BrandSummary } from "@bya/shared";
import { useResource } from "../data/cache";
import Board from "../board/Board";

/** Home is the concept board for the current brand (legacy parity: renderHome === the board).
 *  Brands come back most-recent first, so brands[0] is the active brand. No brand → onboarding. */
export default function Home() {
  const { data: brands, status, error, refresh } = useResource<BrandSummary[]>("brands");

  // No data yet: distinguish a transient fetch failure (offer retry) from still-loading —
  // otherwise an existing user briefly sees the first-run onboarding screen on a blip.
  if (!brands) {
    if (status === "error") {
      return (
        <div className="canvas stack">
          <div className="stage">
            <div className="stage-body">
              <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>
                {error ?? "Couldn't load your brands."}
              </p>
              <button className="btn" onClick={() => refresh()}>Try again</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="canvas stack">
        <div className="status-row"><span className="spinner" /> Loading…</div>
      </div>
    );
  }

  const current = brands.length > 0 ? brands[0] : null;
  if (!current) {
    return (
      <div className="canvas stack">
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>Let's learn your brand</p>
          <p className="small" style={{ margin: 0 }}>
            Add your website and we'll read your colors, voice, and customers, then build your concept board.
          </p>
          <Link href="/onboarding" className="btn primary" style={{ marginTop: "var(--space-2)" }}>
            Get started
          </Link>
        </div>
      </div>
    );
  }

  return <Board brandId={current.id} />;
}
