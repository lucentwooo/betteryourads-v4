import { NextRequest, NextResponse } from "next/server";
import { getApprovedUser } from "@/lib/auth-guard";
import { generationsTotal } from "@/lib/db";
import { lifetimeLimit } from "@/lib/usage";

// ── Lifetime free-cap usage for the signed-in user. Admins are unlimited. ──
// Mirrors server.js GET /usage.
export async function GET(req: NextRequest) {
  const auth = await getApprovedUser(req);
  if (auth instanceof NextResponse) return auth;

  const limit = lifetimeLimit();
  if (auth.profile.is_admin) return NextResponse.json({ used: 0, limit, isAdmin: true });
  try {
    const used = await generationsTotal(auth.user.id);
    return NextResponse.json({ used, limit, isAdmin: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
