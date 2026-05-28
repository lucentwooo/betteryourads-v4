import { Router } from "express";
import { runRender } from "../pipelines/render.js";
import { toHttpError, ValidationError, RateLimitError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { ADMIN_EMAIL } from "../middleware/require-admin.js";
import { getAdPrompt, persistRenderedAd, countAdsToday } from "../services/supabase.js";

// Non-admin accounts may create at most this many creatives per UTC day.
const DAILY_CREATIVE_LIMIT = 10;

export const renderRouter = Router();

renderRouter.post("/render", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;

    if (req.user!.email?.toLowerCase() !== ADMIN_EMAIL) {
      const used = await countAdsToday(userId);
      if (used >= DAILY_CREATIVE_LIMIT) {
        throw new RateLimitError(
          `Daily limit of ${DAILY_CREATIVE_LIMIT} creatives reached. Try again tomorrow.`,
        );
      }
    }

    const adPromptId: string | undefined = req.body?.adPromptId;

    // An inline adPrompt takes precedence for rendering; adPromptId (when given) is the
    // prompt to look up AND the FK recorded on the row. Callers send one or the other.
    let adPrompt = req.body?.adPrompt;
    if (adPromptId) {
      const savedAdPrompt = await getAdPrompt(adPromptId, userId);
      if (!savedAdPrompt) throw new ValidationError("adPromptId not found.");
      if (!adPrompt) adPrompt = savedAdPrompt;
    }

    const rendered = await runRender({
      adPrompt,
      referenceAdImage: req.body?.referenceAdImage,
      logoImage: req.body?.logoImage,
      productAsset: req.body?.productAsset,
    });

    const result = await persistRenderedAd({
      userId,
      imageUrl: rendered.imageUrl,
      prompt: JSON.stringify(adPrompt?.ad_prompt ?? adPrompt ?? {}),
      aspectRatio: rendered.aspectRatio,
      resolution: rendered.resolution,
      adPromptId: adPromptId ?? null,
    });
    res.json({ id: result.id, imageUrl: result.imageUrl });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

renderRouter.get("/usage", requireApprovedUser, async (req, res) => {
  try {
    const limit = DAILY_CREATIVE_LIMIT;
    if (req.user!.email?.toLowerCase() === ADMIN_EMAIL) {
      res.json({ unlimited: true, used: 0, limit, remaining: limit });
      return;
    }
    const used = await countAdsToday(req.user!.id);
    res.json({ unlimited: false, used, limit, remaining: Math.max(0, limit - used) });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
