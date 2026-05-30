"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdSummary } from "@bya/shared";
import { useResource } from "../data/cache";
import { api } from "../api/client";

function AdCard({ ad }: { ad: AdSummary }) {
  return (
    <div className="lib-card">
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
  );
}

function hostnameOf(url: string | null | undefined): string {
  if (!url) return "Other";
  try {
    return new URL(url).hostname;
  } catch {
    return "Other";
  }
}

function groupByBrand(ads: AdSummary[]): { hostname: string; ads: AdSummary[] }[] {
  const order: string[] = [];
  const map = new Map<string, AdSummary[]>();
  for (const ad of ads) {
    const key = hostnameOf(ad.websiteUrl);
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(ad);
  }
  return order.map((hostname) => ({ hostname, ads: map.get(hostname)! }));
}

function AdGrid({ ads }: { ads: AdSummary[] }) {
  return (
    <div className="lib-grid">
      {ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
    </div>
  );
}

function UnscopedLibrary() {
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
        <>
          {groupByBrand(ads).map(({ hostname, ads: groupAds }) => (
            <div key={hostname}>
              <h2 style={{ margin: "var(--space-4) 0 var(--space-2)" }}>{hostname} <span style={{ fontWeight: "normal", opacity: 0.6 }}>({groupAds.length})</span></h2>
              <AdGrid ads={groupAds} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ScopedLibrary({ brandId }: { brandId: string }) {
  const [ads, setAds] = useState<AdSummary[] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoadState("loading");
    setError(null);
    api.getAds(brandId)
      .then((result) => {
        setAds(result);
        setLoadState("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load ads.");
        setLoadState("error");
      });
  }

  useEffect(() => { load(); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const brandHostname = ads?.[0]?.websiteUrl ? hostnameOf(ads[0].websiteUrl) : "Brand ads";

  return (
    <div className="stack">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h1>{brandHostname}</h1>
        <Link href="/create" className="btn primary">Make an ad</Link>
      </div>

      {loadState === "loading" && (
        <div className="status-row"><span className="spinner" /> Loading your ads…</div>
      )}

      {loadState === "error" && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error ?? "Could not load your ads."}</p>
            <button className="btn" onClick={() => load()}>Try again</button>
          </div>
        </div>
      )}

      {loadState === "ready" && ads !== null && ads.length === 0 && (
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>No ads yet</p>
          <p className="small" style={{ margin: 0 }}>Generate one and it'll show up here.</p>
          <Link href="/create" className="btn primary" style={{ marginTop: "var(--space-2)" }}>Make an ad</Link>
        </div>
      )}

      {loadState === "ready" && ads !== null && ads.length > 0 && (
        <AdGrid ads={ads} />
      )}
    </div>
  );
}

export default function Library() {
  const params = useSearchParams();
  const brandId = params.get("brandId");

  if (brandId) {
    return <ScopedLibrary brandId={brandId} />;
  }
  return <UnscopedLibrary />;
}
