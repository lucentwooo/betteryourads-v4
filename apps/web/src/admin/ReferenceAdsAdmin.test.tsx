import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReferenceAdsAdmin from "./ReferenceAdsAdmin";
import type { ReferenceAd } from "@bya/shared";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      getReferenceAds: vi.fn(),
      adminCreateReferenceAd: vi.fn(),
      adminDeleteReferenceAd: vi.fn(),
    },
  };
});
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../workbench/fileToDataUrl", () => ({
  fileToDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,FAKE"),
}));

import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/useAuth";

const ADMIN_EMAIL = "admin@betteryourads.dev";

const sampleAd = (id: string): ReferenceAd => ({
  id,
  variant: "with_asset",
  label: `Label ${id}`,
  url: `https://signed/${id}.png`,
  createdAt: "2026-05-28T00:00:00Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({
    email: ADMIN_EMAIL,
    userId: "admin-uid",
    session: null,
    signOut: async () => undefined,
  } as unknown as ReturnType<typeof useAuth>);
});

function renderPage() {
  return render(<MemoryRouter><ReferenceAdsAdmin /></MemoryRouter>);
}

describe("ReferenceAdsAdmin", () => {
  it("loads the default tab (with_asset) on mount and shows empty state when list is empty", async () => {
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(api.getReferenceAds).toHaveBeenCalledWith("with_asset"));
    expect(await screen.findByText(/No reference ads/i)).toBeInTheDocument();
  });

  it("renders a grid of thumbnails when ads are returned", async () => {
    vi.mocked(api.getReferenceAds).mockResolvedValue([sampleAd("a1"), sampleAd("a2")]);
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  });

  it("shows not-authorized block when email is not admin", async () => {
    vi.mocked(useAuth).mockReturnValue({
      email: "other@example.com",
      userId: "uid",
      session: null,
      signOut: async () => undefined,
    } as unknown as ReturnType<typeof useAuth>);
    renderPage();
    expect(screen.getByText(/Not authorized/i)).toBeInTheDocument();
    expect(api.getReferenceAds).not.toHaveBeenCalled();
  });

  it("shows an error state with retry when fetch fails", async () => {
    vi.mocked(api.getReferenceAds).mockRejectedValue(
      new ApiError("Server error", "SERVER_ERROR", 500, "persistence"),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Server error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("reloads with no_asset variant when the second tab is clicked", async () => {
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(api.getReferenceAds).toHaveBeenCalledWith("with_asset"));
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("tab", { name: /No product asset/i }));
    await waitFor(() => expect(api.getReferenceAds).toHaveBeenCalledWith("no_asset"));
  });

  it("prepends a new ad after successful upload", async () => {
    const newAd = sampleAd("new1");
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
    vi.mocked(api.adminCreateReferenceAd).mockResolvedValue(newAd);
    const { container } = renderPage();
    await screen.findByText(/No reference ads/i);

    const file = new File(["data"], "img.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
  });

  it("removes an ad after inline delete is confirmed", async () => {
    vi.mocked(api.getReferenceAds).mockResolvedValue([sampleAd("a1"), sampleAd("a2")]);
    vi.mocked(api.adminDeleteReferenceAd).mockResolvedValue(undefined as never);
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));

    // click first "Delete" button to enter confirm state
    const deleteButtons = screen.getAllByRole("button", { name: /^delete reference ad/i });
    fireEvent.click(deleteButtons[0]);
    // confirm button appears
    const confirmBtn = await screen.findByRole("button", { name: /^confirm delete$/i });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
  });
});
