import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import type { AdSummary } from "@bya/shared";
import { api, ApiError } from "../api/client";

export default function Library() {
  const [ads, setAds] = useState<AdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getAds()
      .then((a) => { if (active) setAds(a); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : "Could not load your ads."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h1>Ad library</h1>
        <Link to="/create" className="btn primary">Make an ad</Link>
      </div>

      {loading && (
        <div className="status-row"><span className="spinner" /> Loading your ads…</div>
      )}

      {!loading && error && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error}</p>
            <button className="btn" onClick={() => load()}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && ads.length === 0 && (
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>No ads yet</p>
          <p className="small" style={{ margin: 0 }}>Generate one and it'll show up here.</p>
          <Link to="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Make an ad</Link>
        </div>
      )}

      {!loading && !error && ads.length > 0 && (
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
