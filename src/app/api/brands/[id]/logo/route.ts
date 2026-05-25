import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const form = (await req.formData()) as unknown as FormData;
  const file = form.get("file") as File | null;
  if (!file)
    return NextResponse.json({ error: "file required" }, { status: 400 });
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${id}/logo.${ext}`;
  const db = admin();
  const { error } = await db.storage
    .from("logos")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: true,
    });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("brands").update({ logo_path: path }).eq("id", id);
  const { data } = db.storage.from("logos").getPublicUrl(path);
  return NextResponse.json({ logoUrl: data.publicUrl, path });
}
