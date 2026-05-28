import { Router } from "express";
import { toHttpError, ForbiddenError } from "../lib/errors.js";
import { requireApprovedUser } from "../middleware/require-approved-user.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { listAllUsers, deleteUser } from "../services/supabase.js";

export const adminRouter = Router();

adminRouter.get("/admin/users", requireApprovedUser, requireAdmin, async (_req, res) => {
  try {
    res.json(await listAllUsers());
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
