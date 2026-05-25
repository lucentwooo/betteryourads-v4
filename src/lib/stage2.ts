import { STAGE2_PROMPT } from "@/lib/prompts";
import { parseJsonLoose, mapAspectRatio } from "@/lib/extract";
import { env } from "@/lib/env";

type Concept = Record<string, any>;

export async function buildAdPrompt(
  extraction: unknown,
  concept: Concept,
  inspirationDataUrl: string,
) {
  const text =
    STAGE2_PROMPT +
    `\n\n=== BRAND_EXTRACTION_JSON ===\n${JSON.stringify(extraction)}` +
    `\n\n=== OPTIONAL_USER_DIRECTION ===\nBuild this specific concept: ${JSON.stringify(concept)}` +
    `\n\n=== REFERENCE_AD_IMAGE ===\nThe reference ad image is attached. Analyze it as REFERENCE_AD_IMAGE.`;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openrouterKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.stage2Model(),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text },
            { type: "image_url", image_url: { url: inspirationDataUrl } },
          ],
        },
      ],
    }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message ?? `stage2 HTTP ${r.status}`);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("stage2 empty response");
  const parsed = parseJsonLoose(content) as any;
  const adPrompt = parsed?.ad_prompt ?? parsed;
  const aspect = mapAspectRatio(adPrompt?.canvas?.aspect_ratio);
  return { adPrompt, promptText: JSON.stringify(adPrompt), aspect };
}
