import { describe, it, expect } from "vitest";
import { brandName, positioningLine, accentColor } from "./brandChip";

describe("brandChip selectors", () => {
  it("brandName reads brand_identity.brand_name, falls back to 'Your brand'", () => {
    expect(brandName({ brand_identity: { brand_name: "Acme" } })).toBe("Acme");
    expect(brandName({})).toBe("Your brand");
    expect(brandName(null)).toBe("Your brand");
  });

  it("positioningLine prefers positioning_statement then one_line_description", () => {
    expect(positioningLine({ brand_identity: { positioning_statement: "P" } })).toBe("P");
    expect(positioningLine({ brand_identity: { one_line_description: "D" } })).toBe("D");
    expect(positioningLine({})).toBe("");
  });

  it("accentColor reads brand accent, falls back to measured accent_cta, then token default", () => {
    expect(accentColor({ visual_brand_system: { colors: { accent: ["#abc"] } } }, null)).toBe("#abc");
    expect(accentColor({}, { colors: { accent_cta: [{ hex: "#def", count: 3 }] } } as never)).toBe("#def");
    expect(accentColor({}, null)).toBe("var(--accent)");
  });
});
