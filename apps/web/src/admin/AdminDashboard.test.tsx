import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminDashboard from "./AdminDashboard";
import type { AdminUser } from "@bya/shared";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      getAdminUsers: vi.fn(),
      setUserApproval: vi.fn(),
      deleteAdminUser: vi.fn(),
    },
  };
});
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));

import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

const ADMIN_EMAIL = "admin@betteryourads.dev";

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "uid-1",
    email: "alice@example.com",
    approved: false,
    isAdmin: false,
    createdAt: "2026-01-01T00:00:00Z",
    lastSignInAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    email: ADMIN_EMAIL,
    userId: "admin-uid",
    status: "ready",
    error: null,
    profile: null,
    supabase: null,
    signOut: async () => undefined,
    clearRecovery: () => undefined,
  } as unknown as ReturnType<typeof useAuth>);
});

function renderDashboard() {
  return render(<AdminDashboard />);
}

describe("AdminDashboard", () => {
  it("renders account rows after load", async () => {
    const users = [makeUser({ id: "u1", email: "alice@example.com" }), makeUser({ id: "u2", email: "bob@example.com" })];
    vi.mocked(api.getAdminUsers).mockResolvedValue(users);
    renderDashboard();
    expect(await screen.findByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("2 accounts")).toBeInTheDocument();
  });

  it("shows not-authorized block when email is not the admin", async () => {
    vi.mocked(useAuth).mockReturnValue({
      email: "other@example.com",
      userId: "other-uid",
      status: "ready",
      error: null,
      profile: null,
      supabase: null,
      signOut: async () => undefined,
      clearRecovery: () => undefined,
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(api.getAdminUsers).mockResolvedValue([]);
    renderDashboard();
    expect(screen.getByText(/Not authorized/i)).toBeInTheDocument();
    // The table must not be shown even if the load resolves
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows error state with retry when fetch fails", async () => {
    vi.mocked(api.getAdminUsers).mockRejectedValue(
      new ApiError("Server error", "SERVER_ERROR", 500, "persistence"),
    );
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/Server error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("approve button calls setUserApproval and updates row badge", async () => {
    const user = makeUser({ id: "u1", email: "alice@example.com", approved: false });
    vi.mocked(api.getAdminUsers).mockResolvedValue([user]);
    vi.mocked(api.setUserApproval).mockResolvedValue({ ok: true } as never);
    renderDashboard();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(api.setUserApproval).toHaveBeenCalledWith("u1", true));
    expect(await screen.findByText("Approved")).toBeInTheDocument();
  });

  it("revoke button calls setUserApproval and updates row badge", async () => {
    const user = makeUser({ id: "u1", email: "alice@example.com", approved: true });
    vi.mocked(api.getAdminUsers).mockResolvedValue([user]);
    vi.mocked(api.setUserApproval).mockResolvedValue({ ok: true } as never);
    renderDashboard();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(api.setUserApproval).toHaveBeenCalledWith("u1", false));
    expect(await screen.findByText("Pending")).toBeInTheDocument();
  });

  it("self-row guard: admin row shows no action buttons", async () => {
    const self = makeUser({ id: "admin-uid", email: ADMIN_EMAIL, approved: true, isAdmin: true });
    const other = makeUser({ id: "u2", email: "bob@example.com", approved: false });
    vi.mocked(api.getAdminUsers).mockResolvedValue([self, other]);
    renderDashboard();
    await screen.findByText(ADMIN_EMAIL);
    // The "You" badge should appear for the self row
    expect(screen.getByText("You")).toBeInTheDocument();
    // Only one Approve button (for bob), none for self
    expect(screen.getAllByRole("button", { name: /approve/i })).toHaveLength(1);
  });

  it("type-to-confirm delete: requires correct email before delete fires", async () => {
    const user = makeUser({ id: "u1", email: "alice@example.com" });
    vi.mocked(api.getAdminUsers).mockResolvedValue([user]);
    vi.mocked(api.deleteAdminUser).mockResolvedValue({ ok: true } as never);
    renderDashboard();
    await screen.findByText("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: /remove alice@example.com/i }));
    const deleteBtn = screen.getByRole("button", { name: /delete account/i });
    // Delete is disabled before typing the correct text
    expect(deleteBtn).toBeDisabled();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "alice@example.com" } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.click(deleteBtn);
    await waitFor(() => expect(api.deleteAdminUser).toHaveBeenCalledWith("u1"));
    // Row removed from table
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });

  it("refresh button re-calls getAdminUsers", async () => {
    vi.mocked(api.getAdminUsers).mockResolvedValue([]);
    renderDashboard();
    await screen.findByText(/0 accounts/i);

    const updated = [makeUser({ id: "u1", email: "new@example.com" })];
    vi.mocked(api.getAdminUsers).mockResolvedValue(updated);
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
  });
});
