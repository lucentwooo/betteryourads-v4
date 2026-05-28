import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getConfig: vi.fn() }, setTokenProvider: vi.fn() };
});
import { api } from "../api/client";

let authStateCb: ((event: AuthChangeEvent, session: Session | null) => void) | null = null;
const profileResult = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (e: AuthChangeEvent, s: Session | null) => void) => {
        authStateCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: async () => ({ data: { session: null } }),
      signOut: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve(profileResult()) }) }) }),
  }),
}));

function Probe() {
  const { status, error } = useAuth();
  return <div>status:{status}{error ? ` err:${error}` : ""}</div>;
}

const okConfig = { supabaseConfigured: true, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" };

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCb = null;
  });

  it("exits loading into an error state when /api/config is unreachable", async () => {
    vi.mocked(api.getConfig).mockRejectedValue(new Error("network down"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/status:error/)).toBeInTheDocument());
  });

  it("shows an error when Supabase is reported unconfigured (e.g. missing anon key)", async () => {
    vi.mocked(api.getConfig).mockResolvedValue({ ...okConfig, supabaseConfigured: false, supabaseAnonKey: "" } as never);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText(/status:error/)).toBeInTheDocument());
  });

  it("exits loading into an error state when the profile lookup fails", async () => {
    vi.mocked(api.getConfig).mockResolvedValue(okConfig as never);
    profileResult.mockReturnValue({ data: null, error: { code: "42501", message: "permission denied" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(authStateCb).not.toBeNull());
    act(() => authStateCb!("SIGNED_IN", { user: { id: "u1" } } as Session));
    await waitFor(() => expect(screen.getByText(/status:error/)).toBeInTheDocument());
  });

  it("treats a missing profile row as awaiting-approval, not loading", async () => {
    vi.mocked(api.getConfig).mockResolvedValue(okConfig as never);
    profileResult.mockReturnValue({ data: null, error: { code: "PGRST116", message: "no rows" } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(authStateCb).not.toBeNull());
    act(() => authStateCb!("SIGNED_IN", { user: { id: "u1" } } as Session));
    await waitFor(() => expect(screen.getByText(/status:awaiting-approval/)).toBeInTheDocument());
  });
});
