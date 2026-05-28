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
    <div>
      <h1>My Ad Library</h1>
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <div className="stage">
          <p style={{ color: "var(--bya-oxblood)" }}>{error}</p>
          <button className="btn" onClick={() => load()}>Try again</button>
        </div>
      ) : ads.length === 0 ? (
        <p>No ads yet — generate one → <Link to="/create">Make an ad</Link></p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12, marginTop: 12 }}>
          {ads.map((ad) => (
            <div key={ad.id}>
              {ad.imageUrl ? (
                <a href={ad.imageUrl} target="_blank" rel="noreferrer">
                  <img src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", borderRadius: 4 }} />
                </a>
              ) : (
                <div
                  role="img"
                  aria-label="Image unavailable"
                  style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-2)", color: "var(--fg-2)", fontSize: 12, textAlign: "center", padding: 8 }}
                >
                  Image unavailable
                </div>
              )}
              <p style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 4 }}>{ad.createdAt.slice(0, 10)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
