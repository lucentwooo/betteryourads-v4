import { AdPrompt, AdPromptRequest } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildStage2Content } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const SCHEMA_VERSION = 1;

export type AdPromptInput = {
  brandExtraction: unknown;
  referenceAdImage: unknown;
  logoImage: unknown;
  productAsset?: unknown;
  customerResearch?: unknown;
  performanceMemory?: unknown;
  userDirection?: unknown;
};

export async function runAdPrompt(input: AdPromptInput): Promise<AdPrompt> {
  const parsed = AdPromptRequest.safeParse(input);
  if (!parsed.success) throw new ValidationError("ad-prompt request is missing or malformed.");
  const req = parsed.data;

  const model = loadConfig().stage2Model;
  const messages: ChatMessage[] = [{ role: "user", content: buildStage2Content(req) }];

  const first = await chat({ model, messages, stage: "ad-prompt" });
  let result = parseAdPrompt(first);
  if (!result) {
    const repairMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON. Return ONLY a JSON object with reference_ad_analysis, " +
          "reskin_map, and ad_prompt — no prose, no markdown fences, no commentary.",
      },
    ];
    const second = await chat({ model, messages: repairMessages, stage: "ad-prompt" });
    result = parseAdPrompt(second);
    if (!result) {
      console.error("[ad-prompt] model returned invalid JSON twice. Last output (truncated):\n", second.slice(0, 1000));
      throw new ValidationError("Ad-prompt generation returned an unexpected shape.");
    }
  }
  return { ...result, schema_version: SCHEMA_VERSION };
}

/** Parse + validate a Stage-2 reply into an AdPrompt that has a usable `ad_prompt`, or null. */
function parseAdPrompt(content: string): AdPrompt | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  const v = AdPrompt.safeParse(obj);
  if (!v.success || !v.data.ad_prompt) return null;
  return v.data;
}
