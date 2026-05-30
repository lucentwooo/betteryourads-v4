import { Router } from "express";
import { Concept } from "@bya/shared";
import { toHttpError, ValidationError, RateLimitError, AppError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { ADMIN_EMAIL } from "../middleware/require-admin.js";
import { countAdsToday, createBatch, getBatch } from "../services/supabase.js";
import { runBatch, type BatchWorkItem } from "../services/batch-worker.js";
import { dailyLimit } from "../lib/usage.js";

export const batchRouter = Router();

batchRouter.post("/batch", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtraction = req.body?.brandExtraction;
    const brandExtractionId: string | null = typeof req.body?.brandExtractionId === "string" ? req.body.brandExtractionId : null;
    const rawItems: unknown = req.body?.items;
    if (!brandExtraction) throw new ValidationError("brandExtraction is required.");
    if (!Array.isArray(rawItems) || rawItems.length === 0) throw new ValidationError("At least one concept is required.");

    const items: BatchWorkItem[] = rawItems.map((raw, i) => {
      const r = raw as Record<string, unknown>;
      const concept = Concept.safeParse(r.concept);
      if (!concept.success) throw new ValidationError(`Concept ${i + 1} is malformed.`);
      if (typeof r.referenceAdImage !== "string" || typeof r.logoImage !== "string") {
        throw new ValidationError(`Concept ${i + 1} is missing its reference ad or logo.`);
      }
      return {
        itemId: "",
        concept: concept.data,
        brandExtraction,
        referenceAdImage: r.referenceAdImage,
        logoImage: r.logoImage,
        productAsset: typeof r.productAsset === "string" ? r.productAsset : undefined,
      };
    });

    if (req.user!.email?.toLowerCase() !== ADMIN_EMAIL) {
      const limit = dailyLimit();
      const used = await countAdsToday(userId);
      if (used + items.length > limit) {
        throw new RateLimitError(
          `This batch needs ${items.length} creatives but only ${Math.max(0, limit - used)} remain today.`,
        );
      }
    }

    const { batchId, itemIds } = await createBatch({
      userId,
      brandExtractionId,
      items: items.map((it, i) => ({ ideaNumber: i + 1, ideaName: it.concept.headline })),
    });
    items.forEach((it, i) => (it.itemId = itemIds[i]));

    void runBatch({ batchId, userId, brandExtractionId, items }).catch((e) => {
      console.error("[batch] worker crashed:", e instanceof Error ? e.message : e);
    });

    res.json({ batchId });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

batchRouter.get("/batch/:id", requireApprovedUser, async (req, res) => {
  try {
    const view = await getBatch(req.params.id, req.user!.id);
    if (!view) throw new AppError("Batch not found.", "NOT_FOUND", 404, "validation");
    res.json(view);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
