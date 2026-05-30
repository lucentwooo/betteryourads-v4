import { describe, it, expect } from "vitest";
import type { Concept } from "@bya/shared";
import { reducer, initialState, type WorkbenchState } from "./state";

const at = (over: Partial<WorkbenchState>): WorkbenchState => ({ ...initialState, ...over });

const concept = (n: number): Concept => ({
  angle: `Angle${n}`, stage: "solution", headline: `Headline ${n}`, rationale: "",
});

describe("workbench reducer", () => {
  it("PRESET jumps to pick-assets with the brand and concepts", () => {
    const be = { brand_identity: {} } as never;
    const s = reducer(initialState, {
      type: "PRESET", brandExtraction: be, brandExtractionId: "be1", measuredSiteData: null, concepts: [concept(1), concept(2)],
    });
    expect(s.stage).toBe("pick-assets");
    expect(s.brandExtractionId).toBe("be1");
    expect(s.selectedConcepts).toHaveLength(2);
  });

  it("SET_ASSET stores a per-concept asset keyed by index", () => {
    const s = reducer(at({ stage: "pick-assets" }), { type: "SET_ASSET", index: 0, slot: "ref", dataUrl: "data:x" });
    expect(s.assets[0]?.ref).toBe("data:x");
  });

  it("COPY_ASSETS_TO_ALL copies one concept's assets to all selected", () => {
    const base = at({ stage: "pick-assets", selectedConcepts: [concept(1), concept(2)], assets: { 0: { ref: "r", logo: "l" } } });
    const s = reducer(base, { type: "COPY_ASSETS_TO_ALL", index: 0 });
    expect(s.assets[1]).toEqual({ ref: "r", logo: "l" });
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
    const s = reducer(at({ stage: "pick-assets" }), { type: "FAILED", message: "boom" });
    expect(s.stage).toBe("error");
    expect(s.error).toBe("boom");
  });

  it("RETRY returns to pick-assets when concepts were loaded", () => {
    const s = reducer(at({ stage: "error", error: "x", selectedConcepts: [concept(1)] }), { type: "RETRY" });
    expect(s.stage).toBe("pick-assets");
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
