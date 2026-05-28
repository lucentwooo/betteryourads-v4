import { ConceptSet } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildConceptContent } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

export async function runConcepts(input: { brandExtraction: unknown }): Promise<ConceptSet> {
  const model = loadConfig().stage3Model;
  const messages: ChatMessage[] = [
    { role: "user", content: buildConceptContent(input.brandExtraction as never) },
  ];

  const first = await chat({ model, messages, stage: "concepts" });
  let result = parseConceptSet(first);
  if (!result) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON for the required structure. Return ONLY the JSON object " +
          "with campaign_strategy_summary, ad_ideas (array), recommended_top_3, and next_step_recommendations — " +
          "no prose, no markdown fences.",
      },
    ];
    const second = await chat({ model, messages: repair, stage: "concepts" });
    result = parseConceptSet(second);
    if (!result) {
      console.error("[concepts] model returned invalid JSON twice. Last output (truncated):\n", second.slice(0, 1000));
      throw new ValidationError("Concept generation returned an unexpected shape.");
    }
  }
  return result;
}

function parseConceptSet(content: string): ConceptSet | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  const v = ConceptSet.safeParse(obj);
  return v.success ? v.data : null;
}
