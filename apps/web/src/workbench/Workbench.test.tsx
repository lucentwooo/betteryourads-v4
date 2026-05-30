import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Concept } from "@bya/shared";
import Workbench from "./Workbench";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      startBatch: vi.fn(),
      getBatch: vi.fn(),
      getBrand: vi.fn(),
      getUsage: vi.fn(),
      getReferenceAds: vi.fn(),
    },
  };
});
import { api } from "../api/client";

const concept = (n: number): Concept => ({
  angle: `Angle${n}`, stage: "solution", headline: `Headline ${n}`, rationale: "why it works",
});

function stash(concepts: Concept[], brandId = "be1") {
  sessionStorage.setItem("bya_selected_brand", brandId);
  sessionStorage.setItem("bya_selected_concepts", JSON.stringify(concepts));
}

describe("Workbench (board-fed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(api.getUsage).mockResolvedValue({ unlimited: false, used: 0, limit: 10, remaining: 10 });
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
  });

  it("shows the empty state when there is no stashed selection", async () => {
    render(<Workbench />);
    expect(await screen.findByText(/start from your concept board/i)).toBeInTheDocument();
    expect(api.getBrand).not.toHaveBeenCalled();
  });

  it("loads the brand and renders one asset card per stashed concept", async () => {
    stash([concept(1), concept(2)]);
    vi.mocked(api.getBrand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: {} }, measuredSiteData: null } as never);

    render(<Workbench />);

    await waitFor(() => expect(screen.getByText(/drop your reference/i)).toBeInTheDocument());
    expect(api.getBrand).toHaveBeenCalledWith("be1");
    expect(screen.getByText("Headline 1")).toBeInTheDocument();
    expect(screen.getByText("Headline 2")).toBeInTheDocument();
    expect(screen.getByText("Angle1")).toBeInTheDocument();
    // stash is cleared after reading
    expect(sessionStorage.getItem("bya_selected_concepts")).toBeNull();
  });

  it("Make my ads calls startBatch with the concept items, then renders results", async () => {
    stash([concept(1)]);
    vi.mocked(api.getBrand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: {} }, measuredSiteData: null } as never);
    vi.mocked(api.startBatch).mockResolvedValue({ batchId: "b1" } as never);
    vi.mocked(api.getBatch).mockResolvedValue({
      id: "b1", status: "done",
      items: [{ id: "i1", ideaNumber: 1, ideaName: "Headline 1", status: "done", imageUrl: "https://img/out.png", error: null }],
    } as never);

    const { container } = render(<Workbench />);

    await waitFor(() => expect(screen.getByText(/drop your reference/i)).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /make my ad/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ad/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://img/out.png"));

    const call = vi.mocked(api.startBatch).mock.calls[0][0];
    expect(call.items).toHaveLength(1);
    expect(call.items[0].concept.headline).toBe("Headline 1");
    expect(call.brandExtractionId).toBe("be1");
  });

  it("shows the curated reference library in the per-concept asset step", async () => {
    stash([concept(1)]);
    vi.mocked(api.getBrand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: {} }, measuredSiteData: null } as never);
    vi.mocked(api.getReferenceAds).mockResolvedValue([
      { id: "r1", variant: "no_asset", label: "Sample", url: "https://img/ref.png", createdAt: "2026-01-01" },
    ]);

    render(<Workbench />);

    await waitFor(() => expect(screen.getByText(/drop your reference/i)).toBeInTheDocument());
    await waitFor(() => expect(api.getReferenceAds).toHaveBeenCalledWith("no_asset"));
    expect(screen.getByText(/Add a product asset/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Sample/ })).toBeInTheDocument();
  });

  it("shows an error when the brand fails to load", async () => {
    stash([concept(1)]);
    vi.mocked(api.getBrand).mockRejectedValue(new Error("nope"));

    render(<Workbench />);
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });

  it("pre-fills the logo dropzone from brand logoUrl when the brand has one", async () => {
    stash([concept(1)]);
    vi.mocked(api.getBrand).mockResolvedValue({
      id: "be1",
      brandExtraction: { brand_identity: {} },
      measuredSiteData: null,
      logoUrl: "https://cdn.example.com/logo.png",
    } as never);

    // urlToDataUrl uses fetch + FileReader; stub both so the data URL resolves
    const FAKE_DATA_URL = "data:image/png;base64,FAKE";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["logo"], { type: "image/png" })),
    );
    const OrigFileReader = globalThis.FileReader;
    // @ts-expect-error -- jsdom FileReader stub
    globalThis.FileReader = class {
      result = FAKE_DATA_URL;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { Promise.resolve().then(() => this.onloadend?.()); }
    };

    render(<Workbench />);

    await waitFor(() => expect(screen.getByText(/drop your reference/i)).toBeInTheDocument());
    // After prefill the logo dropzone renders an img (Dropzone shows img when value != null)
    await waitFor(() => expect(screen.getByRole("img", { name: /logo/i })).toBeInTheDocument());

    globalThis.FileReader = OrigFileReader;
    fetchSpy.mockRestore();
  });

  it("shows remaining creatives count in the pick-assets step", async () => {
    stash([concept(1)]);
    vi.mocked(api.getBrand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: {} }, measuredSiteData: null } as never);
    vi.mocked(api.getUsage).mockResolvedValue({ unlimited: false, used: 3, limit: 10, remaining: 7 });

    render(<Workbench />);
    await waitFor(() => expect(screen.getByText(/drop your reference/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/7 of 10 creatives left/i)).toBeInTheDocument());
  });

  it("shows 'Daily limit reached' in pick-assets when remaining is 0 and not unlimited", async () => {
    stash([concept(1)]);
    vi.mocked(api.getBrand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: {} }, measuredSiteData: null } as never);
    vi.mocked(api.getUsage).mockResolvedValue({ unlimited: false, used: 10, limit: 10, remaining: 0 });

    render(<Workbench />);
    await waitFor(() => expect(screen.getByText(/drop your reference/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/daily limit reached/i)).toBeInTheDocument());
  });
});
