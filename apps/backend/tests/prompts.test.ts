import { describe, it, expect } from "vitest";
import {
  buildStage1Prompt,
  buildAgentPrompt,
  BRAND_AGENT_GROUPS,
  getStage2Prompt,
  buildStage2Content,
} from "../src/prompts/registry.js";
import type { MeasuredSiteData, BrandExtraction } from "@bya/shared";

const measured: MeasuredSiteData = {
  title: "Acme",
  description: "do things",
  colors: { text: [{ hex: "#111111", count: 9 }], background: [], border: [], accent_cta: [] },
  cssColorVariables: {},
  fonts: { body: "Inter", heading: null, button: null },
  logos: [],
  text: "Acme builds widgets.",
  finalUrl: "https://acme.com/",
};

describe("buildStage1Prompt", () => {
  it("grounds the v3 system prompt with the measured site data and url", () => {
    const p = buildStage1Prompt("https://acme.com", measured);
    expect(p).toContain("MEASURED SITE DATA (authoritative)");
    expect(p).toContain("#111111");
    expect(p).toContain("Acme builds widgets.");
    expect(p).toContain("https://acme.com");
    expect(p).toContain("Final Output Format");
  });
});

describe("brand agent groups", () => {
  it("split the 11 sections + source_map across 3 disjoint agents with no overlap or omission", () => {
    expect(BRAND_AGENT_GROUPS).toHaveLength(3);
    const all = BRAND_AGENT_GROUPS.flatMap((g) => g.keys);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(
      new Set([
        "brand_identity",
        "visual_brand_system",
        "product_representation",
        "offer_dna",
        "messaging_foundation",
        "proof_library",
        "customer_dna_from_website",
        "external_customer_research_plan",
        "competitor_intelligence",
        "claim_constraints",
        "missing_information",
        "source_map",
      ]),
    );
  });

  it("buildAgentPrompt appends a directive naming exactly that agent's keys", () => {
    const base = buildStage1Prompt("https://acme.com", measured);
    const prompt = buildAgentPrompt(base, BRAND_AGENT_GROUPS[0]);
    expect(prompt.startsWith(base)).toBe(true);
    expect(prompt).toContain("PARALLEL EXTRACTION DIRECTIVE");
    expect(prompt).toContain(JSON.stringify(BRAND_AGENT_GROUPS[0].keys));
  });
});

const brand: BrandExtraction = { brand_identity: { brand_name: "Acme" }, schema_version: 1 };
const REF = "data:image/png;base64,REF";
const LOGO = "data:image/png;base64,LOGO";
const ASSET = "data:image/png;base64,ASSET";

describe("getStage2Prompt", () => {
  it("selects the no-asset variant when there is no product asset", () => {
    const p = getStage2Prompt(false);
    expect(p).toContain("abstractly and iconically");
    expect(p).not.toContain("PRODUCT_VISUAL_IMAGE");
  });

  it("selects the w-asset variant when a product asset is present", () => {
    expect(getStage2Prompt(true)).toContain("PRODUCT_VISUAL_IMAGE");
  });
});

describe("buildStage2Content", () => {
  it("grounds the prompt and attaches reference + logo images in order (no product asset)", () => {
    const parts = buildStage2Content({ brandExtraction: brand, referenceAdImage: REF, logoImage: LOGO });
    expect(parts[0].type).toBe("text");
    const text = (parts[0] as { type: "text"; text: string }).text;
    expect(text).toContain("BRAND_EXTRACTION_JSON");
    expect(text).toContain("Acme");
    expect(parts).toHaveLength(3); // text + reference + logo
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: REF } });
    expect(parts[2]).toEqual({ type: "image_url", image_url: { url: LOGO } });
  });

  it("appends the product asset image and uses the w-asset prompt when provided", () => {
    const parts = buildStage2Content({
      brandExtraction: brand,
      referenceAdImage: REF,
      logoImage: LOGO,
      productAsset: ASSET,
    });
    expect(parts).toHaveLength(4);
    expect(parts[3]).toEqual({ type: "image_url", image_url: { url: ASSET } });
    expect((parts[0] as { type: "text"; text: string }).text).toContain("PRODUCT_VISUAL_IMAGE");
  });

  it("threads optional inputs into the text only when present", () => {
    // The v4 prompt itself names the optional-input labels, so assert on the
    // `=== … ===` delimited section, which only appears when data is actually injected.
    const without = buildStage2Content({ brandExtraction: brand, referenceAdImage: REF, logoImage: LOGO });
    expect((without[0] as { type: "text"; text: string }).text).not.toContain("=== OPTIONAL_CUSTOMER_RESEARCH_JSON ===");
    const withOpts = buildStage2Content({
      brandExtraction: brand,
      referenceAdImage: REF,
      logoImage: LOGO,
      customerResearch: { pains: ["slow"] },
      userDirection: "promote the free trial",
    });
    const text = (withOpts[0] as { type: "text"; text: string }).text;
    expect(text).toContain("=== OPTIONAL_CUSTOMER_RESEARCH_JSON ===");
    expect(text).toContain("slow");
    expect(text).toContain("=== OPTIONAL_USER_DIRECTION ===");
    expect(text).toContain("promote the free trial");
    expect(text).not.toContain("=== OPTIONAL_PERFORMANCE_MEMORY_JSON ===");
  });
});
