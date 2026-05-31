import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getApprovedUser } from "@/lib/auth-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ── Persist a generated ad: download the (temporary) KIE image, store it in
//    Supabase Storage under the user's folder, and insert an `ads` row. ──
// Mirrors server.js POST /library/ads, preserving each distinct 400/502 status.
// Buffer + crypto need the Node runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getApprovedUser(req);
  if (auth instanceof NextResponse) return auth;
  // getApprovedUser already 500s when supabaseAdmin is null, so it's non-null here.
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase is not configured on the server (.env)." }, { status: 500 });
  }

  let body:
    | {
        imageUrl?: unknown;
        brandId?: unknown;
        websiteUrl?: unknown;
        prompt?: unknown;
        aspectRatio?: unknown;
        resolution?: unknown;
      }
    | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const { imageUrl, brandId, websiteUrl, prompt, aspectRatio, resolution } = body || {};
  if (!imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });

  try {
    const imgRes = await fetch(String(imageUrl));
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Could not download image (HTTP " + imgRes.status + ")" }, { status: 502 });
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const adId = randomUUID();
    const path = auth.user.id + "/" + adId + "." + ext;

    const up = await supabaseAdmin.storage.from("ads").upload(path, buffer, { contentType, upsert: false });
    if (up.error) return NextResponse.json({ error: "Storage upload failed: " + up.error.message }, { status: 502 });

    const ins = await supabaseAdmin
      .from("ads")
      .insert({
        id: adId,
        user_id: auth.user.id,
        brand_id: brandId || null,
        website_url: websiteUrl || null,
        image_path: path,
        prompt: prompt || null,
        aspect_ratio: aspectRatio || null,
        resolution: resolution || null,
      })
      .select()
      .single();
    if (ins.error) return NextResponse.json({ error: "Saving record failed: " + ins.error.message }, { status: 502 });

    return NextResponse.json({ ad: ins.data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
