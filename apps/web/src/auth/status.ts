export type AuthStatus = "loading" | "signed-out" | "awaiting-approval" | "approved" | "recovery";

export type Profile = {
  approved: boolean;
  email: string | null;
  is_admin: boolean;
};

/** Pure status derivation. `hasSession` = a Supabase session exists; `profile` = the
 *  user's `profiles` row once loaded (null while still fetching). */
export function deriveStatus(hasSession: boolean, profile: Profile | null): AuthStatus {
  if (!hasSession) return "signed-out";
  if (!profile) return "loading";
  return profile.approved ? "approved" : "awaiting-approval";
}
