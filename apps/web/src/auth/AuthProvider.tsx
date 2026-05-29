"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { api, setTokenProvider, ApiError } from "../api/client";
import { deriveStatus, type AuthStatus, type Profile, type ProfileLoad } from "./status";
import { AuthContext, type AuthValue } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profileLoad, setProfileLoad] = useState<ProfileLoad>({ state: "loading" });
  const [initialized, setInitialized] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  // Known limitation: Supabase replays the last session as INITIAL_SESSION (not
  // PASSWORD_RECOVERY) on a fresh client, so the recovery flag does not survive an
  // AuthProvider remount. Acceptable: recovery is a single-shot flow off an email link.
  const [recovery, setRecovery] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);

  // One-time: fetch config, create the Supabase client, wire the API token provider.
  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;

    api
      .getConfig()
      .then((cfg) => {
        if (!active) return;
        // A reachable config that lacks Supabase credentials (notably the browser anon key)
        // can't drive auth — surface it instead of creating a broken client.
        if (!cfg.supabaseConfigured || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          setConfigError("Authentication is not configured. Check the Supabase environment variables.");
          setInitialized(true);
          return;
        }
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
      })
      .catch((e) => {
        if (!active) return;
        // Backend down / /api/config unreachable: don't leave the gate stuck on "loading".
        setConfigError(e instanceof ApiError ? e.message : "Could not reach the server to start sign-in.");
        setInitialized(true);
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
      setProfileLoad({ state: "loaded", profile: null });
      return;
    }
    let active = true;
    setProfileLoad({ state: "loading" });
    client
      .from("profiles")
      .select("approved,email,is_admin")
      .eq("id", uid)
      .single<Profile>()
      .then(({ data, error }) => {
        if (!active) return;
        // PGRST116 = "no rows": a missing profile row is a known, recoverable state
        // (awaiting-approval), not a hard error. Any other error is a real failure.
        if (error && error.code !== "PGRST116") {
          setProfileLoad({ state: "error" });
          return;
        }
        setProfileLoad({ state: "loaded", profile: data ?? null });
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const profile = profileLoad.state === "loaded" ? profileLoad.profile : null;
  const status: AuthStatus = recovery
    ? "recovery"
    : configError
      ? "error"
      : !initialized
        ? "loading"
        : deriveStatus(Boolean(session), profileLoad);

  const value: AuthValue = {
    status,
    error: configError ?? (status === "error" ? "We couldn't load your account. Please try again." : null),
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
