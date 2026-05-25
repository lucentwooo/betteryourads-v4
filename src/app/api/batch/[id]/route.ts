import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = admin();
  const { data: batch } = await db
    .from("batches")
    .select("*")
    .eq("id", id)
    .single();
  const { data: creatives } = await db
    .from("creatives")
    .select("*")
    .eq("batch_id", id)
    .order("created_at");
  const withUrls = (creatives ?? []).map((c) => ({
    ...c,
    imageUrl: c.image_path
      ? db.storage.from("creatives").getPublicUrl(c.image_path).data.publicUrl
      : null,
  }));
  return NextResponse.json({ batch, creatives: withUrls });
}
