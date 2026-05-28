import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BrandExtraction, AdPrompt, type BrandSummary, type AdSummary, type BrandDetail, type AdminUser } from "@bya/shared";
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

/** All accounts for the admin dashboard. Auth users (email, created/last-sign-in) joined to
 *  their profile flags (approved, is_admin), newest first. */
export async function listAllUsers(): Promise<AdminUser[]> {
  const { data: list, error: listErr } = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new PersistenceError(`Listing users failed: ${listErr.message}`);

  const { data: profileRows, error: profErr } = await admin().from("profiles").select("id, approved, is_admin");
  if (profErr) throw new PersistenceError(`Listing profiles failed: ${profErr.message}`);
  type ProfileRow = { id: string; approved: boolean; is_admin: boolean };
  const flags = new Map((profileRows as unknown as ProfileRow[]).map((p) => [p.id, p]));

  return list.users
    .map((u) => {
      const p = flags.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        approved: p?.approved ?? false,
        isAdmin: p?.is_admin ?? false,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Delete an auth user. FK `on delete cascade` removes their profile, brand_extractions,
 *  ad_prompts, and generated_ads rows; storage objects are orphaned (acceptable — private
 *  bucket, no public access). */
export async function deleteUser(userId: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(userId);
  if (error) throw new PersistenceError(`Deleting the user failed: ${error.message}`);
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

export async function getBrandExtraction(id: string, userId: string): Promise<BrandExtraction | null> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .select("analysis")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
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

export async function getAdPrompt(id: string, userId: string): Promise<AdPrompt | null> {
  const { data, error } = await admin()
    .from("ad_prompts")
    .select("ad_prompt_json")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const parsed = AdPrompt.safeParse((data as { ad_prompt_json: unknown }).ad_prompt_json);
  return parsed.success ? parsed.data : null;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Remove the just-uploaded storage object after a post-upload failure and build the error
 *  to throw. Keeps the ORIGINAL failure as the primary cause; if cleanup itself fails, that
 *  is appended to the message. Callers `throw` the returned error. */
async function cleanupUpload(imagePath: string, originalMessage: string): Promise<PersistenceError> {
  const removed = await admin().storage.from("ads").remove([imagePath]);
  if (removed.error) {
    return new PersistenceError(`${originalMessage} (cleanup of orphaned upload also failed: ${removed.error.message})`);
  }
  return new PersistenceError(originalMessage);
}

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
  if (error || !data) {
    throw await cleanupUpload(imagePath, `Saving the ad record failed: ${error?.message ?? "no row"}`);
  }

  const signed = await admin().storage.from("ads").createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) {
    throw await cleanupUpload(imagePath, `Signing the image URL failed: ${signed.error?.message ?? "no url"}`);
  }
  return { id: rowId(data), imageUrl: signed.data.signedUrl };
}

export async function listBrandExtractions(userId: string): Promise<BrandSummary[]> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .select("id, website_url, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new PersistenceError(`Listing brand extractions failed: ${error.message}`);
  type Row = { id: string; website_url: string; updated_at: string };
  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => ({ id: r.id, websiteUrl: r.website_url, updatedAt: r.updated_at }));
}

export async function getBrandDetail(id: string, userId: string): Promise<BrandDetail | null> {
  const { data, error } = await admin()
    .from("brand_extractions")
    .select("id, analysis, measured_site_data")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  const row = data as unknown as { id: string; analysis: unknown; measured_site_data: unknown };
  const parsed = BrandExtraction.safeParse(row.analysis);
  if (!parsed.success) return null;
  return { id: row.id, brandExtraction: parsed.data, measuredSiteData: row.measured_site_data ?? null };
}

export async function listGeneratedAds(userId: string): Promise<AdSummary[]> {
  const { data, error } = await admin()
    .from("generated_ads")
    .select("id, image_path, aspect_ratio, resolution, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new PersistenceError(`Listing generated ads failed: ${error.message}`);
  type Row = { id: string; image_path: string; aspect_ratio: string | null; resolution: string | null; created_at: string };
  const rows = (data ?? []) as unknown as Row[];
  const out: AdSummary[] = [];
  for (const r of rows) {
    const signed = await admin().storage.from("ads").createSignedUrl(r.image_path, SIGNED_URL_TTL_SECONDS);
    if (signed.error || !signed.data) {
      // Keep the row visible with an explicit marker rather than silently dropping it.
      out.push({
        id: r.id,
        imageUrl: null,
        imageError: `Signing the image URL failed: ${signed.error?.message ?? "no url"}`,
        aspectRatio: r.aspect_ratio,
        resolution: r.resolution,
        createdAt: r.created_at,
      });
      continue;
    }
    out.push({ id: r.id, imageUrl: signed.data.signedUrl, aspectRatio: r.aspect_ratio, resolution: r.resolution, createdAt: r.created_at });
  }
  return out;
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
