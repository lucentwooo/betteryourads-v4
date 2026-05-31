import { OPENROUTER_IMAGE_MODELS, OPENROUTER_CHAT_MODELS, STAGE1_MODEL, STAGE2_MODEL } from "@/lib/env";

// OpenRouter image models the admin UI may pick from (comma-separated IDs in .env).
// Acts as a safety bound: /kie/generate only honors a client-supplied model if it's listed here.
export function imageModelAllowlist(): string[] {
  return String(OPENROUTER_IMAGE_MODELS() || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

// OpenRouter chat models the admin UI may pick from for Stage 1 / Stage 2 (comma-separated
// IDs in .env). Same safety bound as images: /chat only honors a client-supplied model if it
// is listed here. The active stage defaults are always force-included so the picker can never
// be missing whatever STAGE1_MODEL / STAGE2_MODEL currently point at.
export function chatModelAllowlist(): string[] {
  const list = String(OPENROUTER_CHAT_MODELS() || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  [STAGE1_MODEL(), STAGE2_MODEL()].forEach((m) => {
    m = (m || "").trim();
    if (m && !list.includes(m)) list.push(m);
  });
  return list;
}
