import { z } from "zod";
import { BrandExtraction } from "./brand-extraction.js";

const Canvas = z
  .object({
    width: z.union([z.number(), z.string()]).optional(),
    height: z.union([z.number(), z.string()]).optional(),
    aspect_ratio: z.string().optional(),
    format: z.string().optional(),
    safe_margin: z.string().optional(),
  })
  .passthrough();

/** The render spec Stage 3 (Plan 4) consumes. Kept loose except `canvas`, whose
 *  `aspect_ratio` Stage 3 reads; every field optional so model drift still parses. */
const AdPromptBody = z
  .object({
    goal: z.string().optional(),
    canvas: Canvas.optional(),
  })
  .passthrough();

export const AdPrompt = z
  .object({
    schema_version: z.number().optional(),
    reference_ad_analysis: z.object({}).passthrough().optional(),
    reskin_map: z.object({}).passthrough().optional(),
    ad_prompt: AdPromptBody.optional(),
    assumptions: z.array(z.unknown()).optional(),
    missing_inputs_that_would_improve_output: z.array(z.unknown()).optional(),
    source_fields_used: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type AdPrompt = z.infer<typeof AdPrompt>;

/** Request body for POST /api/ad-prompt. Images are base64 data URLs. brandExtractionId,
 *  when sent, links the saved prompt to that brand and anchors its performance memory. */
export const AdPromptRequest = z.object({
  brandExtraction: BrandExtraction,
  brandExtractionId: z.string().optional(),
  referenceAdImage: z.string(),
  logoImage: z.string(),
  productAsset: z.string().optional(),
  customerResearch: z.unknown().optional(),
  performanceMemory: z.unknown().optional(),
  userDirection: z.unknown().optional(),
});

export type AdPromptRequest = z.infer<typeof AdPromptRequest>;
