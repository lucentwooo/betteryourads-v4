import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Home from "./Home";
import { CacheProvider } from "../data/cache";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../auth/useAuth", () => ({ useAuth: () => ({ email: "user@example.com" }) }));
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn(), getBrands: vi.fn() } };
});
import { api } from "../api/client";

beforeEach(() => vi.clearAllMocks());

function renderHome() {
  return render(
    <CacheProvider>
      <Home />
    </CacheProvider>,
  );
}

describe("Home", () => {
  it("shows recent ads once loaded", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    renderHome();
    await waitFor(() => expect(screen.getByText(/recent ads/i)).toBeInTheDocument());
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("shows the empty state when there are no ads", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderHome();
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });
});
