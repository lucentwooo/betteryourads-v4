"use client";

import Link from "next/link";
import type { AdSummary } from "@bya/shared";
import { useResource } from "../data/cache";

export default function Library() {
  const { data, status, error, refresh } = useResource<AdSummary[]>("ads");
  const ads = data ?? [];
  const loading = data === null && (status === "loading" || status === "idle");
  const showError = data === null && status === "error";

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h1>Ad library</h1>
        <Link href="/create" className="btn primary">Make an ad</Link>
      </div>

      {loading && (
        <div className="status-row"><span className="spinner" /> Loading your ads…</div>
      )}

      {showError && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error ?? "Could not load your ads."}</p>
            <button className="btn" onClick={() => refresh()}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !showError && ads.length === 0 && (
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>No ads yet</p>
          <p className="small" style={{ margin: 0 }}>Generate one and it'll show up here.</p>
          <Link href="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Make an ad</Link>
        </div>
      )}

      {!loading && !showError && ads.length > 0 && (
        <div className="lib-grid">
          {ads.map((ad) => (
            <div className="lib-card" key={ad.id}>
              {ad.imageUrl ? (
                <a className="thumb" href={ad.imageUrl} target="_blank" rel="noreferrer">
                  <img src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </a>
              ) : (
                <div className="thumb">
                  <span role="img" aria-label="Image unavailable" className="meta" style={{ padding: "var(--space-4)", textAlign: "center" }}>
                    Image unavailable
                  </span>
                </div>
              )}
              <div className="meta">
                <div className="when">{ad.createdAt.slice(0, 10)} · {ad.aspectRatio} · {ad.resolution}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
