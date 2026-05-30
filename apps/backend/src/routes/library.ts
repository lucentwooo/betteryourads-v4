import { Router } from "express";
import { toHttpError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { listBrandExtractions, getBrandDetail, listGeneratedAds, saveBrandLogo } from "../services/supabase.js";

export const libraryRouter = Router();

libraryRouter.get("/brands", requireApprovedUser, async (req, res) => {
  try {
    res.json(await listBrandExtractions(req.user!.id));
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

libraryRouter.get("/brand/:id", requireApprovedUser, async (req, res) => {
  try {
    const detail = await getBrandDetail(req.params.id, req.user!.id);
    if (!detail) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Brand not found." } });
      return;
    }
    res.json(detail);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

libraryRouter.post("/brand/:id/logo", requireApprovedUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const dataUrl: unknown = req.body?.dataUrl;
    if (typeof dataUrl !== "string" || dataUrl.length === 0) throw new ValidationError("dataUrl is required.");
    const result = await saveBrandLogo({ userId, brandId: id, dataUrl });
    res.json({ url: result.url });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

libraryRouter.get("/ads", requireApprovedUser, async (req, res) => {
  try {
    const brandId = typeof req.query.brandId === "string" ? req.query.brandId : undefined;
    res.json(await listGeneratedAds(req.user!.id, brandId));
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
