import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { AdSummary } from "@bya/shared";
import { api } from "../api/client";

export default function Library() {
  const [ads, setAds] = useState<AdSummary[]>([]);

  useEffect(() => {
    let active = true;
    api.getAds().then((a) => { if (active) setAds(a); }).catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div>
      <h1>My Ad Library</h1>
      {ads.length === 0 ? (
        <p>No ads yet — generate one → <Link to="/create">Make an ad</Link></p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12, marginTop: 12 }}>
          {ads.map((ad) => (
            <div key={ad.id}>
              <a href={ad.imageUrl} target="_blank" rel="noreferrer">
                <img src={ad.imageUrl} alt={`Ad ${ad.id}`} style={{ width: "100%", borderRadius: 4 }} />
              </a>
              <p style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 4 }}>{ad.createdAt.slice(0, 10)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
