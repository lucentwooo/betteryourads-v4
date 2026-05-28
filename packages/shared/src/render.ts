import { z } from "zod";
import { AdPrompt } from "./ad-prompt.js";

/** Request body for POST /api/render. Images are base64 data URLs. adPromptId, when sent,
 *  is recorded as the FK on the generated_ads row so the rendered ad links back to its
 *  saved prompt. */
export const RenderRequest = z.object({
  adPrompt: AdPrompt,
  adPromptId: z.string().optional(),
  referenceAdImage: z.string(),
  logoImage: z.string(),
  productAsset: z.string().optional(),
});

export type RenderRequest = z.infer<typeof RenderRequest>;
