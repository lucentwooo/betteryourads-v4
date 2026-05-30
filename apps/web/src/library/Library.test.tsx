import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Library from "./Library";
import { CacheProvider } from "../data/cache";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockUseSearchParams = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn() } };
});
import { api, ApiError } from "../api/client";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no brandId in search params (unscoped)
  mockUseSearchParams.mockReturnValue({ get: () => null });
});

function renderLibrary() {
  return render(
    <CacheProvider>
      <Library />
    </CacheProvider>,
  );
}

describe("Library — unscoped (no brandId)", () => {
  it("groups ads by brand hostname", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z", brandId: "b1", websiteUrl: "https://acme.com/about" },
      { id: "a2", imageUrl: "https://signed/2.png", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z", brandId: "b1", websiteUrl: "https://acme.com/about" },
      { id: "a3", imageUrl: "https://signed/3.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-26T00:00:00Z", brandId: "b2", websiteUrl: "https://beta.io" },
    ]);
    renderLibrary();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    // Two brand sections: acme.com (2 ads) and beta.io (1 ad)
    expect(screen.getByText(/acme\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/beta\.io/i)).toBeInTheDocument();
  });

  it("shows a fallback 'Other' section for ads with no websiteUrl", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z", brandId: null, websiteUrl: null },
    ]);
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/other/i)).toBeInTheDocument());
  });

  it("shows an empty state when there are no ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });

  it("renders an 'image unavailable' placeholder for an ad with no signed url", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z", brandId: "b1", websiteUrl: "https://acme.com" },
      { id: "a2", imageUrl: null, imageError: "Signing failed", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z", brandId: "b1", websiteUrl: "https://acme.com" },
    ]);
    renderLibrary();
    // Both ads show as role="img" — the first via <img>, the second via <span role="img"> placeholder
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByLabelText(/image unavailable/i)).toBeInTheDocument();
  });

  it("shows an error state with a retry when the fetch fails", async () => {
    vi.mocked(api.getAds).mockRejectedValue(new ApiError("Not authorized", "AUTH_REQUIRED", 401, "auth"));
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/not authorized/i)).toBeInTheDocument());
    expect(screen.queryByText(/no ads yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows heading 'Ad library'", async () => {
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /ad library/i })).toBeInTheDocument();
  });
});

describe("Library — scoped (brandId present)", () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue({ get: (key: string) => (key === "brandId" ? "brand-x" : null) });
  });

  it("calls api.getAds with the brandId", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z", brandId: "brand-x", websiteUrl: "https://acme.com" },
    ]);
    renderLibrary();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    expect(api.getAds).toHaveBeenCalledWith("brand-x");
  });

  it("renders a flat grid (no brand section headings)", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z", brandId: "brand-x", websiteUrl: "https://acme.com" },
      { id: "a2", imageUrl: "https://signed/2.png", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z", brandId: "brand-x", websiteUrl: "https://acme.com" },
    ]);
    renderLibrary();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    // No group heading (h2) with hostname — scoped view is a flat grid
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("shows empty state when no ads match the brand", async () => {
    vi.mocked(api.getAds).mockResolvedValue([]);
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });

  it("shows an error state with retry when the scoped fetch fails", async () => {
    vi.mocked(api.getAds).mockRejectedValue(new ApiError("Server error", "INTERNAL", 500));
    renderLibrary();
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
