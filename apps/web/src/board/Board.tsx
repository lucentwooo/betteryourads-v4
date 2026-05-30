"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STAGE_ORDER,
  STAGE_META,
  GOAL_LABEL,
  GOAL_FOCUS,
  type ConceptBoard,
  type Goal,
  type AwarenessStage,
  type BrandExtraction,
} from "@bya/shared";
import { api, ApiError, type UsageInfo } from "../api/client";
import { Dropzone } from "../workbench/Dropzone";

type ViewState =
  | { phase: "loading" }
  | { phase: "goalPicker" }
  | { phase: "generating"; goal: Goal }
  | { phase: "board"; board: ConceptBoard }
  | { phase: "error"; message: string };

export default function Board({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ phase: "loading" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<AwarenessStage>>(new Set());
  const [extraction, setExtraction] = useState<BrandExtraction | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    api.getConceptBoard(brandId).then(
      ({ board }) => {
        setView({ phase: "board", board });
      },
      (err) => {
        if (err instanceof ApiError && err.status === 404) {
          setView({ phase: "goalPicker" });
        } else {
          setView({ phase: "error", message: err instanceof Error ? err.message : "Failed to load." });
        }
      },
    );
    api.getBrand(brandId).then((detail) => {
      setLogoUrl(detail.logoUrl ?? null);
      setExtraction(detail.brandExtraction ?? null);
    }).catch(() => {});
    api.getUsage().then(setUsage).catch(() => {});
  }, [brandId]);

  async function handleLogoPick(dataUrl: string) {
    setLogoSaving(true);
    setLogoError(null);
    try {
      const { url } = await api.saveBrandLogo(brandId, dataUrl);
      setLogoUrl(url);
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : "Failed to save logo.");
    } finally {
      setLogoSaving(false);
    }
  }

  function pickGoal(goal: Goal) {
    setView({ phase: "generating", goal });
    api.generateConceptBoard(brandId, goal).then(
      ({ board }) => {
        setSelected(new Set());
        setExpanded(new Set());
        setView({ phase: "board", board });
      },
      (err) => {
        setView({ phase: "error", message: err instanceof Error ? err.message : "Failed to generate." });
      },
    );
  }

  function regenerate(board: ConceptBoard) {
    setView({ phase: "generating", goal: board.goal });
    api.generateConceptBoard(brandId, board.goal).then(
      ({ board: next }) => {
        setSelected(new Set());
        setExpanded(new Set());
        setView({ phase: "board", board: next });
      },
      (err) => {
        setView({ phase: "error", message: err instanceof Error ? err.message : "Failed to regenerate." });
      },
    );
  }

  function toggleConcept(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleExpand(stage: AwarenessStage) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

  function goNext(board: ConceptBoard) {
    const concepts = Array.from(selected).map((i) => board.concepts[i]).filter(Boolean);
    if (!concepts.length) return;
    sessionStorage.setItem("bya_selected_brand", brandId);
    sessionStorage.setItem("bya_selected_concepts", JSON.stringify(concepts));
    router.push("/create");
  }

  // --- Loading ---
  if (view.phase === "loading") {
    return (
      <div className="canvas stack">
        <div className="status-row">
          <span className="spinner" /> your strategist is drafting concepts…
        </div>
      </div>
    );
  }

  // --- Error ---
  if (view.phase === "error") {
    return (
      <div className="canvas stack">
        <div className="stage">
          <div className="stage-body">
            <p style={{ color: "var(--bya-oxblood)", margin: "0 0 var(--space-4)" }}>{view.message}</p>
            <button
              className="btn"
              onClick={() => {
                setView({ phase: "loading" });
                api.getConceptBoard(brandId).then(
                  ({ board }) => setView({ phase: "board", board }),
                  (err) => {
                    if (err instanceof ApiError && err.status === 404) setView({ phase: "goalPicker" });
                    else setView({ phase: "error", message: err instanceof Error ? err.message : "Failed." });
                  },
                );
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Goal picker ---
  if (view.phase === "goalPicker") {
    return (
      <div className="canvas stack">
        <div style={{ marginBottom: 32, maxWidth: 640 }}>
          <h1 style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 10px" }}>
            What's your goal right now?
          </h1>
          <p style={{ fontSize: 16, color: "var(--fg-2)", margin: 0 }}>
            Pick one and we'll focus your concept board on the right awareness stages.
          </p>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(["waitlist", "trials", "paid"] as Goal[]).map((goal) => (
            <button
              key={goal}
              className="btn"
              style={{ fontSize: 16, padding: "18px 28px", flex: "1 1 180px", justifyContent: "center" }}
              onClick={() => pickGoal(goal)}
            >
              {GOAL_LABEL[goal]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Generating spinner ---
  if (view.phase === "generating") {
    return (
      <div className="canvas stack">
        <div className="status-row">
          <span className="spinner" /> your strategist is drafting concepts…
        </div>
      </div>
    );
  }

  // --- Board ---
  const { board } = view;
  const focus = GOAL_FOCUS[board.goal];

  // Group by stage
  const byStage: Record<AwarenessStage, number[]> = {
    unaware: [], problem: [], solution: [], product: [], most: [],
  };
  board.concepts.forEach((c, i) => {
    (byStage[c.stage] ?? byStage["solution"]).push(i);
  });

  const stagesWithConcepts = STAGE_ORDER.filter((s) => byStage[s].length > 0);
  const n = selected.size;

  const goalIntro: Record<Goal, string> = {
    waitlist: "People who feel the pain and want in early. Catch them before they shop around.",
    trials: "They're comparing options. Show, concretely, why yours wins.",
    paid: "They already know you. Remove the last reason not to buy.",
  };

  const capped = usage !== null && !usage.unlimited && usage.remaining <= 0;

  return (
    <div className="canvas stack" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ marginBottom: 36, maxWidth: 640 }}>
        <h1 style={{ fontSize: 42, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.05, margin: "0 0 10px" }}>
          What should we make this week?
        </h1>
        <p style={{ fontSize: 17, color: "var(--fg-2)", margin: 0, lineHeight: 1.5 }}>
          {goalIntro[board.goal]}
        </p>
      </div>

      {/* Usage */}
      {usage !== null && (
        <div style={{ marginBottom: 16, fontSize: 13, color: capped ? "var(--bya-oxblood)" : "var(--fg-3)" }}>
          {capped && !usage.unlimited
            ? <span className="badge">Daily limit reached</span>
            : !usage.unlimited
              ? <span>{usage.remaining} of {usage.limit} creatives left today</span>
              : null}
        </div>
      )}

      {/* Brand logo */}
      <div style={{ marginBottom: 32, maxWidth: 300 }}>
        <Dropzone
          label="Brand logo"
          value={logoUrl}
          onPick={handleLogoPick}
          height={96}
        />
        {logoSaving && <p style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>Saving…</p>}
        {logoError && <p style={{ fontSize: 12, color: "var(--bya-oxblood)", marginTop: 4 }}>{logoError}</p>}
      </div>

      {/* Brand-DNA strip (legacy parity) */}
      <BrandDnaStrip extraction={extraction} />

      {/* Focus strip */}
      <div style={{ marginBottom: 40, fontSize: 14, color: "var(--fg-3)", display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center" }}>
        {STAGE_ORDER.map((s, idx) => {
          const on = focus.includes(s);
          return (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 18 }}>
              {idx > 0 && <span style={{ opacity: 0.3 }}>·</span>}
              <span
                style={
                  on
                    ? { color: "var(--fg)", borderBottom: "2px solid var(--accent)", paddingBottom: 2, fontWeight: 600 }
                    : { opacity: 0.6 }
                }
              >
                {STAGE_META[s].name}
              </span>
            </span>
          );
        })}
      </div>

      {/* Empty state */}
      {board.concepts.length === 0 && (
        <div style={{ border: "1px dashed var(--fg)", borderRadius: 8, padding: 32, color: "var(--fg-3)" }}>
          Couldn't draft concepts. Tap ↻ regenerate to try again.
        </div>
      )}

      {/* Concept sections */}
      {stagesWithConcepts.map((stage) => {
        const isFocus = focus.includes(stage);
        const indices = byStage[stage];
        const isExpanded = isFocus || expanded.has(stage);

        return (
          <section key={stage} style={{ marginBottom: isFocus ? 40 : 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 6px" }}>
              <h3 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", margin: 0 }}>
                {STAGE_META[stage].name}
              </h3>
              {isFocus && (
                <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>your focus</span>
              )}
            </div>
            <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "0 0 14px" }}>
              {STAGE_META[stage].blurb}
            </p>

            {!isExpanded && (
              <button
                style={{ background: "none", border: 0, color: "var(--accent)", cursor: "pointer", fontSize: 13, padding: 0 }}
                onClick={() => toggleExpand(stage)}
              >
                Show {indices.length} more →
              </button>
            )}

            {isExpanded && indices.map((i) => {
              const c = board.concepts[i];
              const on = selected.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggleConcept(i)}
                  style={{
                    display: "flex", gap: 14, alignItems: "flex-start",
                    width: "100%", textAlign: "left", background: "none", border: 0,
                    borderTop: "1px solid var(--border-hairline)", padding: "16px 2px",
                    cursor: "pointer", fontFamily: "var(--font-sans)",
                  }}
                >
                  <span
                    style={{
                      width: 20, height: 20, borderRadius: 4,
                      border: `1.5px solid ${on ? "var(--accent)" : "var(--fg-3)"}`,
                      background: on ? "var(--accent)" : "transparent",
                      display: "grid", placeItems: "center",
                      flexShrink: 0, marginTop: 2,
                    }}
                  >
                    {on && (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2.5 6.5L5.5 9.5L10.5 4" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 16, color: "var(--fg)", lineHeight: 1.35 }}>{c.headline}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--fg-3)", marginTop: 4 }}>
                      {c.angle}{c.rationale ? ` · ${c.rationale}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}

      {/* Footer */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 232, right: 0,
          padding: "16px 40px", borderTop: "1px solid var(--fg)",
          background: "var(--bg)", display: "flex",
          justifyContent: "space-between", alignItems: "center", zIndex: 10,
        }}
      >
        <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
          {n} concept{n === 1 ? "" : "s"} selected
        </span>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => regenerate(board)}>↻ Regenerate</button>
          <button className="btn primary" disabled={n === 0} onClick={() => goNext(board)}>
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pick the first valid hex from a value that may be a string, array, or nested. */
function pickHex(v: unknown): string | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = pickHex(item);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === "string") {
    const cleaned = v.replace(/^#+/, "");
    if (/^[0-9a-f]{3,8}$/i.test(cleaned)) return "#" + cleaned;
  }
  return null;
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Brand-DNA strip: brand name, color-role swatches, fonts, vibe — ported from legacy brandDnaHTML.
 *  Renders nothing when there's no usable brand data. */
function BrandDnaStrip({ extraction }: { extraction: BrandExtraction | null }) {
  if (!extraction) return null;
  const raw = extraction as Record<string, unknown>;
  const id = obj(raw.brand_identity);
  const vbs = obj(raw.visual_brand_system);
  const brandName = typeof id.brand_name === "string" ? id.brand_name : typeof id.name === "string" ? id.name : "";
  const pal = Object.keys(obj(vbs.color_palette)).length ? obj(vbs.color_palette) : obj(vbs.colors);
  const swatches = [
    { role: "background", val: pickHex(pal.background) },
    { role: "text", val: pickHex(pal.text) ?? pickHex(pal.foreground) },
    { role: "primary", val: pickHex(pal.primary) },
    { role: "accent", val: pickHex(pal.accent) },
    { role: "cta", val: pickHex(pal.cta) },
    { role: "secondary", val: pickHex(pal.secondary) },
  ].filter((s): s is { role: string; val: string } => Boolean(s.val));
  const typography = obj(vbs.typography);
  const fonts = Array.isArray(typography.font_families) ? (typography.font_families as unknown[]).filter((f): f is string => typeof f === "string") : [];
  const mood = typeof obj(vbs.ui_style).overall_mood === "string" ? (obj(vbs.ui_style).overall_mood as string) : "";

  if (!swatches.length && !brandName) return null;

  return (
    <div style={{ marginBottom: 28, padding: 16, border: "1px solid var(--border-hairline)", borderRadius: 8, maxWidth: 640 }}>
      {brandName && <div style={{ fontSize: 15, fontWeight: 600, marginBottom: swatches.length ? 12 : 0 }}>{brandName}</div>}
      {swatches.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: fonts.length || mood ? 12 : 0 }}>
          {swatches.map((s) => (
            <div key={s.role} style={{ textAlign: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 6, background: s.val, border: "1px solid var(--border-hairline)" }} />
              <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 4 }}>{s.role}</div>
              <div style={{ fontSize: 11, color: "var(--fg-2)" }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}
      {(fonts.length > 0 || mood) && (
        <div style={{ fontSize: 13, color: "var(--fg-2)" }}>
          {fonts.length > 0 && <span><strong>fonts</strong> {fonts.join(" / ")}</span>}
          {mood && <span style={{ marginLeft: fonts.length ? 14 : 0 }}><strong>vibe</strong> {mood}</span>}
        </div>
      )}
    </div>
  );
}
