import { Router } from "express";
import { runBrand } from "../pipelines/brand.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";

export const brandRouter = Router();

brandRouter.post("/brand", requireApprovedUser, async (req, res) => {
  try {
    const brandExtraction = await runBrand({
      url: req.body?.url ?? "",
      measuredSiteData: req.body?.measuredSiteData,
    });
    res.json({ brandExtraction });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
