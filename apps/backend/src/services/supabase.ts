import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandExtraction, AdPrompt } from "@bya/shared";
import { PersistenceError } from "../lib/errors.js";

// Service-role Supabase client + typed persistence. Server-only: this key bypasses RLS,
// so every write sets user_id explicitly (never relies on auth.uid()). Reads/writes throw
// PersistenceError; lookups return null when absent. Never reaches the browser.
let client: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase service-role credentials are not configured.");
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export async function getUserFromToken(
  token: string,
): Promise<{ id: string; email: string | null } | null> {
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function isApproved(userId: string): Promise<boolean> {
  const { data, error } = await admin().from("profiles").select("approved").eq("id", userId).single();
  if (error || !data) return false;
  return data.approved === true;
}

/** Narrow an untyped Supabase row to its `id`. The client has no generated types here. */
function rowId(data: unknown): string {
  if (typeof data !== "object" || data === null || typeof (data as Record<string, unknown>).id !== "string") {
    throw new PersistenceError("Row returned no id.");
  }
  return (data as { id: string }).id;
}

export async function saveBrandExtraction(args: {
  userId: string;
  url: string;
  brandExtraction: BrandExtraction;
  measuredSiteData: unknown;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .upsert(
      {
        user_id: args.userId,
        website_url: args.url,
        analysis: args.brandExtraction,
        measured_site_data: args.measuredSiteData ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,website_url" },
    )
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the brand extraction failed: ${error?.message ?? "no row"}`);
  return { id: rowId(data) };
}

export async function getBrandExtraction(id: string): Promise<BrandExtraction | null> {
  const { data, error } = await admin().from("brand_extractions").select("analysis").eq("id", id).single();
  if (error || !data) return null;
  const parsed = BrandExtraction.safeParse((data as { analysis: unknown }).analysis);
  return parsed.success ? parsed.data : null;
}

export async function saveAdPrompt(args: {
  userId: string;
  brandExtractionId: string | null;
  variant: "no_asset" | "w_asset";
  adPrompt: AdPrompt;
  userDirection: unknown;
  model: string;
}): Promise<{ id: string }> {
  const { data, error } = await admin()
    .from("ad_prompts")
    .insert({
      user_id: args.userId,
      brand_extraction_id: args.brandExtractionId,
      variant: args.variant,
      ad_prompt_json: args.adPrompt,
      user_direction: args.userDirection ?? null,
      model: args.model,
    })
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the ad prompt failed: ${error?.message ?? "no row"}`);
  return { id: rowId(data) };
}

export async function getAdPrompt(id: string): Promise<AdPrompt | null> {
  const { data, error } = await admin().from("ad_prompts").select("ad_prompt_json").eq("id", id).single();
  if (error || !data) return null;
  const parsed = AdPrompt.safeParse((data as { ad_prompt_json: unknown }).ad_prompt_json);
  return parsed.success ? parsed.data : null;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function persistRenderedAd(args: {
  userId: string;
  imageUrl: string; // KIE-hosted result URL (temporary)
  prompt: string; // ad_prompt JSON, stored for reference on the row
  aspectRatio: string | null;
  resolution: string | null;
  adPromptId?: string | null;
}): Promise<{ id: string; imageUrl: string }> {
  let bytes: Buffer;
  try {
    const resp = await fetch(args.imageUrl);
    if (!resp.ok) throw new PersistenceError(`Could not download the rendered image (HTTP ${resp.status}).`);
    bytes = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    if (e instanceof PersistenceError) throw e;
    throw new PersistenceError(`Could not download the rendered image: ${e instanceof Error ? e.message : String(e)}`);
  }

  const imagePath = `${args.userId}/${randomUUID()}.png`;
  const up = await admin().storage.from("ads").upload(imagePath, bytes, { contentType: "image/png", upsert: false });
  if (up.error) throw new PersistenceError(`Uploading the rendered image failed: ${up.error.message}`);

  const { data, error } = await admin()
    .from("generated_ads")
    .insert({
      user_id: args.userId,
      ad_prompt_id: args.adPromptId ?? null,
      image_path: imagePath,
      prompt: args.prompt,
      aspect_ratio: args.aspectRatio,
      resolution: args.resolution,
    })
    .select("id")
    .single();
  if (error || !data) throw new PersistenceError(`Saving the ad record failed: ${error?.message ?? "no row"}`);

  const signed = await admin().storage.from("ads").createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) {
    throw new PersistenceError(`Signing the image URL failed: ${signed.error?.message ?? "no url"}`);
  }
  return { id: rowId(data), imageUrl: signed.data.signedUrl };
}

/** Prior generated ads (with performance tags) for a brand, joined to the prompt that
 *  produced them. Derived by query — no dedicated table. Returns undefined when empty so
 *  callers can skip the optional prompt section. */
export async function assemblePerformanceMemory(args: {
  userId: string;
  brandExtractionId: string;
}): Promise<Array<{ performance: unknown; ad_prompt: unknown }> | undefined> {
  const { data, error } = await admin()
    .from("generated_ads")
    .select("performance, ad_prompts!inner ( ad_prompt_json, brand_extraction_id )")
    .eq("user_id", args.userId)
    .eq("ad_prompts.brand_extraction_id", args.brandExtractionId)
    .not("performance", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw new PersistenceError(`Loading performance memory failed: ${error.message}`);
  type PerfRow = { performance: unknown; ad_prompts: { ad_prompt_json: unknown } | null };
  const rows = (data ?? []) as unknown as PerfRow[];
  if (rows.length === 0) return undefined;
  return rows.map((r) => ({ performance: r.performance, ad_prompt: r.ad_prompts?.ad_prompt_json ?? null }));
}
