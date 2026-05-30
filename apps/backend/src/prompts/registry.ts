import type { MeasuredSiteData, BrandExtraction, Goal } from "@bya/shared";
import { GOAL_LABEL, GOAL_FOCUS } from "@bya/shared";
import { EXTRACT_BRAND_DNA_V3 } from "./extract-brand-dna.v3.js";
import { IMAGE_GENERATOR_V4_NO_ASSET } from "./image-generator.v4-no-asset.js";
import { IMAGE_GENERATOR_V4_W_ASSET } from "./image-generator.v4-w-asset.js";
import type { ContentPart } from "../services/openrouter.js";
import { buildConceptBoardPrompt } from "./concept-board.v1.js";

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

/** Stage-2 variant selection is driven purely by product-asset presence. */
export function getStage2Prompt(hasProductAsset: boolean): string {
  return hasProductAsset ? IMAGE_GENERATOR_V4_W_ASSET : IMAGE_GENERATOR_V4_NO_ASSET;
}

export type Stage2Inputs = {
  brandExtraction: BrandExtraction;
  referenceAdImage: string;
  logoImage: string;
  productAsset?: string;
  customerResearch?: unknown;
  performanceMemory?: unknown;
  userDirection?: unknown;
};

/** Assemble the Stage-2 vision user message: grounded prompt text + attached images
 *  (reference ad → brand logo → optional product asset), each labeled in the text. */
export function buildStage2Content(inputs: Stage2Inputs): ContentPart[] {
  const hasProductAsset = Boolean(inputs.productAsset);
  let text =
    getStage2Prompt(hasProductAsset) +
    "\n\n=== BRAND_EXTRACTION_JSON ===\n" +
    JSON.stringify(inputs.brandExtraction, null, 2) +
    "\n\n=== REFERENCE_AD_IMAGE ===\nThe first attached image is the REFERENCE_AD_IMAGE. Analyze it and reproduce its layout, composition, and element positions faithfully." +
    "\n\n=== BRAND_LOGO_IMAGE ===\nThe second attached image is the BRAND_LOGO_IMAGE. Use it exactly as provided; do not redraw, restyle, or recolor it.";
  if (hasProductAsset) {
    text +=
      "\n\n=== PRODUCT_VISUAL_IMAGE ===\nThe third attached image is the PRODUCT_VISUAL_IMAGE (a real product/UI asset). Use it exactly as provided; do not redraw, edit, or fabricate UI.";
  }
  if (inputs.customerResearch !== undefined) {
    text += "\n\n=== OPTIONAL_CUSTOMER_RESEARCH_JSON ===\n" + JSON.stringify(inputs.customerResearch, null, 2);
  }
  if (inputs.performanceMemory !== undefined) {
    text += "\n\n=== OPTIONAL_PERFORMANCE_MEMORY_JSON ===\n" + JSON.stringify(inputs.performanceMemory, null, 2);
  }
  if (inputs.userDirection !== undefined) {
    text +=
      "\n\n=== OPTIONAL_USER_DIRECTION ===\n" +
      (typeof inputs.userDirection === "string" ? inputs.userDirection : JSON.stringify(inputs.userDirection, null, 2));
  }

  const parts: ContentPart[] = [
    { type: "text", text },
    { type: "image_url", image_url: { url: inputs.referenceAdImage } },
    { type: "image_url", image_url: { url: inputs.logoImage } },
  ];
  if (inputs.productAsset) parts.push({ type: "image_url", image_url: { url: inputs.productAsset } });
  return parts;
}

/** Stage-3 (concept board) user message: legacy-prompt approach, grounded in analysis facts. */
export function buildConceptBoardContent(analysis: BrandExtraction, goal: Goal): string {
  // BrandExtraction uses .passthrough() so legacy fields exist at runtime; access via the index signature.
  const raw = analysis as Record<string, unknown>;
  const proof = isObj(raw.proof_library) ? raw.proof_library : {};
  const claims = isObj(raw.claim_constraints) ? raw.claim_constraints : {};
  const sac = isObj(raw.static_ad_creative_recommendations) ? raw.static_ad_creative_recommendations : {};
  const facts = {
    customer_voice: raw.external_voc || "none collected",
    customer_dna: raw.customer_dna_from_website || {},
    messaging: raw.messaging_foundation || {},
    proof: {
      safe_ad_proof_points: toArr(proof.safe_ad_proof_points),
      testimonials: toArr(proof.testimonials),
      roi_claims: toArr(proof.roi_claims),
      case_study_metrics: toArr(proof.case_study_metrics),
    },
    competitors: raw.competitor_intelligence || {},
    claim_constraints: {
      allowed: toArr(claims.allowed_claims),
      forbidden: toArr(claims.forbidden_claims),
      requires_proof: toArr(claims.claims_requiring_proof),
    },
    existing_seeds: toArr(sac.ad_concepts),
  };
  return buildConceptBoardPrompt({ goalLabel: GOAL_LABEL[goal], focus: GOAL_FOCUS[goal], facts });
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
