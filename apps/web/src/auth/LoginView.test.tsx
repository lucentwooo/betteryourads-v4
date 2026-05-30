import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginView } from "./LoginView";
import { useAuth } from "./useAuth";

vi.mock("./useAuth", () => ({ useAuth: vi.fn() }));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ supabase: { auth } } as unknown as ReturnType<typeof useAuth>);
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

// "Sign in" / "Create account" appear on both the mode toggle and the submit
// button, so always submit via the type="submit" button to avoid ambiguity.
function submitForm(container: HTMLElement) {
  fireEvent.click(container.querySelector('button[type="submit"]')!);
}

describe("LoginView", () => {
  it("signs in with email + password", async () => {
    const { container } = render(<LoginView />);
    type(/email/i, "a@b.com");
    type(/password/i, "secret1");
    submitForm(container);
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.com", password: "secret1" }));
  });

  it("shows the error message when sign-in fails", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login" } });
    const { container } = render(<LoginView />);
    type(/email/i, "a@b.com");
    type(/password/i, "nope");
    submitForm(container);
    await waitFor(() => expect(screen.getByText("Invalid login")).toBeInTheDocument());
  });

  it("switches to forgot mode and requests a reset", async () => {
    const { container } = render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    type(/email/i, "a@b.com");
    submitForm(container);
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", { redirectTo: window.location.origin }));
  });

  it("switches to sign-up mode, creates an account, and shows the check-email message", async () => {
    const { container } = render(<LoginView />);
    // Switch into sign-up mode via the toggle (the submit button still reads "Sign in" here).
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    type(/email/i, "a@b.com");
    type(/^password$/i, "secret1");
    type(/re-enter password/i, "secret1");
    submitForm(container);
    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "secret1",
        options: { emailRedirectTo: window.location.origin },
      })
    );
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
  });

  it("blocks sign-up and shows mismatch error when passwords differ", async () => {
    const { container } = render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    type(/email/i, "a@b.com");
    type(/^password$/i, "secret1");
    type(/re-enter password/i, "different");
    submitForm(container);
    await waitFor(() => expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument());
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("sign-in mode does not show the re-enter password field", () => {
    render(<LoginView />);
    // Default mode is sign-in
    expect(screen.queryByLabelText(/re-enter password/i)).not.toBeInTheDocument();
  });

  it("forgot mode does not show the re-enter password field", () => {
    render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    expect(screen.queryByLabelText(/re-enter password/i)).not.toBeInTheDocument();
  });

  it("switching away from sign-up clears the mismatch error", async () => {
    const { container } = render(<LoginView />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    type(/email/i, "a@b.com");
    type(/^password$/i, "secret1");
    type(/re-enter password/i, "different");
    submitForm(container);
    await waitFor(() => expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument());
    // Switch back to sign-in — error should be gone
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(screen.queryByText(/passwords don't match/i)).not.toBeInTheDocument();
  });
});
