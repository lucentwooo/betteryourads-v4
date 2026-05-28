import { describe, it, expect } from "vitest";
import { buildConceptContent } from "../src/prompts/registry.js";

describe("buildConceptContent", () => {
  it("includes the strategist prompt and the brand JSON", () => {
    const out = buildConceptContent({ brand_identity: { name: "Acme" } } as never);
    expect(out).toContain("senior SaaS marketing strategist");
    expect(out).toContain("BRAND_DNA_JSON");
    expect(out).toContain("Acme");
  });
});
