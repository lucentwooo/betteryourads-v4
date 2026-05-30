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
vi.mock("../board/Board", () => ({
  default: ({ brandId }: { brandId: string }) => <div>board:{brandId}</div>,
}));
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getBrands: vi.fn(), getAds: vi.fn() } };
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
  it("renders the concept board for the most-recent brand", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([
      { id: "b9", websiteUrl: "https://x.com", updatedAt: "2026-05-30" },
      { id: "b1", websiteUrl: "https://old.com", updatedAt: "2026-01-01" },
    ]);
    renderHome();
    await waitFor(() => expect(screen.getByText("board:b9")).toBeInTheDocument());
  });

  it("shows the onboarding CTA when there are no brands", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    renderHome();
    await waitFor(() => expect(screen.getByText(/let's learn your brand/i)).toBeInTheDocument());
  });
});
