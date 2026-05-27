import type { MeasuredSiteData } from "@bya/shared";
import { EXTRACT_BRAND_DNA_V3 } from "./extract-brand-dna.v3.js";

/** Ground the v3 system prompt with the authoritative measured site data (ported from legacy buildGroundedPrompt). */
export function buildStage1Prompt(url: string, measured: MeasuredSiteData): string {
  const head =
    `Website to analyze: ${measured.finalUrl || url}\n\n` +
    "=== MEASURED SITE DATA (authoritative) ===\n" +
    "These values were extracted directly from the live rendered page. " +
    "Use these EXACT hex codes and font names. Do NOT invent or alter colors. " +
    "Counts indicate how often/prominently each color appears.\n\n" +
    JSON.stringify(
      {
        title: measured.title,
        description: measured.description,
        colors: measured.colors,
        cssColorVariables: measured.cssColorVariables,
        fonts: measured.fonts,
        logos: measured.logos,
      },
      null,
      2,
    ) +
    "\n\n=== PAGE TEXT ===\n" +
    (measured.text || "") +
    "\n=== END SITE DATA ===\n\n";
  return head + EXTRACT_BRAND_DNA_V3;
}

export type BrandAgentGroup = { name: string; keys: string[] };

/** Stage 1 runs as 3 parallel agents, each emitting a disjoint slice of the BrandExtraction
 *  JSON; the pipeline merges them. Splitting avoids truncated/lazy single-shot output on the
 *  large 11-section schema. The union of all keys is exactly the BrandExtraction sections. */
export const BRAND_AGENT_GROUPS: BrandAgentGroup[] = [
  { name: "A", keys: ["brand_identity", "visual_brand_system", "product_representation", "offer_dna"] },
  { name: "B", keys: ["messaging_foundation", "proof_library", "customer_dna_from_website"] },
  {
    name: "C",
    keys: [
      "external_customer_research_plan",
      "competitor_intelligence",
      "claim_constraints",
      "missing_information",
      "source_map",
    ],
  },
];

/** Append the parallel-worker directive (ported from legacy runAgent): return ONLY this
 *  agent's top-level keys. This OVERRIDES the single-object output format in the v3 prompt. */
export function buildAgentPrompt(base: string, group: BrandAgentGroup): string {
  return (
    base +
    "\n\n=== PARALLEL EXTRACTION DIRECTIVE (this OVERRIDES the output-format instructions above) ===\n" +
    "You are one of several parallel workers analyzing this same site. Return a SINGLE valid JSON object " +
    "containing EXACTLY these top-level keys and NOTHING else: " +
    JSON.stringify(group.keys) +
    ".\nUse the exact sub-structure defined for those keys in the schema above, and follow every extraction rule. " +
    "Do NOT include any other top-level keys. Do NOT wrap the JSON in markdown fences."
  );
}
