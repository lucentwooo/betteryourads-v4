export type AuthStatus = "loading" | "signed-out" | "awaiting-approval" | "approved" | "recovery" | "error";

export type Profile = {
  approved: boolean;
  email: string | null;
  is_admin: boolean;
};

/** The state of the user's `profiles` row lookup: still in flight, finished (with the row
 *  or null when none exists), or failed (RLS denial, missing table, network error). */
export type ProfileLoad =
  | { state: "loading" }
  | { state: "loaded"; profile: Profile | null }
  | { state: "error" };

/** Pure status derivation. `hasSession` = a Supabase session exists; `load` = the result of
 *  the profile lookup. A failed lookup resolves to "error" (not endless loading), and a
 *  finished lookup with no row resolves to "awaiting-approval" (not approved yet). */
export function deriveStatus(hasSession: boolean, load: ProfileLoad): AuthStatus {
  if (!hasSession) return "signed-out";
  if (load.state === "loading") return "loading";
  if (load.state === "error") return "error";
  return load.profile?.approved ? "approved" : "awaiting-approval";
}
