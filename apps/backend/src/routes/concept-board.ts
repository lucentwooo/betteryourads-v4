import { Router } from "express";
import { Goal } from "@bya/shared";
import { runConceptBoard } from "../pipelines/concept-board.js";
import { getBrandExtraction, saveConceptBoard, getConceptBoard, setBrandGoal } from "../services/supabase.js";
import { toHttpError, ValidationError, AppError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { loadConfig } from "../config/index.js";

export const conceptBoardRouter = Router();

conceptBoardRouter.post("/concept-board", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const brandExtractionId: unknown = req.body?.brandExtractionId;
    if (typeof brandExtractionId !== "string") throw new ValidationError("brandExtractionId is required.");

    const goalParsed = Goal.safeParse(req.body?.goal);
    if (!goalParsed.success) throw new ValidationError("goal must be one of: waitlist, trials, paid.");
    const goal = goalParsed.data;

    const analysis = await getBrandExtraction(brandExtractionId, userId);
    if (!analysis) throw new ValidationError("Brand not found.");

    const board = await runConceptBoard({ analysis, goal });
    await saveConceptBoard({ userId, brandExtractionId, board, model: loadConfig().stage3Model });
    await setBrandGoal(userId, brandExtractionId, goal);

    res.json({ board });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

conceptBoardRouter.get("/concept-board/:brandId", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { brandId } = req.params;

    const board = await getConceptBoard(brandId, userId);
    if (!board) throw new AppError("No concept board.", "NOT_FOUND", 404, "validation");

    res.json({ board });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

conceptBoardRouter.patch("/brand/:id/goal", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const goalParsed = Goal.safeParse(req.body?.goal);
    if (!goalParsed.success) throw new ValidationError("goal must be one of: waitlist, trials, paid.");
    const goal = goalParsed.data;

    await setBrandGoal(userId, id, goal);
    res.json({ ok: true });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
