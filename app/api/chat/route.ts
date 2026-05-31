import { NextRequest, NextResponse } from "next/server";
import { getApprovedUser } from "@/lib/auth-guard";
import { OPENROUTER_API_KEY, STAGE1_MODEL, STAGE2_MODEL } from "@/lib/env";
import { chatModelAllowlist } from "@/lib/models";

// ── OpenRouter proxy. Model is pinned per-stage from env; key never leaves the server. ──
// Mirrors server.js POST /chat, including its nested {error:{message}} error shape.
export async function POST(req: NextRequest) {
  const auth = await getApprovedUser(req);
  if (auth instanceof NextResponse) return auth;

  const apiKey = OPENROUTER_API_KEY();
  if (!apiKey) {
    return NextResponse.json({ error: { message: "OPENROUTER_API_KEY is not set in .env" } }, { status: 500 });
  }

  let body:
    | { stage?: unknown; messages?: unknown; online?: unknown; model?: unknown }
    | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const { stage, messages, online, model: requestedModel } = body || {};
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: { message: "messages array is required" } }, { status: 400 });
  }

  let model = Number(stage) === 2 ? STAGE2_MODEL() : STAGE1_MODEL();
  if (!model) {
    return NextResponse.json({ error: { message: "Model for stage " + stage + " is not set in .env" } }, { status: 500 });
  }
  // Admin picker may override the pinned default, but only with a model from the server-side
  // allowlist — an arbitrary client-supplied model is ignored (secret-keeping-proxy invariant).
  if (typeof requestedModel === "string" && chatModelAllowlist().includes(requestedModel)) model = requestedModel;
  // Stage 1 can opt into web search via :online. Stage 2 sends an image, where :online conflicts.
  if (online && Number(stage) !== 2 && !model.endsWith(":online")) model += ":online";

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    // Forward OpenRouter's response verbatim so the client reads the usual shape.
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: { message: e instanceof Error ? e.message : String(e) } }, { status: 502 });
  }
}
