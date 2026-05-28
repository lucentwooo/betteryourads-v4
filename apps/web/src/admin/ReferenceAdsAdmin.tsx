import { useCallback, useEffect, useRef, useState } from "react";
import type { ReferenceAd, ReferenceAdVariant } from "@bya/shared";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";
import { fileToDataUrl } from "../workbench/fileToDataUrl";
import { IconTrash, IconUpload } from "../ui/icons";

const ADMIN_EMAIL = "admin@betteryourads.dev";

const TABS: { variant: ReferenceAdVariant; label: string }[] = [
  { variant: "with_asset", label: "With product asset" },
  { variant: "no_asset", label: "No product asset" },
];

export default function ReferenceAdsAdmin() {
  const { email } = useAuth();
  const [activeTab, setActiveTab] = useState<ReferenceAdVariant>("with_asset");
  const [ads, setAds] = useState<ReferenceAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  // per-ad state: "deleting" | "confirming" | null
  const [adState, setAdState] = useState<Record<string, "deleting" | "confirming">>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback((variant: ReferenceAdVariant) => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getReferenceAds(variant)
      .then((items) => { if (active) setAds(items); })
      .catch((e) => { if (active) setError(e instanceof ApiError ? e.message : "Could not load reference ads."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Block only once auth has resolved to a non-admin email; an unresolved (null) email is
  // allowed through, matching AdminDashboard (the route is admin-gated server-side too).
  const blocked = email != null && email.toLowerCase() !== ADMIN_EMAIL;
  useEffect(() => {
    if (blocked) return;
    return load(activeTab);
  }, [blocked, load, activeTab]);

  function handleTabChange(variant: ReferenceAdVariant) {
    if (variant === activeTab) return;
    setAdState({});
    setUploadError(null);
    setLabel("");
    setActiveTab(variant);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const created = await api.adminCreateReferenceAd(activeTab, dataUrl, label.trim() || null);
      setAds((prev) => [created, ...prev]);
      setLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setAdState((prev) => ({ ...prev, [id]: "deleting" }));
    try {
      await api.adminDeleteReferenceAd(id);
      setAds((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // on error just clear the deleting state; ad stays in list
      setAdState((prev) => { const next = { ...prev }; delete next[id]; return next; });
    }
  }

  function requestConfirm(id: string) {
    setAdState((prev) => ({ ...prev, [id]: "confirming" }));
  }

  function cancelConfirm(id: string) {
    setAdState((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  if (blocked) {
    return (
      <div className="empty">
        <p className="lead" style={{ margin: 0 }}>Not authorized</p>
        <p className="small" style={{ margin: 0 }}>This area is for administrators only.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Page header */}
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Reference ads</h1>
          <p className="small" style={{ margin: "var(--space-1) 0 0", color: "var(--fg-3)" }}>
            Curated reference images shown to the vision model during ad-prompt generation.
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="ref-ads-tabs" role="tablist" aria-label="Library variant">
        {TABS.map(({ variant, label: tabLabel }) => (
          <button
            key={variant}
            role="tab"
            aria-selected={activeTab === variant}
            className={`ref-ads-tab${activeTab === variant ? " active" : ""}`}
            onClick={() => handleTabChange(variant)}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {/* Upload control */}
      <div className="ref-ads-upload-row">
        <div className="field" style={{ margin: 0, flex: "1 1 200px", minWidth: 0 }}>
          <label htmlFor="ref-label" className="small" style={{ color: "var(--fg-2)" }}>
            Label (optional)
          </label>
          <input
            id="ref-label"
            className="input"
            placeholder="e.g. Nike shoes with clean background"
            value={label}
            disabled={uploading}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flexShrink: 0 }}>
          <label
            htmlFor="ref-upload"
            className={`btn${uploading ? " ghost" : ""}`}
            style={{ cursor: uploading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
            aria-label="Upload reference ad image"
          >
            {uploading
              ? <span className="spinner" style={{ width: 14, height: 14 }} />
              : <IconUpload width={14} height={14} />}
            {uploading ? "Uploading…" : "Upload image"}
          </label>
          <input
            id="ref-upload"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={uploading}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      </div>

      {uploadError && (
        <p className="small" role="alert" style={{ margin: 0, color: "var(--bya-oxblood)" }}>
          {uploadError}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="status-row"><span className="spinner" /> Loading reference ads…</div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{error}</p>
            <button className="btn" onClick={() => load(activeTab)}>Try again</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && ads.length === 0 && (
        <div className="empty">
          <p className="lead" style={{ margin: 0 }}>No reference ads in this library yet.</p>
          <p className="small" style={{ margin: 0 }}>Upload an image above to add the first one.</p>
        </div>
      )}

      {/* Thumbnail grid */}
      {!loading && !error && ads.length > 0 && (
        <div className="ref-lib-grid ref-ads-grid">
          {ads.map((ad) => {
            const state = adState[ad.id];
            const isDeleting = state === "deleting";
            const isConfirming = state === "confirming";
            return (
              <div key={ad.id} className="ref-ads-thumb-wrap">
                <div className={`ref-lib-thumb${isDeleting ? " is-loading" : ""}`} style={{ cursor: "default", position: "relative" }}>
                  <img src={ad.url} alt={ad.label ?? "Reference ad"} loading="lazy" />
                  {!isDeleting && !isConfirming && (
                    <button
                      className="ref-ads-del-btn"
                      aria-label={`Delete reference ad${ad.label ? ` "${ad.label}"` : ""}`}
                      onClick={() => requestConfirm(ad.id)}
                      title="Delete"
                    >
                      <IconTrash width={12} height={12} />
                      <span className="ref-ads-del-label">Delete</span>
                    </button>
                  )}
                  {isDeleting && (
                    <div className="ref-ads-del-overlay">
                      <span className="spinner" style={{ width: 16, height: 16 }} />
                    </div>
                  )}
                </div>
                {isConfirming && (
                  <div className="ref-ads-confirm-row">
                    <button
                      className="btn sm danger"
                      onClick={() => void handleDelete(ad.id)}
                    >
                      Confirm delete
                    </button>
                    <button
                      className="btn sm ghost"
                      onClick={() => cancelConfirm(ad.id)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {ad.label && (
                  <p className="ref-ads-label">{ad.label}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
