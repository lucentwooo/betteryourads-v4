import { describe, it, expect } from "vitest";
import { buildStage1Prompt, buildAgentPrompt, BRAND_AGENT_GROUPS } from "../src/prompts/registry.js";
import type { MeasuredSiteData } from "@bya/shared";

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
