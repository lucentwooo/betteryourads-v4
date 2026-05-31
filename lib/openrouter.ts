import { asDataUrl } from "@/lib/image-utils";

// ── OpenRouter image-to-image (Stage 3 alternative to KIE; selected via IMAGE_BACKEND).
//    One synchronous chat-completions call with modalities:["image","text"]; the model
//    returns the finished image inline as a base64 data URL. No upload host, no polling. ──
// Ported from server.js openrouterGenerateImage. Server-only.

type GenerateImageOpts = {
  prompt?: string;
  referenceImage?: string | null;
  logoImage?: string | null;
  productImages?: unknown;
  aspect_ratio?: string;
};

type ImageEntry = { image_url?: { url?: string } };
type OpenRouterImageResponse = {
  error?: { message?: string } | string;
  choices?: { message?: { images?: ImageEntry[]; content?: unknown } }[];
};

export async function openrouterGenerateImage(
  apiKey: string,
  model: string,
  { prompt, referenceImage, logoImage, productImages, aspect_ratio }: GenerateImageOpts
): Promise<string[]> {
  const products: string[] = (Array.isArray(productImages) ? productImages : []).filter(Boolean).slice(0, 3);
  const intro =
    "Generate a single finished advertising image. Use the attached images as source material:\n" +
    "1) REFERENCE AD — copy its layout, composition, and visual style.\n" +
    "2) BRAND LOGO — place the brand's real logo as-is; do not redraw or invent a logo.\n" +
    (products.length ? "3+) PRODUCT/UI — feature these exact product visuals; do not invent product UI.\n" : "") +
    "Render an on-brand ad" +
    (aspect_ratio && aspect_ratio !== "auto" ? " with a " + aspect_ratio + " aspect ratio" : "") +
    " following this brief:\n\n";

  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [
    { type: "text", text: intro + String(prompt || "") },
  ];
  for (const img of [referenceImage, logoImage, ...products]) {
    const url = asDataUrl(img);
    if (url) content.push({ type: "image_url", image_url: { url } });
  }

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content }] }),
  });
  let data: OpenRouterImageResponse | null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok || (data && data.error)) {
    const err = data && data.error;
    const errMsg = typeof err === "string" ? err : err && err.message;
    throw new Error(errMsg || "OpenRouter image HTTP " + r.status);
  }
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  const urls = (((msg && msg.images) || []).map((im) => im && im.image_url && im.image_url.url)).filter(Boolean) as string[];
  if (!urls.length) {
    throw new Error("Image model returned no image" + (msg && msg.content ? ": " + String(msg.content).slice(0, 200) : "."));
  }
  return urls;
}
