"use client";

import { useReducer, useState, useEffect, useRef, useCallback } from "react";
import type { Dispatch } from "react";
import Link from "next/link";
import { MeasuredSiteData, type ReferenceAd, type Concept } from "@bya/shared";
import { reducer, initialState, type Stage, type WorkbenchState, type Action, type ConceptAssets } from "./state";
import { Dropzone } from "./Dropzone";
import { api, ApiError, type UsageInfo } from "../api/client";
import { IconDownload } from "../ui/icons";
import { Toast } from "../ui/Toast";

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not load reference image."));
    reader.readAsDataURL(blob);
  });
}

function failure(e: unknown): { message: string; code?: string } {
  return e instanceof ApiError ? { message: e.message, code: e.code } : { message: "Something went wrong." };
}

const STEP_LABELS = ["Add assets", "Generate"] as const;

function stepStates(stage: Stage): ("done" | "active" | "")[] {
  switch (stage) {
    case "pick-assets":
      return ["active", ""];
    case "batch-running":
      return ["done", "active"];
    case "batch-done":
      return ["done", "done"];
    default:
      return ["", ""];
  }
}

function Stepper({ stage }: { stage: Stage }) {
  if (stage === "error" || stage === "empty") return null;
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

/** Read the board's stashed selection once, then clear it so a refresh doesn't replay it. */
function readStash(): { brandId: string; concepts: Concept[] } | null {
  if (typeof window === "undefined") return null;
  const brandId = sessionStorage.getItem("bya_selected_brand");
  const raw = sessionStorage.getItem("bya_selected_concepts");
  sessionStorage.removeItem("bya_selected_brand");
  sessionStorage.removeItem("bya_selected_concepts");
  if (!brandId || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return { brandId, concepts: parsed as Concept[] };
  } catch {
    return null;
  }
}

export default function Workbench() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const presetDone = useRef(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const prevStage = useRef<Stage | null>(null);

  function refreshUsage() {
    api.getUsage().then(setUsage).catch(() => {});
  }
  useEffect(refreshUsage, []);

  useEffect(() => {
    if (presetDone.current) return;
    presetDone.current = true;
    const stash = readStash();
    if (!stash) return;
    let active = true;
    api.getBrand(stash.brandId)
      .then(async (detail) => {
        if (!active) return;
        const msd = MeasuredSiteData.safeParse(detail.measuredSiteData);
        dispatch({ type: "PRESET", brandExtraction: detail.brandExtraction, brandExtractionId: detail.id, measuredSiteData: msd.success ? msd.data : null, concepts: stash.concepts });
        // Pre-fill logo for each concept if the brand has a saved logo
        if (detail.logoUrl) {
          try {
            const dataUrl = await urlToDataUrl(detail.logoUrl);
            if (!active) return;
            for (let i = 0; i < stash.concepts.length; i++) {
              dispatch({ type: "SET_ASSET", index: i, slot: "logo", dataUrl });
            }
          } catch {
            // logo prefill is best-effort; don't fail the whole load
          }
        }
      })
      .catch((e) => { if (active) dispatch({ type: "FAILED", message: e instanceof ApiError ? e.message : "Could not load that brand." }); });
    return () => { active = false; };
  }, []);

  async function runBatch() {
    if (!state.brandExtraction || !state.brandExtractionId) return;
    const shared = state.assets[0] ?? {};
    const items = state.selectedConcepts.map((concept) => ({
      concept, referenceAdImage: shared.ref!, logoImage: shared.logo!, productAsset: shared.product,
    }));
    try {
      const { batchId } = await api.startBatch({ brandExtractionId: state.brandExtractionId, brandExtraction: state.brandExtraction, items });
      dispatch({ type: "BATCH_STARTED", batchId });
    } catch (e) {
      dispatch({ type: "FAILED", ...failure(e) });
    }
  }

  useEffect(() => {
    if (state.stage !== "batch-running" || !state.batchId) return;
    let active = true;
    const tick = async () => {
      try {
        const view = await api.getBatch(state.batchId!);
        if (!active) return;
        if (view.status === "done" || view.status === "error") {
          dispatch({ type: "BATCH_DONE", items: view.items });
          refreshUsage();
        } else {
          dispatch({ type: "BATCH_UPDATED", items: view.items });
        }
      } catch { /* keep polling; transient errors shouldn't kill the batch view */ }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { active = false; clearInterval(id); };
  }, [state.stage, state.batchId]);

  const closeToast = useCallback(() => setToastOpen(false), []);

  const { stage } = state;

  useEffect(() => {
    if (prevStage.current !== "batch-done" && stage === "batch-done") {
      setToastOpen(true);
    }
    prevStage.current = stage;
  }, [stage]);

  return (
    <div style={{ maxWidth: 760 }}>
      <Toast message="Your ads are ready" subtext="Download them, then paste into Ads Manager." open={toastOpen} onDone={closeToast} />
      <Stepper stage={stage} />

      {stage === "empty" && (
        <div className="stage active">
          <div className="stage-head">
            <div className="left">
              <span className="num">1</span>
              <div>
                <div className="title">Start from your concept board</div>
                <div className="sub">Pick a brand and choose concepts on your board — they'll land here ready for assets.</div>
              </div>
            </div>
          </div>
          <div className="stage-body">
            <Link href="/" className="btn primary">Go to your boards</Link>
          </div>
        </div>
      )}

      {stage === "pick-assets" && (
        <PickAssets state={state} dispatch={dispatch} onGenerate={runBatch} usage={usage} />
      )}

      {(stage === "batch-running" || stage === "batch-done") && (
        <BatchResults state={state} dispatch={dispatch} />
      )}

      {stage === "error" && state.errorCode === "RATE_LIMITED" && (
        <div className="stage">
          <div className="stage-body">
            <span className="badge" style={{ marginBottom: "var(--space-3)" }}>Daily limit reached</span>
            <p style={{ margin: "0 0 var(--space-4)" }}>{state.error}</p>
            <button className="btn" onClick={() => dispatch({ type: "RETRY" })}>Back</button>
          </div>
        </div>
      )}

      {stage === "error" && state.errorCode !== "RATE_LIMITED" && (
        <div className="stage">
          <div className="stage-body">
            <span className="badge error" style={{ marginBottom: "var(--space-3)" }}>Error</span>
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{state.error}</p>
            <button className="btn" onClick={() => dispatch({ type: "RETRY" })}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One shared reference + logo (+ optional product), legacy single-reference flow. The shared
 *  set is stored at assets[0] and applied to every selected concept when the batch runs. */
function SharedAssetCard({ assets, concepts, dispatch }: {
  assets: ConceptAssets;
  concepts: Concept[];
  dispatch: Dispatch<Action>;
}) {
  const variant = assets.product ? "with_asset" : "no_asset";
  const [library, setLibrary] = useState<ReferenceAd[]>([]);
  const [libError, setLibError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getReferenceAds(variant)
      .then((ads) => { if (active) { setLibrary(ads); setLibError(null); } })
      .catch(() => { if (active) { setLibrary([]); setLibError("Could not load the library — upload your own above."); } });
    return () => { active = false; };
  }, [variant]);

  async function pickFromLibrary(ad: ReferenceAd) {
    if (loadingId) return;
    setLoadingId(ad.id);
    try {
      const dataUrl = await urlToDataUrl(ad.url);
      dispatch({ type: "SET_ASSET", index: 0, slot: "ref", dataUrl });
      setLibError(null);
    } catch {
      setLibError("Couldn't use that reference — try another or upload your own above.");
    } finally {
      setLoadingId(null);
    }
  }

  const libHint = variant === "no_asset"
    ? "These don't use a product image. Add a product asset below and a different library, built around your product, will appear here."
    : "Showing references designed to feature your product asset.";

  return (
    <div className="concept-assets">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: 13, color: "var(--fg-3)" }}>
          Making {concepts.length === 1 ? "1 ad" : `${concepts.length} ads`}:
        </span>
        {concepts.map((c, i) => <span key={i} className="badge">{c.headline}</span>)}
      </div>
      <Dropzone label="Reference ad" required hint="Any static ad you like — we read its shape, never its colors or copy. PNG or JPG." value={assets.ref ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", index: 0, slot: "ref", dataUrl: d })} />
      <div className="ref-lib">
        <div className="ref-lib-header">
          <span className="ref-lib-eyebrow">Or browse our references</span>
        </div>
        <p className="ref-lib-hint">{libHint}</p>
        {libError && <p className="ref-lib-hint ref-lib-hint--error">{libError}</p>}
        {library.length > 0 && (
          <div className="ref-lib-grid">
            {library.map((ad) => (
              <button
                key={ad.id}
                type="button"
                className={`ref-lib-thumb${loadingId === ad.id ? " is-loading" : ""}`}
                aria-label={ad.label ?? "Reference ad"}
                onClick={() => pickFromLibrary(ad)}
                disabled={loadingId !== null}
              >
                <img src={ad.url} alt={ad.label ?? "Reference ad"} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      <Dropzone label="Brand logo" required height={96} hint="PNG with a transparent background works best." value={assets.logo ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", index: 0, slot: "logo", dataUrl: d })} />
      <Dropzone label="Product screenshot (optional)" hint="Your real UI/product, so the ad shows it exactly — not an invented screen." value={assets.product ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", index: 0, slot: "product", dataUrl: d })} />
    </div>
  );
}

function PickAssets({ state, dispatch, onGenerate, usage }: { state: WorkbenchState; dispatch: Dispatch<Action>; onGenerate: () => void; usage: UsageInfo | null }) {
  const concepts = state.selectedConcepts;
  const shared = state.assets[0] ?? {};
  const ready = Boolean(shared.ref && shared.logo);
  const capped = usage !== null && !usage.unlimited && usage.remaining <= 0;

  return (
    <div className="stack">
      <div className="stage active">
        <div className="stage-head">
          <div className="left">
            <span className="num">1</span>
            <div>
              <div className="title">Drop your reference</div>
              <div className="sub">Any static ad you like — we read its shape, never its colors or copy. Those come from your brand.</div>
            </div>
          </div>
        </div>
        <div className="stage-body stack">
          <SharedAssetCard assets={shared} concepts={concepts} dispatch={dispatch} />
          <div className="actions-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "var(--space-2)" }}>
            {usage !== null && !usage.unlimited && (
              capped
                ? <span className="badge">Daily limit reached</span>
                : <span style={{ fontSize: 13, color: "var(--fg-3)" }}>{usage.remaining} of {usage.limit} creatives left today</span>
            )}
            <button className="btn primary" disabled={!ready || capped} onClick={onGenerate}>
              {concepts.length === 1 ? "Make my ad" : `Make my ${concepts.length} ads`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchResults({ state, dispatch }: { state: WorkbenchState; dispatch: Dispatch<Action> }) {
  const items = state.batchItems;
  const done = state.stage === "batch-done";
  return (
    <div className="stage active">
      <div className="stage-head">
        <div className="left">
          <span className="num">{done ? "✓" : "2"}</span>
          <div>
            <div className="title">{done ? "Your ads are ready" : "Generating your ads…"}</div>
            <div className="sub">{done ? "Download them, or start over." : "Each concept renders independently."}</div>
          </div>
        </div>
      </div>
      <div className="stage-body">
        <div className="batch-grid">
          {items.map((it) => (
            <div key={it.id} className="batch-tile">
              <div className="batch-tile-label">{it.ideaName ?? `Idea ${it.ideaNumber ?? ""}`}</div>
              {it.status === "done" && it.imageUrl && (
                <>
                  <img src={it.imageUrl} alt={it.ideaName ?? "Generated ad"} />
                  <a href={it.imageUrl} download className="btn primary sm"><IconDownload className="ico" width={14} height={14} /> Download</a>
                </>
              )}
              {(it.status === "queued" || it.status === "running") && <div className="status-row"><span className="spinner" /> {it.status === "running" ? "Rendering…" : "Queued"}</div>}
              {it.status === "error" && <div className="batch-error">{it.error ?? "Failed"}</div>}
            </div>
          ))}
        </div>
        {done && (
          <div className="actions-row" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn" onClick={() => dispatch({ type: "RESET" })}>Start over</button>
          </div>
        )}
      </div>
    </div>
  );
}
