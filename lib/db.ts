import { supabaseAdmin } from "@/lib/supabase-admin";

// Count this user's successful generations all-time. Enforces the per-account
// lifetime free cap (admins are exempt). Ported from server.js generationsTotal.
export async function generationsTotal(userId: string): Promise<number> {
  if (!supabaseAdmin) throw new Error("Supabase is not configured on the server (.env).");
  const { count, error } = await supabaseAdmin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return count || 0;
}

// Best-effort: log one successful generation. A failure here must not fail the
// already-completed (paid) generation, so we only warn. Ported from server.js
// recordGeneration.
export async function recordGeneration(userId: string): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("generations").insert({ user_id: userId });
  if (error) console.error("Failed to record generation for", userId, "-", error.message);
}
