import { describe, it, expect } from "vitest";
import { reducer, initialState, type WorkbenchState } from "./state";

const at = (over: Partial<WorkbenchState>): WorkbenchState => ({ ...initialState, ...over });

describe("workbench reducer", () => {
  it("START moves idle → analyzing and records the url", () => {
    const s = reducer(initialState, { type: "START", url: "https://acme.com" });
    expect(s.stage).toBe("analyzing");
    expect(s.url).toBe("https://acme.com");
    expect(s.error).toBeNull();
  });

  it("ANALYZED moves analyzing → pick-ref with data", () => {
    const msd = { title: "Acme" } as never;
    const be = { brand_identity: { brand_name: "Acme" } } as never;
    const s = reducer(at({ stage: "analyzing" }), { type: "ANALYZED", measuredSiteData: msd, brandExtraction: be });
    expect(s.stage).toBe("pick-ref");
    expect(s.measuredSiteData).toBe(msd);
    expect(s.brandExtraction).toBe(be);
  });

  it("SET_REF / SET_LOGO / SET_PRODUCT store data urls in pick-ref", () => {
    let s = at({ stage: "pick-ref" });
    s = reducer(s, { type: "SET_REF", dataUrl: "data:ref" });
    s = reducer(s, { type: "SET_LOGO", dataUrl: "data:logo" });
    s = reducer(s, { type: "SET_PRODUCT", dataUrl: "data:prod" });
    expect(s.refImage).toBe("data:ref");
    expect(s.logoImage).toBe("data:logo");
    expect(s.productAsset).toBe("data:prod");
    expect(s.stage).toBe("pick-ref");
  });

  it("GENERATE moves pick-ref → generating", () => {
    const s = reducer(at({ stage: "pick-ref", refImage: "r", logoImage: "l" }), { type: "GENERATE" });
    expect(s.stage).toBe("generating");
  });

  it("GENERATED moves generating → ready with the image", () => {
    const ap = { ad_prompt: {} } as never;
    const s = reducer(at({ stage: "generating" }), { type: "GENERATED", adPrompt: ap, imageUrl: "https://img" });
    expect(s.stage).toBe("ready");
    expect(s.imageUrl).toBe("https://img");
    expect(s.adPrompt).toBe(ap);
  });

  it("FAILED moves to error and stores the message", () => {
    const s = reducer(at({ stage: "analyzing" }), { type: "FAILED", message: "boom" });
    expect(s.stage).toBe("error");
    expect(s.error).toBe("boom");
  });

  it("RESET returns to initialState", () => {
    const s = reducer(at({ stage: "ready", imageUrl: "x", url: "y" }), { type: "RESET" });
    expect(s).toEqual(initialState);
  });
});
