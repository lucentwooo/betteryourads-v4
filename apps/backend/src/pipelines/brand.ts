import { BrandExtraction, MeasuredSiteData } from "@bya/shared";
import { chat, type ChatMessage } from "../services/openrouter.js";
import { buildStage1Prompt, buildAgentPrompt, BRAND_AGENT_GROUPS, type BrandAgentGroup } from "../prompts/registry.js";
import { parseJsonLoose } from "../lib/json.js";
import { ValidationError, OpenRouterError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const SCHEMA_VERSION = 1;

export type BrandInput = { url: string; measuredSiteData: MeasuredSiteData };

export async function runBrand({ url, measuredSiteData }: BrandInput): Promise<BrandExtraction> {
  const trimmed = (url ?? "").trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new ValidationError("Provide a valid http(s) URL.");
  const md = MeasuredSiteData.safeParse(measuredSiteData);
  if (!md.success) throw new ValidationError("measuredSiteData is missing or malformed.");

  const model = loadConfig().stage1Model;
  const base = buildStage1Prompt(trimmed, md.data);

  // 3 parallel agents, each emitting a disjoint slice of the brand JSON; merge what succeeds.
  const settled = await Promise.allSettled(BRAND_AGENT_GROUPS.map((g) => runAgent(model, base, g)));

  const merged: Record<string, unknown> = {};
  let upstreamError: OpenRouterError | null = null;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (r.value) Object.assign(merged, r.value);
    } else if (r.reason instanceof OpenRouterError) {
      upstreamError = r.reason;
    }
  }

  if (!merged.brand_identity) {
    if (upstreamError) throw upstreamError; // total upstream failure dominated
    throw new ValidationError("Brand analysis did not return a usable result.");
  }

  const parsed = BrandExtraction.safeParse(merged);
  if (!parsed.success) throw new ValidationError("Brand analysis returned an unexpected shape.");
  return { ...parsed.data, schema_version: SCHEMA_VERSION };
}

/** One agent: build its directive prompt, call the model (:online), parse; one repair retry on parse failure. */
async function runAgent(model: string, base: string, group: BrandAgentGroup): Promise<Record<string, unknown> | null> {
  const messages: ChatMessage[] = [{ role: "user", content: buildAgentPrompt(base, group) }];
  const first = await chat({ model, messages, online: true, stage: "brand" });
  const parsed = parseSlice(first);
  if (parsed) return parsed;

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first },
    {
      role: "user",
      content:
        "Your previous response was not valid JSON. Return ONLY a JSON object with exactly the " +
        "requested top-level keys — no prose, no markdown fences, no commentary.",
    },
  ];
  const second = await chat({ model, messages: repairMessages, online: true, stage: "brand" });
  const repaired = parseSlice(second);
  if (repaired) return repaired;

  console.error(`[brand] agent ${group.name} returned invalid JSON twice. Last output (truncated):\n`, second.slice(0, 1000));
  return null;
}

/** Parse a single agent reply into a plain object slice, or null if it isn't a JSON object. */
function parseSlice(content: string): Record<string, unknown> | null {
  let obj: unknown;
  try {
    obj = parseJsonLoose(content);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  return obj as Record<string, unknown>;
}
