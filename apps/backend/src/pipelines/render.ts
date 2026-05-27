import { RenderRequest } from "@bya/shared";
import { uploadBase64, createTask, pollResult } from "../services/kie.js";
import { ValidationError, KieError } from "../lib/errors.js";
import { loadConfig } from "../config/index.js";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

export type RenderInput = {
  adPrompt: unknown;
  referenceAdImage: unknown;
  logoImage: unknown;
  productAsset?: unknown;
};

export type RenderTiming = { pollIntervalMs?: number; pollTimeoutMs?: number };

/** Normalize a free-form aspect ratio to one KIE accepts (ported from legacy mapAspectRatio). */
function mapAspectRatio(ar?: string): string {
  if (!ar) return "auto";
  const s = String(ar).trim();
  if (["1:1", "16:9", "9:16", "4:3", "3:4"].includes(s)) return s;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const r = parseFloat(m[1]) / parseFloat(m[2]);
    if (!isFinite(r) || r <= 0) return "auto";
    if (Math.abs(r - 1) < 0.05) return "1:1";
    if (r > 1) return r >= 1.55 ? "16:9" : "4:3";
    return r <= 0.62 ? "9:16" : "3:4";
  }
  return "auto";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runRender(input: RenderInput, timing: RenderTiming = {}): Promise<string> {
  const parsed = RenderRequest.safeParse(input);
  if (!parsed.success) throw new ValidationError("render request is missing or malformed.");
  const req = parsed.data;
  if (!req.adPrompt.ad_prompt) throw new ValidationError("adPrompt.ad_prompt is required to render.");

  const cfg = loadConfig();
  const aspectRatio = mapAspectRatio(req.adPrompt.ad_prompt.canvas?.aspect_ratio);
  let resolution = cfg.kieResolution || "1K";
  if (aspectRatio === "1:1" && resolution === "4K") resolution = "2K"; // KIE forbids this combo

  const inputUrls = [
    await uploadBase64(req.referenceAdImage, "reference.png"),
    await uploadBase64(req.logoImage, "logo.png"),
  ];
  if (req.productAsset) inputUrls.push(await uploadBase64(req.productAsset, "product1.png"));

  const prompt = JSON.stringify(req.adPrompt.ad_prompt, null, 2);
  const taskId = await createTask({ model: cfg.kieModel, prompt, inputUrls, aspectRatio, resolution });

  const intervalMs = timing.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = timing.pollTimeoutMs ?? POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const poll = await pollResult(taskId);
    const state = poll.state.toLowerCase();
    if (state === "success") {
      if (!poll.urls.length) throw new KieError("Render finished but returned no image.");
      return poll.urls[0];
    }
    if (state === "fail") throw new KieError(`Render failed: ${poll.failMsg || "unknown error"}`);
    if (Date.now() >= deadline) throw new KieError("Render timed out. The task may still finish.");
    await sleep(intervalMs);
  }
}
