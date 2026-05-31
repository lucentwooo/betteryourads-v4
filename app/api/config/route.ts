import { NextResponse } from "next/server";
import {
  STAGE1_MODEL,
  STAGE2_MODEL,
  KIE_IMAGE_MODEL,
  KIE_IMAGE_RESOLUTION,
  IMAGE_BACKEND,
  OPENROUTER_IMAGE_MODEL,
  OPENROUTER_API_KEY,
  KIE_API_KEY,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "@/lib/env";
import { imageModelAllowlist, chatModelAllowlist } from "@/lib/models";

// ── Non-secret config so the UI can show which models are active. ──
// Mirrors server.js GET /config (no auth). Emits ONLY non-secret config +
// SUPABASE_URL/ANON_KEY and the *Configured booleans — never the API keys.
export async function GET() {
  return NextResponse.json({
    stage1Model: STAGE1_MODEL(),
    stage2Model: STAGE2_MODEL(),
    kieModel: KIE_IMAGE_MODEL(),
    kieResolution: KIE_IMAGE_RESOLUTION() || "1K",
    imageBackend: IMAGE_BACKEND(),
    openrouterImageModel: OPENROUTER_IMAGE_MODEL() || "openai/gpt-5.4-image-2",
    openrouterImageModels: imageModelAllowlist(),
    chatModels: chatModelAllowlist(),
    openrouterConfigured: !!OPENROUTER_API_KEY(),
    kieConfigured: !!KIE_API_KEY(),
    supabaseUrl: SUPABASE_URL(),
    supabaseAnonKey: SUPABASE_ANON_KEY(),
  });
}
