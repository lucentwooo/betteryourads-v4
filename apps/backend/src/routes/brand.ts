import { Router } from "express";
import { runBrand } from "../pipelines/brand.js";
import { toHttpError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { saveBrandExtraction } from "../services/supabase.js";

export const brandRouter = Router();

brandRouter.post("/brand", requireApprovedUser, async (req, res) => {
  try {
    const url = req.body?.url ?? "";
    const measuredSiteData = req.body?.measuredSiteData;
    const brandExtraction = await runBrand({ url, measuredSiteData });
    const { id } = await saveBrandExtraction({
      userId: req.user!.id,
      url,
      brandExtraction,
      measuredSiteData,
    });
    res.json({ id, brandExtraction });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
