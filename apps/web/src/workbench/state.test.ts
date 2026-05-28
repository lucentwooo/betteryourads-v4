import { describe, it, expect } from "vitest";
import { reducer, initialState, type WorkbenchState } from "./state";

const at = (over: Partial<WorkbenchState>): WorkbenchState => ({ ...initialState, ...over });

const idea = (n: number) => ({
  idea_number: n, idea_name: `I${n}`, main_hook: "h", cta: "c", core_angle: "",
  customer_context: "", customer_pain_or_desire: "", customer_insight: "", belief_to_shift: "",
  supporting_message: "", why_this_could_work: "", proof_or_reason_to_believe: "",
  safe_claims_used: [], claims_to_avoid: [], visual_direction_for_later: "", brand_dna_fields_used: [],
});
const conceptSet = { ad_ideas: [idea(1), idea(2)], recommended_top_3: [] } as never;

describe("workbench reducer", () => {
  it("START moves idle → analyzing and records the url", () => {
    const s = reducer(initialState, { type: "START", url: "https://acme.com" });
    expect(s.stage).toBe("analyzing");
    expect(s.url).toBe("https://acme.com");
  });

  it("ANALYZED moves analyzing → concepts-loading with data", () => {
    const msd = { title: "Acme" } as never;
    const be = { brand_identity: {} } as never;
    const s = reducer(at({ stage: "analyzing" }), { type: "ANALYZED", measuredSiteData: msd, brandExtraction: be, brandExtractionId: "be1" });
    expect(s.stage).toBe("concepts-loading");
    expect(s.brandExtraction).toBe(be);
    expect(s.brandExtractionId).toBe("be1");
  });

  it("PRESET_BRAND jumps to concepts-loading", () => {
    const be = { brand_identity: {} } as never;
    const s = reducer(initialState, { type: "PRESET_BRAND", brandExtraction: be, brandExtractionId: "be1", measuredSiteData: null, url: "https://acme.com" });
    expect(s.stage).toBe("concepts-loading");
    expect(s.brandExtractionId).toBe("be1");
  });

  it("CONCEPTS_READY moves to pick-concepts and stores the set", () => {
    const s = reducer(at({ stage: "concepts-loading" }), { type: "CONCEPTS_READY", conceptSet });
    expect(s.stage).toBe("pick-concepts");
    expect(s.conceptSet?.ad_ideas).toHaveLength(2);
  });

  it("TOGGLE_CONCEPT adds then removes an idea number", () => {
    let s = reducer(at({ stage: "pick-concepts", conceptSet }), { type: "TOGGLE_CONCEPT", ideaNumber: 1 });
    expect(s.selectedIdeaNumbers).toEqual([1]);
    s = reducer(s, { type: "TOGGLE_CONCEPT", ideaNumber: 1 });
    expect(s.selectedIdeaNumbers).toEqual([]);
  });

  it("PROCEED_ASSETS and BACK_TO_CONCEPTS switch stages", () => {
    let s = reducer(at({ stage: "pick-concepts", conceptSet, selectedIdeaNumbers: [1] }), { type: "PROCEED_ASSETS" });
    expect(s.stage).toBe("pick-assets");
    s = reducer(s, { type: "BACK_TO_CONCEPTS" });
    expect(s.stage).toBe("pick-concepts");
  });

  it("SET_ASSET stores a per-concept asset", () => {
    const s = reducer(at({ stage: "pick-assets" }), { type: "SET_ASSET", ideaNumber: 1, slot: "ref", dataUrl: "data:x" });
    expect(s.assets[1]?.ref).toBe("data:x");
  });

  it("COPY_ASSETS_TO_ALL copies one concept's assets to all selected", () => {
    const base = at({ stage: "pick-assets", selectedIdeaNumbers: [1, 2], assets: { 1: { ref: "r", logo: "l" } } });
    const s = reducer(base, { type: "COPY_ASSETS_TO_ALL", ideaNumber: 1 });
    expect(s.assets[2]).toEqual({ ref: "r", logo: "l" });
  });

  it("BATCH_STARTED stores batchId and moves to batch-running", () => {
    const s = reducer(at({ stage: "pick-assets" }), { type: "BATCH_STARTED", batchId: "b1" });
    expect(s.stage).toBe("batch-running");
    expect(s.batchId).toBe("b1");
  });

  it("BATCH_UPDATED stores items without changing stage", () => {
    const items = [{ id: "i1", ideaNumber: 1, ideaName: "I1", status: "running", imageUrl: null, error: null }] as never;
    const s = reducer(at({ stage: "batch-running", batchId: "b1" }), { type: "BATCH_UPDATED", items });
    expect(s.stage).toBe("batch-running");
    expect(s.batchItems).toHaveLength(1);
  });

  it("BATCH_DONE moves to batch-done with items", () => {
    const items = [{ id: "i1", ideaNumber: 1, ideaName: "I1", status: "done", imageUrl: "u", error: null }] as never;
    const s = reducer(at({ stage: "batch-running" }), { type: "BATCH_DONE", items });
    expect(s.stage).toBe("batch-done");
    expect(s.batchItems).toHaveLength(1);
  });

  it("FAILED moves to error and stores the message", () => {
    const s = reducer(at({ stage: "concepts-loading" }), { type: "FAILED", message: "boom" });
    expect(s.stage).toBe("error");
    expect(s.error).toBe("boom");
  });

  it("RETRY returns to pick-concepts when concepts were loaded", () => {
    const s = reducer(at({ stage: "error", error: "x", conceptSet }), { type: "RETRY" });
    expect(s.stage).toBe("pick-concepts");
    expect(s.error).toBeNull();
  });

  it("RETRY does a full reset when no concepts were loaded", () => {
    const s = reducer(at({ stage: "error", error: "x" }), { type: "RETRY" });
    expect(s).toEqual(initialState);
  });

  it("RESET returns to initialState", () => {
    const s = reducer(at({ stage: "batch-done" }), { type: "RESET" });
    expect(s).toEqual(initialState);
  });
});
