import { Router } from "express";
import { runAdPrompt } from "../pipelines/ad-prompt.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";

export const adPromptRouter = Router();

adPromptRouter.post("/ad-prompt", requireApprovedUser, async (req, res) => {
  try {
    const adPrompt = await runAdPrompt({
      brandExtraction: req.body?.brandExtraction,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
      customerResearch: req.body?.customerResearch,
      performanceMemory: req.body?.performanceMemory,
      userDirection: req.body?.userDirection,
    });
    res.json({ adPrompt });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
