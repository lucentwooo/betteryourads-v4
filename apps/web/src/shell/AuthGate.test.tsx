import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthGate } from "./AuthGate";
import { useAuth } from "../auth/useAuth";
import type { AuthStatus } from "../auth/status";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
const mockUseAuth = vi.mocked(useAuth);

const fakeSupabase = { auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOtp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn() } };
const value = (status: AuthStatus) =>
  ({ status, supabase: fakeSupabase, clearRecovery: vi.fn() }) as unknown as ReturnType<typeof useAuth>;

describe("AuthGate", () => {
  beforeEach(() => mockUseAuth.mockReset());

  it("shows a loading screen while loading", () => {
    mockUseAuth.mockReturnValue(value("loading"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("APP")).toBeNull();
  });

  it("renders the login view when signed out", () => {
    mockUseAuth.mockReturnValue(value("signed-out"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByText("APP")).toBeNull();
  });

  it("renders the recovery view in recovery status", () => {
    mockUseAuth.mockReturnValue(value("recovery"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/set a new password/i)).toBeInTheDocument();
  });

  it("shows awaiting-approval when not approved", () => {
    mockUseAuth.mockReturnValue(value("awaiting-approval"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText(/on the list/i)).toBeInTheDocument();
  });

  it("renders children when approved", () => {
    mockUseAuth.mockReturnValue(value("approved"));
    render(<AuthGate><div>APP</div></AuthGate>);
    expect(screen.getByText("APP")).toBeInTheDocument();
  });
});
