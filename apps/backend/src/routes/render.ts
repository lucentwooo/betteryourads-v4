import { Router } from "express";
import { runRender } from "../pipelines/render.js";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { getAdPrompt, persistRenderedAd } from "../services/supabase.js";
import { loadConfig } from "../config/index.js";

export const renderRouter = Router();

renderRouter.post("/render", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const adPromptId: string | undefined = req.body?.adPromptId;

    let adPrompt = req.body?.adPrompt;
    if (!adPrompt && adPromptId) {
      adPrompt = await getAdPrompt(adPromptId);
      if (!adPrompt) throw new ValidationError("adPromptId not found.");
    }

    const imageUrl = await runRender({
      adPrompt,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
    });

    const result = await persistRenderedAd({
      userId,
      imageUrl,
      prompt: JSON.stringify(adPrompt?.ad_prompt ?? adPrompt ?? {}),
      aspectRatio: adPrompt?.ad_prompt?.canvas?.aspect_ratio ?? null,
      resolution: loadConfig().kieResolution || null,
      adPromptId: adPromptId ?? null,
    });
    res.json({ id: result.id, imageUrl: result.imageUrl });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
