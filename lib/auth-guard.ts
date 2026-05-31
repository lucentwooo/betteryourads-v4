import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Profile fields the gate reads (server.js: select "approved,is_admin").
type Profile = { approved: boolean; is_admin: boolean };

export type ApprovedUser = { user: User; profile: Profile };

// Gate the cost-incurring endpoints: caller must present a valid Supabase
// access token AND be approved. Prevents bypassing the browser gate. Ported from
// server.js requireApprovedUser — each route calls it and short-circuits if the
// result is a NextResponse. Status codes and JSON bodies are identical.
export async function getApprovedUser(req: NextRequest): Promise<ApprovedUser | NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase is not configured on the server (.env)." }, { status: 500 });
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session. Please sign in again." }, { status: 401 });
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles").select("approved,is_admin").eq("id", userData.user.id).single();
  if (profErr || !profile || !profile.approved) {
    return NextResponse.json({ error: "Your account is awaiting approval." }, { status: 403 });
  }

  return { user: userData.user, profile };
}
