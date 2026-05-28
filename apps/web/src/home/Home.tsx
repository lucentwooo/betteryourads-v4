import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import type { BrandSummary, AdSummary } from "@bya/shared";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { IconSparkle } from "../ui/icons";

function hostname(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function AdThumb({ ad }: { ad: AdSummary }) {
  return (
    <div className="lib-card">
      <div className="thumb">
        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span role="img" aria-label="Image unavailable" className="meta" style={{ padding: "var(--space-4)", textAlign: "center" }}>
            Image unavailable
          </span>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { email } = useAuth();
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [ads, setAds] = useState<AdSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    let settled = 0;
    setLoading(true);
    setError(null);
    function done() { if (++settled === 2 && active) setLoading(false); }
    function fail(e: unknown) { if (active) setError(e instanceof ApiError ? e.message : "Could not load your dashboard."); }
    api.getBrands().then((b) => { if (active) setBrands(b); }).catch(fail).finally(done);
    api.getAds().then((a) => { if (active) setAds(a); }).catch(fail).finally(done);
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{greeting()}{email ? `, ${email}` : ""}</h1>
          {!loading && !error && (
            <p className="lead" style={{ marginTop: "var(--space-2)" }}>
              {brands.length} saved {brands.length === 1 ? "brand" : "brands"} · {ads.length} ads generated
            </p>
          )}
        </div>
        <Link to="/create" className="btn primary">
          <IconSparkle className="ico" width={14} height={14} />
          Make today's ad
        </Link>
      </div>

      {loading && (
        <div className="status-row"><span className="spinner" /> Loading your workspace…</div>
      )}

      {!loading && error && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error}</p>
            <button className="btn" onClick={() => load()}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {ads.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h4>Recent ads</h4>
                <Link to="/library" className="small">View all</Link>
              </div>
              <div className="lib-grid">
                {ads.slice(0, 4).map((ad) => <AdThumb key={ad.id} ad={ad} />)}
              </div>
            </section>
          ) : (
            <div className="empty">
              <p className="lead" style={{ margin: 0 }}>No ads yet</p>
              <p className="small" style={{ margin: 0 }}>Generate your first on-brand ad in a couple of minutes.</p>
              <Link to="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Create your first ad</Link>
            </div>
          )}

          {brands.length > 0 && (
            <section className="section">
              <div className="section-head"><h4>Saved brands</h4></div>
              <div className="actions-row">
                {brands.map((b) => (
                  <Link key={b.id} to={`/create?brandId=${b.id}`} className="badge">
                    {hostname(b.websiteUrl)}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
