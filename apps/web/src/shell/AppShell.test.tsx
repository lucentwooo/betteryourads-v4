import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { useAuth } from "../auth/useAuth";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      email: null,
      signOut: async () => undefined,
    } as ReturnType<typeof useAuth>);
  });

  it("renders the rail brand and its children", () => {
    render(
      <AppShell>
        <div>CHILD</div>
      </AppShell>,
    );
    expect(screen.getByText("BetterYourAds")).toBeInTheDocument();
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });
});
