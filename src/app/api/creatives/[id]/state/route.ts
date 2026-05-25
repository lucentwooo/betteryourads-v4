import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { state } = await req.json();
  if (!["inbox", "kept", "dismissed"].includes(state))
    return NextResponse.json({ error: "bad state" }, { status: 400 });
  const { error } = await admin()
    .from("creatives")
    .update({ state })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
