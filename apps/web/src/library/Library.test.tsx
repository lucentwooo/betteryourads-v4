import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Library from "./Library";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, api: { getAds: vi.fn() } };
});
import { api } from "../api/client";

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
});
