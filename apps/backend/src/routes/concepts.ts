import { Router } from "express";
import { runConcepts } from "../pipelines/concepts.js";
import { saveConceptSet } from "../services/supabase.js";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { loadConfig } from "../config/index.js";

export const conceptsRouter = Router();

conceptsRouter.post("/concepts", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtraction = req.body?.brandExtraction;
    const brandExtractionId: unknown = req.body?.brandExtractionId;
    if (!brandExtraction) throw new ValidationError("brandExtraction is required.");
    if (typeof brandExtractionId !== "string") throw new ValidationError("brandExtractionId is required.");

    const conceptSet = await runConcepts({ brandExtraction });
    const { id } = await saveConceptSet({
      userId,
      brandExtractionId,
      conceptSet,
      model: loadConfig().stage3Model,
    });
    res.json({ id, conceptSet });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
