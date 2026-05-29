import type { AwarenessStage } from "@bya/shared";

export function buildConceptBoardPrompt(args: {
  goalLabel: string;
  focus: AwarenessStage[];
  facts: unknown;
}): string {
  return (
    "You are a senior direct-response Meta ads strategist who has run paid social for B2B SaaS " +
    "for over a decade. Produce a board of DISTINCT ad concepts for the brand below, organized by " +
    "customer awareness stage.\n\n" +
    "A concept is a different PSYCHOLOGICAL ANGLE into the same customer (e.g. Transformation / " +
    "Before→After, Vs. the old way, Customer proof, Risk reversal, How it works, ROI / value) — " +
    "NOT a reworded headline. Each must be genuinely different from the others.\n\n" +
    "AWARENESS STAGES (tag every concept with exactly one):\n" +
    "- \"unaware\": doesn't know they have the problem yet\n" +
    "- \"problem\": feels the pain, doesn't know solutions exist\n" +
    "- \"solution\": knows tools like this exist, weighing approaches\n" +
    "- \"product\": knows this product, comparing to alternatives\n" +
    "- \"most\": ready to buy, needs a nudge\n\n" +
    "GOAL FOCUS: the founder's goal is \"" + args.goalLabel + "\". Weight the board toward these stages: " +
    JSON.stringify(args.focus) + ". Still include a few concepts in the other stages, but produce the " +
    "most (and strongest) concepts for the focus stages.\n\n" +
    "GROUNDING — these are authoritative facts. Invent NO numbers, testimonials, guarantees, " +
    "statistics, or claims not present here. A proof-based concept may ONLY cite proof present in " +
    "facts.proof. Honor claim_constraints (never use a forbidden claim; only use a " +
    "requires_proof claim if matching proof exists).\n" +
    JSON.stringify(args.facts, null, 2) + "\n\n" +
    "Write each concept's example headline in the brand's own voice — prefer their repeated phrases " +
    "and the exact phrases real customers use (facts.customer_voice / facts.customer_dna).\n\n" +
    "OUTPUT CONTRACT — return ONLY a JSON object, no prose, no markdown fences:\n" +
    "{ \"concepts\": [ { \"angle\": \"<short label>\", \"stage\": \"<unaware|problem|solution|product|most>\", " +
    "\"headline\": \"<example hook in brand voice>\", \"rationale\": \"<one short line: why this lands for this ICP>\" } ] }\n" +
    "Produce 10–16 concepts total. No extra keys."
  );
}
