import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, toHttpError } from "../lib/errors.js";

// The single account allowed into the admin dashboard. Intentionally a specific email rather
// than the `profiles.is_admin` flag, since other accounts may also carry is_admin.
const ADMIN_EMAIL = "admin@betteryourads.dev";

// Runs AFTER requireApprovedUser (which sets req.user from the verified JWT).
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.email?.toLowerCase() !== ADMIN_EMAIL) throw new ForbiddenError("Admin access required.");
    next();
  } catch (err) {
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
}
