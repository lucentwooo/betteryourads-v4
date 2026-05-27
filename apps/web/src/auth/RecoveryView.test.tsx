import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecoveryView } from "./RecoveryView";
import { useAuth } from "./useAuth";

vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));

const updateUser = vi.fn();
const clearRecovery = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ error: null });
  vi.mocked(useAuth).mockReturnValue({ supabase: { auth: { updateUser } }, clearRecovery } as unknown as ReturnType<typeof useAuth>);
});

describe("RecoveryView", () => {
  it("updates the password and clears recovery on success", async () => {
    render(<RecoveryView />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "newpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "newpass1" }));
    await waitFor(() => expect(clearRecovery).toHaveBeenCalled());
  });

  it("shows an error and does not clear recovery on failure", async () => {
    updateUser.mockResolvedValue({ error: { message: "Too weak" } });
    render(<RecoveryView />);
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /set password/i }));
    await waitFor(() => expect(screen.getByText("Too weak")).toBeInTheDocument());
    expect(clearRecovery).not.toHaveBeenCalled();
  });
});
