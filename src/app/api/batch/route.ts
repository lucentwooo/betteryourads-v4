import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { buildAdPrompt } from "@/lib/stage2";
import { kieUploadBase64, kieCreateTask, kiePoll } from "@/lib/kie";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 800;

async function toDataUrl(file: File): Promise<string> {
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return `data:${file.type};base64,${b64}`;
}

export async function POST(req: Request) {
  // @types/node's global FormData collides with the DOM lib's, stripping the
  // method signatures off req.formData()'s return; the runtime object is a
  // spec-compliant FormData. (TS2352 requires routing through `unknown`.)
  const form = (await req.formData()) as unknown as FormData;
  const brandId = String(form.get("brandId"));
  const conceptIds: string[] = JSON.parse(
    String(form.get("conceptIds") ?? "[]"),
  );
  const inspiration = form.get("inspiration") as File | null;
  if (!brandId || conceptIds.length === 0 || !inspiration) {
    return NextResponse.json(
      { error: "brandId, conceptIds, inspiration required" },
      { status: 400 },
    );
  }
  const db = admin();
  const { data: brand } = await db
    .from("brands")
    .select("extraction_json, logo_path")
    .eq("id", brandId)
    .single();
  if (!brand)
    return NextResponse.json({ error: "brand not found" }, { status: 404 });

  // Store inspiration + create batch.
  const inspPath = `${brandId}/${Date.now()}-insp.png`;
  await db.storage
    .from("inspiration")
    .upload(inspPath, await inspiration.arrayBuffer(), {
      contentType: inspiration.type,
      upsert: true,
    });
  const { data: batch } = await db
    .from("batches")
    .insert({ brand_id: brandId, inspiration_image_path: inspPath })
    .select("id")
    .single();
  if (!batch)
    return NextResponse.json(
      { error: "failed to create batch" },
      { status: 500 },
    );

  const inspirationDataUrl = await toDataUrl(inspiration);
  const logoUrl = brand.logo_path
    ? db.storage.from("logos").getPublicUrl(brand.logo_path).data.publicUrl
    : null;
  const { data: concepts } = await db
    .from("concepts")
    .select("*")
    .in("id", conceptIds);

  // Kick off processing without blocking the HTTP response longer than needed:
  // we await it (maxDuration is generous) so statuses are written; the client polls.
  let failures = 0;
  for (const concept of concepts ?? []) {
    const { data: creative } = await db
      .from("creatives")
      .insert({
        batch_id: batch.id,
        brand_id: brandId,
        concept_id: concept.id,
        status: "generating",
      })
      .select("id")
      .single();
    if (!creative) {
      failures++;
      continue;
    }
    try {
      const { adPrompt, promptText, aspect } = await buildAdPrompt(
        brand.extraction_json,
        concept,
        inspirationDataUrl,
      );
      const inspKieUrl = await kieUploadBase64(
        inspirationDataUrl.split(",")[1],
        "reference.png",
      );
      const inputs = [inspKieUrl];
      if (logoUrl) inputs.push(logoUrl);
      const resolution = env.kieResolution();
      const taskId = await kieCreateTask(
        promptText,
        inputs,
        aspect,
        resolution,
      );
      // poll up to ~5 min
      const deadline = Date.now() + 300000;
      let urls: string[] = [];
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const p = await kiePoll(taskId);
        if (p.state.toLowerCase() === "success") {
          urls = p.urls;
          break;
        }
        if (p.state.toLowerCase() === "fail")
          throw new Error(p.failMsg ?? "KIE failed");
      }
      if (!urls.length) throw new Error("timed out waiting for KIE");
      // download + store
      const imgRes = await fetch(urls[0]);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const imgPath = `${brandId}/${creative.id}.png`;
      await db.storage
        .from("creatives")
        .upload(imgPath, buf, { contentType: "image/png", upsert: true });
      await db
        .from("creatives")
        .update({
          status: "done",
          image_path: imgPath,
          stage2_prompt: adPrompt,
          aspect_ratio: aspect,
          resolution,
          completed_at: new Date().toISOString(),
        })
        .eq("id", creative.id);
    } catch (e) {
      failures++;
      await db
        .from("creatives")
        .update({
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        })
        .eq("id", creative.id);
    }
  }
  const status =
    failures === 0
      ? "done"
      : failures === (concepts?.length ?? 0)
        ? "partial"
        : "partial";
  await db
    .from("batches")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", batch.id);
  return NextResponse.json({ batchId: batch.id });
}
