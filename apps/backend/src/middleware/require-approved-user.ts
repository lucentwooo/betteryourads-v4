import type { Request, Response, NextFunction } from "express";
import { getUserFromToken, isApproved } from "../services/supabase.js";
import { AuthError, ForbiddenError, toHttpError } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string | null };
    }
  }
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export async function requireApprovedUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  // TEMP (feature/ui-polish-n-temp-login): local dev bypass to unblock UI work. Off unless
  // AUTH_BYPASS=1. Maps requests to a fixed admin so user-scoped reads/writes resolve to a
  // real row. Remove this block (and the AUTH_BYPASS_* env vars) when auth work resumes.
  if (process.env.AUTH_BYPASS === "1") {
    req.user = {
      id: process.env.AUTH_BYPASS_USER_ID ?? "",
      email: process.env.AUTH_BYPASS_EMAIL ?? null,
    };
    next();
    return;
  }
  try {
    const token = bearerToken(req.headers.authorization);
    if (!token) throw new AuthError("Authentication required.");
    const user = await getUserFromToken(token);
    if (!user) throw new AuthError("Authentication required.");
    if (!(await isApproved(user.id))) throw new ForbiddenError("Account not approved.");
    req.user = user;
    next();
  } catch (err) {
    // The middleware runs before the route's own try/catch, so it shapes its own response.
    const { status, body } = toHttpError(err);
    res.status(status).json(body);
  }
}
