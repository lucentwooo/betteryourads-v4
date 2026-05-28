import { Router } from "express";
import { ReferenceAdVariant } from "@bya/shared";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { listReferenceAds } from "../services/supabase.js";

export const referenceAdsRouter = Router();

referenceAdsRouter.get("/reference-ads", requireApprovedUser, async (req, res) => {
  try {
    const parsed = ReferenceAdVariant.safeParse(req.query.variant);
    if (!parsed.success) throw new ValidationError("`variant` must be 'with_asset' or 'no_asset'.");
    res.json(await listReferenceAds(parsed.data));
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
