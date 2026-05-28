import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { BrandSummary, AdSummary } from "@bya/shared";
import { api } from "../api/client";
import { useAuth } from "../auth/useAuth";

function hostname(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

export default function Home() {
  const { email } = useAuth();
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [ads, setAds] = useState<AdSummary[]>([]);

  useEffect(() => {
    let active = true;
    api.getBrands().then((b) => { if (active) setBrands(b); }).catch(() => {});
    api.getAds().then((a) => { if (active) setAds(a); }).catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div>
      <h1>Welcome, {email}</h1>
      <Link to="/create" className="btn primary">Make today's ad</Link>

      <section style={{ marginTop: 24 }}>
        <p>{brands.length} saved brands · {ads.length} ads generated</p>
      </section>

      {ads.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Recent ads</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            {ads.slice(0, 4).map((ad) => (
              <img key={ad.id} src={ad.imageUrl} alt="Generated ad" style={{ width: "100%", borderRadius: 4 }} />
            ))}
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
    </div>
  );
}
