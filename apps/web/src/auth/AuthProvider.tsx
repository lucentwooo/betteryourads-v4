import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { api, setTokenProvider } from "../api/client";
import { deriveStatus, type AuthStatus, type Profile } from "./status";
import { AuthContext, type AuthValue } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);

  // One-time: fetch config, create the Supabase client, wire the API token provider.
  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;

    api.getConfig().then((cfg) => {
      if (!active) return;
      const client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      clientRef.current = client;
      setTokenProvider(async () => {
        const { data } = await client.auth.getSession();
        return data.session?.access_token ?? null;
      });
      const { data: sub } = client.auth.onAuthStateChange((event, s) => {
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        setSession(s);
        setInitialized(true);
      });
      unsub = () => sub.subscription.unsubscribe();
      setSupabase(client);
    });

    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  // Load the profile row whenever the session's user changes.
  useEffect(() => {
    const client = clientRef.current;
    const uid = session?.user?.id;
    if (!client || !uid) {
      setProfile(null);
      return;
    }
    let active = true;
    client
      .from("profiles")
      .select("approved,email,is_admin")
      .eq("id", uid)
      .single<Profile>()
      .then(({ data }) => {
        if (active) setProfile(data ?? null);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const status: AuthStatus = recovery
    ? "recovery"
    : !initialized
      ? "loading"
      : deriveStatus(Boolean(session), profile);

  const value: AuthValue = {
    status,
    userId: session?.user?.id ?? null,
    email: profile?.email ?? session?.user?.email ?? null,
    profile,
    supabase,
    signOut: async () => {
      setRecovery(false);
      await clientRef.current?.auth.signOut();
    },
    clearRecovery: () => setRecovery(false),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
