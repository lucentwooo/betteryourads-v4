import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Library from "./Library";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn() } };
});
import { api, ApiError } from "../api/client";

beforeEach(() => vi.clearAllMocks());

describe("Library", () => {
  it("renders a grid of ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
      { id: "a2", imageUrl: "https://signed/2.png", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z" },
    ]);
    render(<MemoryRouter><Library /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  });

  it("shows an empty state when there are no ads", async () => {
    vi.mocked(api.getAds).mockResolvedValue([]);
    render(<MemoryRouter><Library /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/no ads yet/i)).toBeInTheDocument());
  });

  it("renders an 'image unavailable' placeholder for an ad with no signed url", async () => {
    vi.mocked(api.getAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/1.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
      { id: "a2", imageUrl: null, imageError: "Signing failed", aspectRatio: "9:16", resolution: "1K", createdAt: "2026-05-27T00:00:00Z" },
    ]);
    render(<MemoryRouter><Library /></MemoryRouter>);
    // Both ads are present: one real <img>, one placeholder marker.
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByLabelText(/image unavailable/i)).toBeInTheDocument();
  });

  it("shows an error state with a retry when the fetch fails", async () => {
    vi.mocked(api.getAds).mockRejectedValue(new ApiError("Not authorized", "AUTH_REQUIRED", 401, "auth"));
    render(<MemoryRouter><Library /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/not authorized/i)).toBeInTheDocument());
    expect(screen.queryByText(/no ads yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
