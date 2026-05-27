import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginView } from "./LoginView";
import { useAuth } from "./useAuth";

vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ supabase: { auth } } as unknown as ReturnType<typeof useAuth>);
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ error: null });
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("LoginView", () => {
  it("signs in with email + password", async () => {
    render(<LoginView />);
    type(/email/i, "a@b.com");
    type(/password/i, "secret1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secret1" }));
  });

  it("shows the error message when sign-in fails", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login" } });
    render(<LoginView />);
    type(/email/i, "a@b.com");
    type(/password/i, "nope");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByText("Invalid login")).toBeInTheDocument());
  });

  it("switches to magic-link mode and sends an OTP", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /magic link/i }));
    type(/email/i, "a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send link/i }));
    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.com", options: { emailRedirectTo: window.location.origin } }));
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
  });

  it("switches to forgot mode and requests a reset", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    type(/email/i, "a@b.com");
    fireEvent.click(screen.getByRole("button", { name: /send reset/i }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", { redirectTo: window.location.origin }));
  });
});
