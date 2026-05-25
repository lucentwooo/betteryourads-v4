import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // @types/node's global FormData collides with the DOM lib's, stripping the
  // method signatures off Request.formData()'s return type; the runtime object
  // is a spec-compliant FormData, so we restore the DOM type. (TS2352 mandates
  // routing through `unknown`.)
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
  const { error: updateError } = await db
    .from("brands")
    .update({ logo_path: path })
    .eq("id", id);
  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  const { data } = db.storage.from("logos").getPublicUrl(path);
  return NextResponse.json({ logoUrl: data.publicUrl, path });
}
