import { Router } from "express";
import { runExtract } from "../pipelines/extract.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";

export const extractRouter = Router();

extractRouter.post("/extract", requireApprovedUser, async (req, res) => {
  try {
    const data = await runExtract(req.body?.url ?? "");
    res.json(data);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
