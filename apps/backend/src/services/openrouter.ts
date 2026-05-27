import { OpenRouterError, type Stage } from "../lib/errors.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatArgs = {
  model: string;
  messages: ChatMessage[];
  online?: boolean;
  /** Used only to stamp the stage on a thrown OpenRouterError. */
  stage?: Stage;
};

type ChatCompletion = { choices?: { message?: { content?: string } }[] };

export async function chat({ model, messages, online, stage = "brand" }: ChatArgs): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY is not set.", stage);
  if (!model) throw new OpenRouterError("No model is configured for this stage.", stage);

  let resolvedModel = model;
  if (online && !resolvedModel.endsWith(":online")) resolvedModel += ":online";

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: resolvedModel, messages }),
    });
  } catch (e) {
    throw new OpenRouterError(e instanceof Error ? e.message : String(e), stage);
  }

  const text = await res.text();
  if (!res.ok) throw new OpenRouterError(`OpenRouter HTTP ${res.status}: ${text.slice(0, 300)}`, stage);

  let data: ChatCompletion;
  try {
    data = JSON.parse(text) as ChatCompletion;
  } catch {
    throw new OpenRouterError("OpenRouter returned a non-JSON response.", stage);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new OpenRouterError("OpenRouter returned no content.", stage);
  return content;
}
