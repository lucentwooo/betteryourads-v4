import { useReducer, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { MeasuredSiteData } from "@bya/shared";
import { reducer, initialState, type Stage, type WorkbenchState, type Action } from "./state";
import type { Dispatch } from "react";
import { Dropzone } from "./Dropzone";
import { brandName, positioningLine, accentColor } from "./brandChip";
import { api, ApiError, type UsageInfo } from "../api/client";
import { IconDownload } from "../ui/icons";

function failure(e: unknown): { message: string; code?: string } {
  return e instanceof ApiError ? { message: e.message, code: e.code } : { message: "Something went wrong." };
}

const STEP_LABELS = ["Analyze brand", "Add assets", "Generate"] as const;

function stepStates(stage: Stage): ("done" | "active" | "")[] {
  switch (stage) {
    case "idle":
    case "analyzing":
      return ["active", "", ""];
    case "pick-ref":
      return ["done", "active", ""];
    case "generating":
      return ["done", "done", "active"];
    case "ready":
      return ["done", "done", "done"];
    default:
      return ["", "", ""];
  }
}

function Stepper({ stage }: { stage: Stage }) {
  if (stage === "error") return null;
  const states = stepStates(stage);
  return (
    <nav className="steps" aria-label="Progress">
      {STEP_LABELS.map((label, i) => (
        <div className="step-wrap" key={label} style={{ display: "contents" }}>
          <div className={`step ${states[i]}`}>
            <span className="dot">{states[i] === "done" ? "✓" : i + 1}</span>
            <span className="lbl">{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && <span className="bar" />}
        </div>
      ))}
    </nav>
  );
}

export default function Workbench() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [urlInput, setUrlInput] = useState("");
  const [searchParams] = useSearchParams();
  const brandId = searchParams.get("brandId");
  const presetDone = useRef(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  function refreshUsage() {
    api.getUsage().then(setUsage).catch(() => {});
  }
  useEffect(refreshUsage, []);

  useEffect(() => {
    if (!brandId || presetDone.current) return;
    presetDone.current = true;
    let active = true;
    api.getBrand(brandId)
      .then((detail) => {
        if (!active) return;
        const msd = MeasuredSiteData.safeParse(detail.measuredSiteData);
        dispatch({ type: "PRESET_BRAND", brandExtraction: detail.brandExtraction, brandExtractionId: detail.id, measuredSiteData: msd.success ? msd.data : null });
      })
      .catch((e) => { if (active) dispatch({ type: "FAILED", message: e instanceof ApiError ? e.message : "Could not load that brand." }); });
    return () => { active = false; };
  }, [brandId]);

  async function runAnalyze(url: string) {
    dispatch({ type: "START", url });
    try {
      const msd = await api.extract(url);
      const { id: brandExtractionId, brandExtraction } = await api.brand({ url, measuredSiteData: msd });
      dispatch({ type: "ANALYZED", measuredSiteData: msd, brandExtraction, brandExtractionId });
    } catch (e) {
      dispatch({ type: "FAILED", ...failure(e) });
    }
  }

  async function runGenerate() {
    if (state.stage === "generating") return;
    const { refImage, logoImage, brandExtraction, brandExtractionId, productAsset } = state;
    if (!refImage || !logoImage || !brandExtraction) return;
    dispatch({ type: "GENERATE" });
    try {
      const { id: adPromptId, adPrompt } = await api.adPrompt({
        brandExtraction,
        brandExtractionId: brandExtractionId ?? undefined,
        referenceAdImage: refImage,
        logoImage,
        productAsset: productAsset ?? undefined,
      });
      const { imageUrl } = await api.render({
        adPrompt,
        adPromptId,
        referenceAdImage: refImage,
        logoImage,
        productAsset: productAsset ?? undefined,
      });
      dispatch({ type: "GENERATED", adPrompt, adPromptId, imageUrl });
    } catch (e) {
      dispatch({ type: "FAILED", ...failure(e) });
    } finally {
      refreshUsage();
    }
  }

  const { stage } = state;

  return (
    <div style={{ maxWidth: 760 }}>
      <Stepper stage={stage} />

      {stage === "idle" && (
        <div className="stage active">
          <div className="stage-head">
            <div className="left">
              <span className="num">1</span>
              <div>
                <div className="title">Make an ad</div>
                <div className="sub">Paste your website — we'll read your brand automatically.</div>
              </div>
            </div>
          </div>
          <div className="stage-body">
            <div className="field">
              <label htmlFor="site-url">Website URL</label>
              <input
                id="site-url"
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://yoursite.com"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) runAnalyze(urlInput.trim()); }}
              />
              <span className="hint">We read colors, fonts, logos and copy straight from the page.</span>
            </div>
            <button
              className="btn primary"
              disabled={!urlInput.trim()}
              onClick={() => runAnalyze(urlInput.trim())}
            >
              Analyze brand
            </button>
          </div>
        </div>
      )}

      {stage === "analyzing" && (
        <div className="stage active">
          <div className="stage-body">
            <div className="status-row">
              <span className="spinner" />
              Reading {hostnameOf(state.url)}…
            </div>
          </div>
        </div>
      )}

      {stage === "pick-ref" && (
        <PickRef state={state} dispatch={dispatch} onGenerate={runGenerate} usage={usage} />
      )}

      {stage === "generating" && (
        <div className="stage active">
          <div className="stage-body">
            <div className="status-row">
              <span className="spinner" />
              Generating your ad…
            </div>
          </div>
        </div>
      )}

      {stage === "ready" && (
        <div className="stage done">
          <div className="stage-head">
            <div className="left">
              <span className="num">✓</span>
              <div>
                <div className="title">Your ad is ready</div>
                <div className="sub">Download it, or start over to make another.</div>
              </div>
            </div>
          </div>
          <div className="stage-body">
            <img src={state.imageUrl ?? ""} alt="Generated ad" style={{ maxWidth: "100%", borderRadius: "var(--radius-md)", border: "1px solid var(--border-hairline)" }} />
            <div className="actions-row" style={{ marginTop: "var(--space-4)" }}>
              <a href={state.imageUrl ?? ""} download className="btn primary">
                <IconDownload className="ico" width={14} height={14} />
                Download
              </a>
              <button className="btn" onClick={() => dispatch({ type: "RESET" })}>
                Start over
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "error" && state.errorCode === "RATE_LIMITED" && (
        <div className="stage">
          <div className="stage-body">
            <span className="badge" style={{ marginBottom: "var(--space-3)" }}>Daily limit reached</span>
            <p style={{ margin: "0 0 var(--space-4)" }}>{state.error}</p>
            <button className="btn" onClick={() => dispatch({ type: "RETRY" })}>
              Back
            </button>
          </div>
        </div>
      )}

      {stage === "error" && state.errorCode !== "RATE_LIMITED" && (
        <div className="stage">
          <div className="stage-body">
            <span className="badge error" style={{ marginBottom: "var(--space-3)" }}>Error</span>
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{state.error}</p>
            <button className="btn" onClick={() => dispatch({ type: "RETRY" })}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function PickRef({ state, dispatch, onGenerate, usage }: { state: WorkbenchState; dispatch: Dispatch<Action>; onGenerate: () => void; usage: UsageInfo | null }) {
  const be = state.brandExtraction;
  const msd = state.measuredSiteData;
  const accent = accentColor(be, msd);
  const positioning = positioningLine(be);
  const capped = usage !== null && !usage.unlimited && usage.remaining <= 0;

  return (
    <div className="stack">
      <div className="stage">
        <div className="stage-head">
          <div className="left">
            <span className="num">✓</span>
            <div>
              <div className="title">{brandName(be)}</div>
              {positioning && <div className="sub">{positioning}</div>}
            </div>
          </div>
          {accent && (
            <span className="swatch">
              <span className="chip" style={{ background: accent }} />
              {accent}
            </span>
          )}
        </div>
      </div>

      <div className="stage active">
        <div className="stage-head">
          <div className="left">
            <span className="num">2</span>
            <div>
              <div className="title">Add your assets</div>
              <div className="sub">A reference ad and your logo are required. A product image is optional.</div>
            </div>
          </div>
        </div>
        <div className="stage-body stack">
          <Dropzone
            label="Reference ad"
            required
            value={state.refImage}
            onPick={(d) => dispatch({ type: "SET_REF", dataUrl: d })}
          />
          <Dropzone
            label="Logo"
            required
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
            disabled={!(state.refImage && state.logoImage) || capped}
            onClick={() => onGenerate()}
          >
            Make my ad
          </button>
          {usage !== null && !usage.unlimited && (
            <span className="hint">
              {capped
                ? "Daily limit reached — resets at midnight UTC."
                : `${usage.remaining} of ${usage.limit} creatives left today.`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
