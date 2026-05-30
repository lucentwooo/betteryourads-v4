"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BrandSummary, AdSummary } from "@bya/shared";
import { useResource } from "../data/cache";
import { useAuth } from "../auth/useAuth";
import { IconSparkle } from "../ui/icons";

function hostname(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

function computeGreeting(): string {
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
  const brandsRes = useResource<BrandSummary[]>("brands");
  const adsRes = useResource<AdSummary[]>("ads");
  const brands = brandsRes.data ?? [];
  const ads = adsRes.data ?? [];

  // Greeting depends on the clock → compute after hydration to avoid an SSR mismatch.
  const [greeting, setGreeting] = useState("");
  useEffect(() => setGreeting(computeGreeting()), []);

  const loading =
    (adsRes.data === null && (adsRes.status === "loading" || adsRes.status === "idle")) ||
    (brandsRes.data === null && (brandsRes.status === "loading" || brandsRes.status === "idle"));
  const error = (adsRes.data === null && adsRes.status === "error")
    ? adsRes.error
    : (brandsRes.data === null && brandsRes.status === "error")
      ? brandsRes.error
      : null;

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{greeting}{greeting && email ? `, ${email}` : ""}</h1>
          {!loading && !error && (
            <p className="lead" style={{ marginTop: "var(--space-2)" }}>
              {brands.length} saved {brands.length === 1 ? "brand" : "brands"} · {ads.length} ads generated
            </p>
          )}
        </div>
        <Link href="/create" className="btn primary">
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
            <button className="btn" onClick={() => { adsRes.refresh(); brandsRes.refresh(); }}>Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          {ads.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h4>Recent ads</h4>
                <Link href="/library" className="small">View all</Link>
              </div>
              <div className="lib-grid">
                {ads.slice(0, 4).map((ad) => <AdThumb key={ad.id} ad={ad} />)}
              </div>
            </section>
          ) : (
            <div className="empty">
              <p className="lead" style={{ margin: 0 }}>No ads yet</p>
              <p className="small" style={{ margin: 0 }}>Generate your first on-brand ad in a couple of minutes.</p>
              <Link href="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Create your first ad</Link>
            </div>
          )}

          {brands.length > 0 && (
            <section className="section">
              <div className="section-head"><h4>Saved brands</h4></div>
              <div className="actions-row">
                {brands.map((b) => (
                  <Link key={b.id} href={`/board/${b.id}`} className="badge">
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
