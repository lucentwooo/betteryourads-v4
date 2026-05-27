import { useReducer, useState } from "react";
import { reducer, initialState } from "./state";
import { Dropzone } from "./Dropzone";
import { brandName, positioningLine, accentColor } from "./brandChip";
import { api, ApiError } from "../api/client";

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong.";
}

export default function Workbench() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [urlInput, setUrlInput] = useState("");

  async function runAnalyze(url: string) {
    dispatch({ type: "START", url });
    try {
      const msd = await api.extract(url);
      const { brandExtraction } = await api.brand({ url, measuredSiteData: msd });
      dispatch({ type: "ANALYZED", measuredSiteData: msd, brandExtraction });
    } catch (e) {
      dispatch({ type: "FAILED", message: message(e) });
    }
  }

  async function runGenerate() {
    const { refImage, logoImage, brandExtraction, productAsset } = state;
    if (!refImage || !logoImage || !brandExtraction) return;
    dispatch({ type: "GENERATE" });
    try {
      const { adPrompt } = await api.adPrompt({
        brandExtraction,
        referenceAdImage: refImage,
        logoImage,
        productAsset: productAsset ?? undefined,
      });
      const { imageUrl } = await api.render({
        adPrompt,
        referenceAdImage: refImage,
        logoImage,
        productAsset: productAsset ?? undefined,
      });
      dispatch({ type: "GENERATED", adPrompt, imageUrl });
    } catch (e) {
      dispatch({ type: "FAILED", message: message(e) });
    }
  }

  const { stage } = state;

  if (stage === "idle") {
    return (
      <div className="stage">
        <h1>Make an ad</h1>
        <div className="field">
          <label>Website URL</label>
          <input
            className="input"
            type="url"
            placeholder="https://yoursite.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
        </div>
        <button
          className="btn primary"
          disabled={!urlInput.trim()}
          onClick={() => runAnalyze(urlInput.trim())}
        >
          Analyze brand
        </button>
      </div>
    );
  }

  if (stage === "analyzing") {
    let hostname = "";
    try { hostname = new URL(state.url).hostname; } catch { hostname = state.url; }
    return (
      <div className="stage">
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg-2)", fontSize: 14 }}>
          <span className="spinner" />
          Reading {hostname}…
        </div>
      </div>
    );
  }

  if (stage === "pick-ref") {
    const be = state.brandExtraction;
    const msd = state.measuredSiteData;
    const accent = accentColor(be, msd);
    return (
      <div className="stage">
        <div className="brand-panel" style={{ marginBottom: 20 }}>
          <strong>{brandName(be)}</strong>
          {positioningLine(be) && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--fg-2)" }}>{positioningLine(be)}</p>}
          <span
            className="badge"
            style={{ background: accent, color: "#fff", marginTop: 8, display: "inline-block" }}
          >
            {accent}
          </span>
        </div>
        <Dropzone
          label="Reference ad"
          value={state.refImage}
          onPick={(d) => dispatch({ type: "SET_REF", dataUrl: d })}
        />
        <Dropzone
          label="Logo"
          height={96}
          value={state.logoImage}
          onPick={(d) => dispatch({ type: "SET_LOGO", dataUrl: d })}
        />
        <Dropzone
          label="Product image (optional)"
          value={state.productAsset}
          onPick={(d) => dispatch({ type: "SET_PRODUCT", dataUrl: d })}
        />
        <button
          className="btn primary"
          disabled={!(state.refImage && state.logoImage)}
          onClick={() => runGenerate()}
        >
          Make my ad
        </button>
      </div>
    );
  }

  if (stage === "generating") {
    return (
      <div className="stage">
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--fg-2)", fontSize: 14 }}>
          <span className="spinner" />
          Generating your ad…
        </div>
      </div>
    );
  }

  if (stage === "ready") {
    return (
      <div className="stage">
        <img src={state.imageUrl ?? ""} alt="Generated ad" style={{ maxWidth: "100%" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <a href={state.imageUrl ?? ""} download className="btn">
            Download
          </a>
          <button className="btn" onClick={() => dispatch({ type: "RESET" })}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="stage">
        <p style={{ color: "var(--bya-oxblood)" }}>{state.error}</p>
        <button className="btn" onClick={() => dispatch({ type: "RESET" })}>
          Try again
        </button>
      </div>
    );
  }

  return null;
}
