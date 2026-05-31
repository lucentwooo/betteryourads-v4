import { NextRequest, NextResponse } from "next/server";
import { getApprovedUser } from "@/lib/auth-guard";
import {
  OPENROUTER_API_KEY,
  OPENROUTER_IMAGE_MODEL,
  KIE_API_KEY,
  KIE_IMAGE_MODEL,
  KIE_IMAGE_RESOLUTION,
  IMAGE_BACKEND,
} from "@/lib/env";
import { lifetimeLimit } from "@/lib/usage";
import { imageModelAllowlist } from "@/lib/models";
import { kieUploadBase64 } from "@/lib/kie";
import { openrouterGenerateImage } from "@/lib/openrouter";
import { generationsTotal, recordGeneration } from "@/lib/db";

// ── Stage 3 image generation. Reachable at /kie/generate for backward compatibility,
//    but the backend is chosen by IMAGE_BACKEND (kie | openrouter). ──
// Mirrors server.js POST /kie/generate.
export async function POST(req: NextRequest) {
  const auth = await getApprovedUser(req);
  if (auth instanceof NextResponse) return auth;

  const backend = IMAGE_BACKEND();
  let body:
    | {
        prompt?: unknown;
        referenceImage?: unknown;
        logoImage?: unknown;
        productImages?: unknown;
        aspect_ratio?: unknown;
        resolution?: unknown;
        model?: unknown;
      }
    | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const prompt = body?.prompt;
  const referenceImage = body?.referenceImage;
  const logoImage = body?.logoImage;
  const productImages = body?.productImages;
  const model = body?.model;
  let aspect_ratio = typeof body?.aspect_ratio === "string" ? body.aspect_ratio : "";
  let resolution = typeof body?.resolution === "string" ? body.resolution : "";

  if (!prompt || !String(prompt).trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (!referenceImage) return NextResponse.json({ error: "reference image is required" }, { status: 400 });
  if (!logoImage) return NextResponse.json({ error: "brand logo is required" }, { status: 400 });
  aspect_ratio = aspect_ratio || "auto";

  // Enforce the per-account lifetime free cap BEFORE spending money. Admins skip.
  if (!auth.profile.is_admin) {
    let used: number;
    try {
      used = await generationsTotal(auth.user.id);
    } catch (e) {
      return NextResponse.json(
        { error: "Couldn't check your usage: " + (e instanceof Error ? e.message : String(e)) },
        { status: 502 }
      );
    }
    if (used >= lifetimeLimit()) {
      return NextResponse.json(
        { error: "You've used all " + lifetimeLimit() + " of your free creatives. Reach out to unlock more access." },
        { status: 429 }
      );
    }
  }

  // OpenRouter backend: synchronous — return the finished image data URLs directly.
  if (backend === "openrouter") {
    const orKey = OPENROUTER_API_KEY();
    if (!orKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not set in .env" }, { status: 500 });
    const defaultModel = OPENROUTER_IMAGE_MODEL() || "openai/gpt-5.4-image-2";
    // Honor a client-supplied model only if it's in the allowlist (admin picker); else default.
    const orModel = typeof model === "string" && imageModelAllowlist().includes(model) ? model : defaultModel;
    try {
      const urls = await openrouterGenerateImage(orKey, orModel, {
        prompt: String(prompt),
        referenceImage: typeof referenceImage === "string" ? referenceImage : null,
        logoImage: typeof logoImage === "string" ? logoImage : null,
        productImages,
        aspect_ratio,
      });
      await recordGeneration(auth.user.id);
      return NextResponse.json({ urls, done: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }

  // KIE backend (default): upload images, create a task, client polls /kie/result.
  const apiKey = KIE_API_KEY();
  if (!apiKey) return NextResponse.json({ error: "KIE_API_KEY is not set in .env" }, { status: 500 });

  const kieModel = KIE_IMAGE_MODEL() || "gpt-image-2-image-to-image";
  resolution = resolution || KIE_IMAGE_RESOLUTION() || "1K";
  if (aspect_ratio === "1:1" && resolution === "4K") resolution = "2K"; // KIE forbids this combo

  try {
    // Reference ad first, brand logo second, then up to 3 product/UI assets.
    const input_urls = [
      await kieUploadBase64(apiKey, String(referenceImage), "reference.png"),
      await kieUploadBase64(apiKey, String(logoImage), "logo.png"),
    ];
    const products = Array.isArray(productImages) ? productImages.filter(Boolean).slice(0, 3) : [];
    for (let i = 0; i < products.length; i++) {
      input_urls.push(await kieUploadBase64(apiKey, String(products[i]), "product" + (i + 1) + ".png"));
    }
    const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: kieModel,
        input: { prompt: String(prompt).slice(0, 20000), input_urls, aspect_ratio, resolution },
      }),
    });
    let data: { data?: { taskId?: string }; code?: number; msg?: string; message?: string } | null;
    try {
      data = await r.json();
    } catch {
      data = null;
    }
    const taskId = data && data.data && data.data.taskId;
    if (!r.ok || (data && data.code !== 200) || !taskId) {
      return NextResponse.json(
        { error: (data && (data.msg || data.message)) || "KIE createTask HTTP " + r.status },
        { status: 502 }
      );
    }
    await recordGeneration(auth.user.id);
    return NextResponse.json({ taskId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
