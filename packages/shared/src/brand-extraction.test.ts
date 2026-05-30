import { describe, it, expect } from "vitest";
import { BrandExtraction, ExternalVoc } from "./brand-extraction.js";

describe("ExternalVoc", () => {
  it("accepts the legacy VOC shape", () => {
    const voc = {
      top_complaints: ["slow onboarding"],
      recurring_phrases: ["set it up in minutes"],
      desired_outcomes: ["save time"],
      objections: ["too expensive"],
      switching_triggers: ["outgrew spreadsheets"],
      competitor_gripes: ["X is clunky"],
      sources: ["reddit.com/r/saas"],
    };
    expect(ExternalVoc.safeParse(voc).success).toBe(true);
  });

  it("coerces a single narrative string into a one-element array", () => {
    const parsed = ExternalVoc.safeParse({ top_complaints: "everything is slow" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.top_complaints).toEqual(["everything is slow"]);
  });

  it("BrandExtraction carries external_voc through", () => {
    const parsed = BrandExtraction.safeParse({
      brand_identity: { brand_name: "Chirp" },
      external_voc: { top_complaints: ["x"] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.external_voc?.top_complaints).toEqual(["x"]);
  });
});
