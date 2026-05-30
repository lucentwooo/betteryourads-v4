import type { BrandExtraction, ExternalVoc } from "@bya/shared";
import { chat } from "../services/openrouter.js";
import { parseJsonLoose } from "../lib/json.js";
import { loadConfig } from "../config/index.js";
import { buildCustomerResearchPrompt } from "../prompts/customer-research.v1.js";

/** Voice-of-customer web-search pass (ported from legacy researchCustomers).
 *  Best-effort: any failure (upstream error or unparseable output) returns null, and the
 *  caller leaves external_voc unset — the concept board degrades to "none collected". */
export async function runCustomerResearch(analysis: BrandExtraction): Promise<ExternalVoc | null> {
  const raw = analysis as Record<string, unknown>;
  const identity = isObj(raw.brand_identity) ? raw.brand_identity : {};
  const messaging = isObj(raw.messaging_foundation) ? raw.messaging_foundation : {};
  const plan = isObj(raw.external_customer_research_plan) ? raw.external_customer_research_plan : {};

  const prompt = buildCustomerResearchPrompt({
    brandContext: {
      brand: str(identity.brand_name) || str(identity.name),
      positioning: str(identity.positioning) || str(identity.tagline),
      customer_segments: arr(messaging.customer_segments),
    },
    researchTargets: {
      recommended_subreddits: arr(plan.recommended_subreddits),
      review_sites: arr(plan.review_sites),
      communities: arr(plan.communities),
      search_queries: arr(plan.search_queries),
      competitor_review_targets: arr(plan.competitor_review_targets),
      what_to_extract: arr(plan.what_to_extract),
    },
  });

  try {
    const out = await chat({
      model: loadConfig().stage1Model,
      messages: [{ role: "user", content: prompt }],
      online: true,
      stage: "brand",
    });
    const parsed = parseJsonLoose(out);
    if (!isObj(parsed)) return null;
    return {
      top_complaints: strArr(parsed.top_complaints),
      recurring_phrases: strArr(parsed.recurring_phrases),
      desired_outcomes: strArr(parsed.desired_outcomes),
      objections: strArr(parsed.objections),
      switching_triggers: strArr(parsed.switching_triggers),
      competitor_gripes: strArr(parsed.competitor_gripes),
      sources: strArr(parsed.sources),
    };
  } catch {
    return null;
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
