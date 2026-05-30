import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell } from "./AppShell";

const mockPush = vi.fn();
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({ email: "user@test.com", signOut: vi.fn() }),
}));

vi.mock("../data/cache", () => ({
  useResource: () => ({
    data: [
      { id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-01-01" },
      { id: "b2", websiteUrl: "https://globex.io", updatedAt: "2026-01-02" },
    ],
    status: "ready",
    error: null,
    refresh: vi.fn(),
  }),
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
  });

  it("renders child content", () => {
    render(<AppShell><div>hello</div></AppShell>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders brand hostnames in the rail", () => {
    render(<AppShell><div /></AppShell>);
    expect(screen.getByText("acme.com")).toBeInTheDocument();
    expect(screen.getByText("globex.io")).toBeInTheDocument();
  });

  it('"Make an ad" opens the start modal showing "Which brand?"', () => {
    render(<AppShell><div /></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Make an ad" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Which brand?")).toBeInTheDocument();
  });

  it("cog button toggles the account popover", () => {
    render(<AppShell><div /></AppShell>);
    const cog = screen.getByRole("button", { name: /account menu/i });
    fireEvent.click(cog);
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    fireEvent.click(cog);
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });
});
