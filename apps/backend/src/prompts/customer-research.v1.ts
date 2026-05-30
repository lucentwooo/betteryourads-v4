/** Voice-of-customer research prompt (ported verbatim from legacy researchCustomers,
 *  bya-pipeline.js:338-358). One online web-search call; returns the compact VOC JSON. */
export function buildCustomerResearchPrompt(args: {
  brandContext: { brand: string; positioning: string; customer_segments: unknown[] };
  researchTargets: {
    recommended_subreddits: unknown[];
    review_sites: unknown[];
    communities: unknown[];
    search_queries: unknown[];
    competitor_review_targets: unknown[];
    what_to_extract: unknown[];
  };
}): string {
  return (
    "You are a senior B2B SaaS market researcher. Using web search, find what REAL prospective " +
    "customers of this product actually say, complain about, and want — in their own words — " +
    "across the sources below. Do NOT invent quotes; report only what you actually find. " +
    "If a source yields nothing, omit it.\n\n" +
    "BRAND CONTEXT (so you research the right audience):\n" +
    JSON.stringify(args.brandContext, null, 2) +
    "\n\n" +
    "RESEARCH TARGETS (where to look):\n" +
    JSON.stringify(args.researchTargets, null, 2) +
    "\n\n" +
    "Extract recurring complaints, the exact phrases people use, desired outcomes, objections/" +
    "hesitations, what makes people switch from alternatives, and gripes about competitors. " +
    "Prefer concrete, quotable language over summaries.\n\n" +
    "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
    '{ "top_complaints": [], "recurring_phrases": [], "desired_outcomes": [], ' +
    '"objections": [], "switching_triggers": [], "competitor_gripes": [], "sources": [] }\n' +
    "Keep each array to the most salient 5–10 items."
  );
}
