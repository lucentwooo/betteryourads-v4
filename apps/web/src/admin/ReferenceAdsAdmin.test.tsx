import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
import { fileToDataUrl } from "../workbench/fileToDataUrl";

const ADMIN_EMAIL = "admin@betteryourads.dev";

const sampleAd = (id: string, variant: ReferenceAd["variant"] = "with_asset"): ReferenceAd => ({
  id,
  variant,
  label: null,
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
  return render(<ReferenceAdsAdmin />);
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

  it("does NOT render a label input", async () => {
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
    renderPage();
    await screen.findByText(/No reference ads/i);
    // label input had id "ref-label" in old implementation
    expect(document.getElementById("ref-label")).toBeNull();
    // Also check there's no visible label input by placeholder
    expect(screen.queryByPlaceholderText(/Nike shoes/i)).toBeNull();
  });

  it("selecting 3 files calls adminCreateReferenceAd 3 times with null label and refreshes", async () => {
    const newAds = [sampleAd("n1"), sampleAd("n2"), sampleAd("n3")];
    vi.mocked(api.adminCreateReferenceAd)
      .mockResolvedValueOnce(newAds[0])
      .mockResolvedValueOnce(newAds[1])
      .mockResolvedValueOnce(newAds[2]);
    // Initial load returns empty; post-upload refresh returns 3 ads
    vi.mocked(api.getReferenceAds)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(newAds);

    const { container } = renderPage();
    await screen.findByText(/No reference ads/i);

    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
      new File(["c"], "c.png", { type: "image/png" }),
    ];

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });

    await waitFor(() => {
      expect(api.adminCreateReferenceAd).toHaveBeenCalledTimes(3);
    });

    // Each call gets (variant, dataUrl, null)
    expect(api.adminCreateReferenceAd).toHaveBeenCalledWith("with_asset", "data:image/png;base64,FAKE", null);
    // fileToDataUrl called once per file
    expect(fileToDataUrl).toHaveBeenCalledTimes(3);
    // Grid should refresh and show 3 images
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
  });

  it("shows progress message while uploading multiple files", async () => {
    vi.mocked(api.getReferenceAds).mockResolvedValueOnce([]);
    // Make uploads hang so we can observe the progress state
    let resolveUpload!: () => void;
    vi.mocked(api.adminCreateReferenceAd).mockImplementation(
      () => new Promise<ReferenceAd>((res) => { resolveUpload = () => res(sampleAd("x")); }),
    );

    const { container } = renderPage();
    await screen.findByText(/No reference ads/i);

    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
    ];

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });

    // Should show "Uploading 2…" (or similar progress)
    await waitFor(() =>
      expect(screen.getByText(/Uploading 2/i)).toBeInTheDocument()
    );

    resolveUpload();
  });

  it("continues uploading remaining files even when one fails", async () => {
    vi.mocked(api.adminCreateReferenceAd)
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValueOnce(sampleAd("ok1"))
      .mockResolvedValueOnce(sampleAd("ok2"));
    // Initial load returns empty; post-upload refresh returns 2 successful
    vi.mocked(api.getReferenceAds)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sampleAd("ok1"), sampleAd("ok2")]);

    const { container } = renderPage();
    await screen.findByText(/No reference ads/i);

    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
      new File(["c"], "c.png", { type: "image/png" }),
    ];

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files } });

    // All 3 uploads attempted even though first fails
    await waitFor(() => expect(api.adminCreateReferenceAd).toHaveBeenCalledTimes(3));
    // Grid refreshes and shows 2 successful
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
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
