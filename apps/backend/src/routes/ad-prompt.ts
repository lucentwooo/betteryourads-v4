import { Router } from "express";
import { runAdPrompt } from "../pipelines/ad-prompt.js";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { getBrandExtraction, saveAdPrompt, assemblePerformanceMemory } from "../services/supabase.js";
import { loadConfig } from "../config/index.js";

export const adPromptRouter = Router();

adPromptRouter.post("/ad-prompt", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtractionId: string | undefined = req.body?.brandExtractionId;
    const userDirection = req.body?.userDirection;

    let brandExtraction = req.body?.brandExtraction;
    if (brandExtractionId) {
      const savedBrandExtraction = await getBrandExtraction(brandExtractionId, userId);
      if (!savedBrandExtraction) throw new ValidationError("brandExtractionId not found.");
      if (!brandExtraction) brandExtraction = savedBrandExtraction;
    }

    // brandExtractionId anchors performance memory to that brand's prior ads, so we assemble
    // it whenever an id is given — even if the extraction itself was passed inline.
    let performanceMemory = req.body?.performanceMemory;
    if (performanceMemory === undefined && brandExtractionId) {
      performanceMemory = await assemblePerformanceMemory({ userId, brandExtractionId });
    }

    const adPrompt = await runAdPrompt({
      brandExtraction,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
      customerResearch: req.body?.customerResearch,
      performanceMemory,
      userDirection,
    });

    const variant: "no_asset" | "w_asset" = req.body?.productAsset ? "w_asset" : "no_asset";
    const { id } = await saveAdPrompt({
      userId,
      brandExtractionId: brandExtractionId ?? null,
      variant,
      adPrompt,
      userDirection,
      model: loadConfig().stage2Model,
    });
    res.json({ id, adPrompt });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
