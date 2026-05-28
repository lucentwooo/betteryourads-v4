import { useReducer, useState, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { useSearchParams } from "react-router-dom";
import { MeasuredSiteData } from "@bya/shared";
import { reducer, initialState, type Stage, type WorkbenchState, type Action } from "./state";
import { Dropzone } from "./Dropzone";
import { api, ApiError, type UsageInfo } from "../api/client";
import { IconDownload } from "../ui/icons";

function failure(e: unknown): { message: string; code?: string } {
  return e instanceof ApiError ? { message: e.message, code: e.code } : { message: "Something went wrong." };
}

const STEP_LABELS = ["Analyze brand", "Pick concepts", "Add assets", "Generate"] as const;

function stepStates(stage: Stage): ("done" | "active" | "")[] {
  switch (stage) {
    case "idle":
    case "analyzing":
      return ["active", "", "", ""];
    case "concepts-loading":
    case "pick-concepts":
      return ["done", "active", "", ""];
    case "pick-assets":
      return ["done", "done", "active", ""];
    case "batch-running":
      return ["done", "done", "done", "active"];
    case "batch-done":
      return ["done", "done", "done", "done"];
    default:
      return ["", "", "", ""];
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

function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function remaining(usage: UsageInfo | null): number {
  if (!usage || usage.unlimited) return Infinity;
  return Math.max(0, usage.remaining);
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

  useEffect(() => {
    if (state.stage !== "concepts-loading" || !state.brandExtraction || !state.brandExtractionId) return;
    let active = true;
    api.concepts({ brandExtraction: state.brandExtraction, brandExtractionId: state.brandExtractionId })
      .then((r) => { if (active) dispatch({ type: "CONCEPTS_READY", conceptSet: r.conceptSet }); })
      .catch((e) => { if (active) dispatch({ type: "FAILED", ...failure(e) }); });
    return () => { active = false; };
  }, [state.stage, state.brandExtraction, state.brandExtractionId]);

  async function runBatch() {
    if (!state.brandExtraction || !state.brandExtractionId || !state.conceptSet) return;
    const items = state.selectedIdeaNumbers.map((n) => {
      const idea = state.conceptSet!.ad_ideas.find((x, i) => (x.idea_number ?? i + 1) === n)!;
      const a = state.assets[n] ?? {};
      return { concept: idea, referenceAdImage: a.ref!, logoImage: a.logo!, productAsset: a.product };
    });
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
            <button className="btn primary" disabled={!urlInput.trim()} onClick={() => runAnalyze(urlInput.trim())}>
              Analyze brand
            </button>
          </div>
        </div>
      )}

      {stage === "analyzing" && (
        <div className="stage active">
          <div className="stage-body">
            <div className="status-row"><span className="spinner" /> Reading {hostnameOf(state.url)}…</div>
          </div>
        </div>
      )}

      {stage === "concepts-loading" && (
        <div className="stage active">
          <div className="stage-body">
            <div className="status-row"><span className="spinner" /> Generating ad concepts…</div>
          </div>
        </div>
      )}

      {stage === "pick-concepts" && state.conceptSet && (
        <PickConcepts state={state} dispatch={dispatch} usage={usage} />
      )}

      {stage === "pick-assets" && state.conceptSet && (
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

function PickConcepts({ state, dispatch, usage }: { state: WorkbenchState; dispatch: Dispatch<Action>; usage: UsageInfo | null }) {
  const ideas = state.conceptSet!.ad_ideas;
  const recommended = new Set((state.conceptSet!.recommended_top_3 ?? []).map((r) => Number(r.idea_number)).filter((n) => !Number.isNaN(n)));
  const cap = remaining(usage);
  const selected = state.selectedIdeaNumbers;

  return (
    <div className="stack">
      <div className="stage active">
        <div className="stage-head">
          <div className="left">
            <span className="num">2</span>
            <div>
              <div className="title">Pick your concepts</div>
              <div className="sub">Choose one or more angles to generate. Each becomes its own ad.</div>
            </div>
          </div>
        </div>
        <div className="stage-body">
          <div className="concept-grid">
            {ideas.map((idea, i) => {
              const n = idea.idea_number ?? i + 1;
              const isSel = selected.includes(n);
              const atCap = !isSel && selected.length >= cap;
              return (
                <button
                  key={n}
                  type="button"
                  className={`concept-card${isSel ? " selected" : ""}`}
                  disabled={atCap}
                  onClick={() => dispatch({ type: "TOGGLE_CONCEPT", ideaNumber: n })}
                >
                  <div className="concept-card-top">
                    <span className="badge">{idea.awareness_level ?? `Idea ${n}`}</span>
                    {recommended.has(n) && <span className="badge rec">Recommended</span>}
                    <span className={`tick${isSel ? " on" : ""}`}>{isSel ? "✓" : ""}</span>
                  </div>
                  <div className="concept-name">{idea.idea_name}</div>
                  <div className="concept-hook">{idea.main_hook}</div>
                  {idea.why_this_could_work && <div className="concept-why">{idea.why_this_could_work}</div>}
                  <div className="concept-cta">CTA: {idea.cta}</div>
                </button>
              );
            })}
          </div>
          <div className="actions-row" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn primary" disabled={selected.length === 0} onClick={() => dispatch({ type: "PROCEED_ASSETS" })}>
              Add assets ({selected.length})
            </button>
          </div>
          {usage && !usage.unlimited && (
            <span className="hint">{usage.remaining} of {usage.limit} creatives left today.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PickAssets({ state, dispatch, onGenerate, usage }: { state: WorkbenchState; dispatch: Dispatch<Action>; onGenerate: () => void; usage: UsageInfo | null }) {
  // Carry the canonical selected number `n` alongside each idea so the asset key matches
  // what runBatch looks up — re-deriving n from this filtered list's index would diverge
  // when idea_number is absent and the selection is non-contiguous.
  const selected = state.selectedIdeaNumbers.flatMap((n) => {
    const idea = state.conceptSet!.ad_ideas.find((x, i) => (x.idea_number ?? i + 1) === n);
    return idea ? [{ n, idea }] : [];
  });
  const ready = state.selectedIdeaNumbers.every((n) => {
    const a = state.assets[n];
    return Boolean(a?.ref && a?.logo);
  });
  const capped = usage !== null && !usage.unlimited && usage.remaining <= 0;

  return (
    <div className="stack">
      <div className="stage active">
        <div className="stage-head">
          <div className="left">
            <span className="num">3</span>
            <div>
              <div className="title">Add assets per concept</div>
              <div className="sub">Each concept needs a reference ad and a logo. Product image is optional.</div>
            </div>
          </div>
        </div>
        <div className="stage-body stack">
          {selected.map(({ n, idea }) => {
            const a = state.assets[n] ?? {};
            return (
              <div key={n} className="concept-assets">
                <div className="concept-assets-head">
                  <span className="badge">{idea.awareness_level ?? `Idea ${n}`}</span>
                  <span className="concept-name">{idea.idea_name}</span>
                  {state.selectedIdeaNumbers.length > 1 && (a.ref || a.logo) && (
                    <button className="btn ghost sm" onClick={() => dispatch({ type: "COPY_ASSETS_TO_ALL", ideaNumber: n })}>
                      Copy to all
                    </button>
                  )}
                </div>
                <Dropzone label="Reference ad" required value={a.ref ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", ideaNumber: n, slot: "ref", dataUrl: d })} />
                <Dropzone label="Logo" required height={96} value={a.logo ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", ideaNumber: n, slot: "logo", dataUrl: d })} />
                <Dropzone label="Product image (optional)" value={a.product ?? null} onPick={(d) => dispatch({ type: "SET_ASSET", ideaNumber: n, slot: "product", dataUrl: d })} />
              </div>
            );
          })}
          <div className="actions-row">
            <button className="btn" onClick={() => dispatch({ type: "BACK_TO_CONCEPTS" })}>Back</button>
            <button className="btn primary" disabled={!ready || capped} onClick={onGenerate}>
              Make my ads ({state.selectedIdeaNumbers.length})
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
          <span className="num">{done ? "✓" : "4"}</span>
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
