import { ConceptBoard, type Goal } from "@bya/shared";
import type { BrandExtraction } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildConceptBoardContent } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const VALID_STAGES = ["unaware", "problem", "solution", "product", "most"] as const;

export async function runConceptBoard(input: {
  analysis: BrandExtraction;
  goal: Goal;
}): Promise<ConceptBoard> {
  const model = loadConfig().stage3Model;
  const content = buildConceptBoardContent(input.analysis, input.goal);
  const messages: ChatMessage[] = [{ role: "user", content }];

  const first = await chat({ model, messages, stage: "concepts" });
  let result = parseBoard(first, input.goal);
  if (!result) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON for the required structure. Return ONLY the JSON object " +
          "with a \"concepts\" array of objects each having angle, stage, headline, and rationale — " +
          "no prose, no markdown fences.",
      },
    ];
    const second = await chat({ model, messages: repair, stage: "concepts" });
    result = parseBoard(second, input.goal);
    if (!result) {
      console.error("[concept-board] model returned invalid JSON twice. Last output (truncated):\n", second.slice(0, 1000));
      throw new ValidationError("Concept board generation returned an unexpected shape.");
    }
  }
  return result;
}

function parseBoard(content: string, goal: Goal): ConceptBoard | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const raw = obj as Record<string, unknown>;
  const arr = Array.isArray(raw.concepts) ? raw.concepts : null;
  if (!arr) return null;
  const concepts = arr
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null && Boolean((c as Record<string, unknown>).headline) && Boolean((c as Record<string, unknown>).angle))
    .map((c) => ({
      angle: String(c.angle),
      stage: VALID_STAGES.includes(c.stage as (typeof VALID_STAGES)[number]) ? c.stage : "solution",
      headline: String(c.headline),
      rationale: c.rationale ? String(c.rationale) : "",
    }));
  const v = ConceptBoard.safeParse({ goal, concepts });
  return v.success ? v.data : null;
}
