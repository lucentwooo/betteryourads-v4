import { z } from "zod";
import { AdPrompt } from "./ad-prompt.js";

/** Request body for POST /api/render. Images are base64 data URLs. */
export const RenderRequest = z.object({
  adPrompt: AdPrompt,
  referenceAdImage: z.string(),
  logoImage: z.string(),
  productAsset: z.string().optional(),
});

export type RenderRequest = z.infer<typeof RenderRequest>;
