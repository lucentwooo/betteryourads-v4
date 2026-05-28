import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import type { BrandSummary, AdSummary } from "@bya/shared";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

function hostname(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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
    <div>
      <h1>{greeting()}{email ? `, ${email}` : ""}</h1>
      <Link to="/create" className="btn primary">Make today's ad</Link>

      {!loading && error && (
        <div className="stage" style={{ marginTop: 24 }}>
          <p style={{ color: "var(--bya-oxblood)" }}>{error}</p>
          <button className="btn" onClick={() => load()}>Try again</button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section style={{ marginTop: 24 }}>
            <p>{brands.length} saved brands · {ads.length} ads generated</p>
          </section>

          {ads.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2>Recent ads</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
                {ads.slice(0, 4).map((ad) =>
                  ad.imageUrl ? (
                    <img key={ad.id} src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", borderRadius: 4 }} />
                  ) : (
                    <div
                      key={ad.id}
                      role="img"
                      aria-label="Image unavailable"
                      style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-2)", color: "var(--fg-2)", fontSize: 12, textAlign: "center", padding: 8 }}
                    >
                      Image unavailable
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

          {brands.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2>Saved brands</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
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
