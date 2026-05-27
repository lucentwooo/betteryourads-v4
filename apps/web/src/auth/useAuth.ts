import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthStatus, Profile } from "./status";

export type AuthValue = {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  supabase: SupabaseClient | null;
  signOut: () => Promise<void>;
  clearRecovery: () => void;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
