import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Home";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getBrands: vi.fn(), getAds: vi.fn() } };
});
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ email: "a@b.com" } as ReturnType<typeof useAuth>);
});

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

describe("Home", () => {
  it("shows stats, recent ads, and saved-brand pills", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([
      { id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-05-28T00:00:00Z" },
    ]);
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/x.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    renderHome();
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://signed/x.png"));
    // a brand pill links to /create?brandId=b1
    const reuse = screen.getByRole("link", { name: /acme\.com/i });
    expect(reuse).toHaveAttribute("href", "/create?brandId=b1");
    // primary CTA links to /create
    expect(screen.getByRole("link", { name: /make .*ad/i })).toHaveAttribute("href", "/create");
  });

  it("renders without crashing when there is no data", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderHome();
    await waitFor(() => expect(screen.getByRole("link", { name: /make .*ad/i })).toBeInTheDocument());
  });

  it("shows an error state with a retry when a fetch fails", async () => {
    vi.mocked(api.getBrands).mockResolvedValue([]);
    vi.mocked(api.getAds).mockRejectedValue(new ApiError("Server error", "INTERNAL", 500, "persistence"));
    renderHome();
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    // The success stats line is not shown in the error state.
    expect(screen.queryByText(/ads generated/i)).not.toBeInTheDocument();
  });
});
