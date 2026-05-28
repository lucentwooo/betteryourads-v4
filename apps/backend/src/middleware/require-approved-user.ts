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
