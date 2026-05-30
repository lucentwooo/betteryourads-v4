import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../data/cache", () => ({
  useResource: () => ({ data: [], status: "ready", error: null, refresh: vi.fn() }),
}));

const mockSignOut = vi.fn();

describe("AppShell cog popover", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      email: "user@example.com",
      signOut: mockSignOut,
    } as ReturnType<typeof useAuth>);
    mockSignOut.mockReset();
  });

  it("does not show Sign out initially (popover is closed)", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("shows Sign out after clicking the cog button", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls signOut when Sign out is clicked", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it("closes the popover when Escape is pressed", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("closes the popover when clicking outside", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("cog button has aria-expanded false when closed and true when open", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    const cog = screen.getByRole("button", { name: /account menu/i });
    expect(cog).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(cog);
    expect(cog).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the user email inside the popover", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    // At least one element with this class+text is in the popover
    const emailEl = document.querySelector(".user-menu-email");
    expect(emailEl).toBeInTheDocument();
    expect(emailEl?.textContent).toBe("user@example.com");
  });
});
