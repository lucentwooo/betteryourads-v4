import { Router } from "express";
import { toHttpError, ForbiddenError, ValidationError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { listAllUsers, deleteUser, setUserApproved, createReferenceAd, deleteReferenceAd } from "../services/supabase.js";
import { ReferenceAdVariant } from "@bya/shared";

export const adminRouter = Router();

adminRouter.get("/admin/users", requireApprovedUser, requireAdmin, async (_req, res) => {
  try {
    res.json(await listAllUsers());
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

adminRouter.patch("/admin/users/:id/approval", requireApprovedUser, requireAdmin, async (req, res) => {
  try {
    const approved = req.body?.approved;
    if (typeof approved !== "boolean") throw new ValidationError("`approved` must be a boolean.");
    // Guard against an admin revoking their own approval and locking themselves out.
    if (req.params.id === req.user!.id) throw new ForbiddenError("You can't change your own approval.");
    await setUserApproved(req.params.id, approved);
    res.json({ ok: true });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

adminRouter.delete("/admin/users/:id", requireApprovedUser, requireAdmin, async (req, res) => {
  try {
    // Guard against an admin deleting their own account and locking themselves out.
    if (req.params.id === req.user!.id) throw new ForbiddenError("You can't delete your own account.");
    await deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

adminRouter.post("/admin/reference-ads", requireApprovedUser, requireAdmin, async (req, res) => {
  try {
    const variant = ReferenceAdVariant.safeParse(req.body?.variant);
    if (!variant.success) throw new ValidationError("`variant` must be 'with_asset' or 'no_asset'.");
    const dataUrl = req.body?.dataUrl;
    if (typeof dataUrl !== "string" || dataUrl.length === 0) throw new ValidationError("`dataUrl` is required.");
    const rawLabel = req.body?.label;
    const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim() : null;
    const created = await createReferenceAd({ variant: variant.data, label, dataUrl, createdBy: req.user!.id });
    res.json(created);
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});

adminRouter.delete("/admin/reference-ads/:id", requireApprovedUser, requireAdmin, async (req, res) => {
  try {
    await deleteReferenceAd(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
});
