import { describe, it, expect } from "vitest";
import { mapBrandFields, mapConcepts } from "@/lib/brand-map";

const extraction = {
  visual_brand_system: {
    colors: {
      primary: ["#111111"],
      secondary: ["#222222"],
      accent: ["#333333"],
      background: ["#ffffff"],
      text: ["#000000"],
    },
    ui_style: { overall_mood: "clean enterprise SaaS" },
  },
  static_ad_creative_recommendations: {
    ad_concepts: [
      {
        concept_name: "Pain Lead",
        suggested_headline: "Stop losing leads",
        suggested_cta: "Start free",
        hook: "h",
        proof_point: "p",
        visual_metaphor: "m",
        suggested_layout: "split",
        why_this_should_work: "because",
      },
    ],
  },
};

describe("mapBrandFields", () => {
  it("pulls 5 colors + vibe from extraction", () => {
    const f = mapBrandFields(extraction);
    expect(f.color_primary).toBe("#111111");
    expect(f.color_text).toBe("#000000");
    expect(f.brand_vibe).toBe("clean enterprise SaaS");
  });
  it("tolerates missing fields", () => {
    expect(mapBrandFields({}).color_primary).toBeNull();
  });
});

describe("mapConcepts", () => {
  it("maps ad_concepts into concept rows", () => {
    const c = mapConcepts(extraction);
    expect(c).toHaveLength(1);
    expect(c[0].name).toBe("Pain Lead");
    expect(c[0].headline).toBe("Stop losing leads");
    expect(c[0].cta).toBe("Start free");
  });
});
