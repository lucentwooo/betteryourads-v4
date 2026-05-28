import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Workbench from "./Workbench";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      extract: vi.fn(),
      brand: vi.fn(),
      adPrompt: vi.fn(),
      render: vi.fn(),
      getConfig: vi.fn(),
      getBrand: vi.fn(),
      getUsage: vi.fn(),
    },
  };
});
import { api, ApiError } from "../api/client";

describe("Workbench flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getUsage).mockResolvedValue({ unlimited: false, used: 0, limit: 10, remaining: 10 });
  });

  it("drives URL → analyzing → pick-ref → generating → ready", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ id: "brand-1", brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.adPrompt).mockResolvedValue({ id: "prompt-1", adPrompt: { ad_prompt: {} } } as never);
    vi.mocked(api.render).mockResolvedValue({ id: "ad-1", imageUrl: "https://img/out.png" } as never);

    const { container } = render(<MemoryRouter><Workbench /></MemoryRouter>);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /make my ad/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ad/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://img/out.png"));

    // The brand id from /api/brand flows into /api/ad-prompt, and the prompt id from there
    // flows into /api/render, so the saved records stay linked.
    expect(vi.mocked(api.adPrompt).mock.calls[0][0]).toMatchObject({ brandExtractionId: "brand-1" });
    expect(vi.mocked(api.render).mock.calls[0][0]).toMatchObject({ adPromptId: "prompt-1" });
  });

  it("shows an error when analysis fails", async () => {
    vi.mocked(api.extract).mockRejectedValue(new Error("nope"));
    render(<MemoryRouter><Workbench /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });

  it("shows error screen when render fails", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.adPrompt).mockResolvedValue({ adPrompt: { ad_prompt: {} } } as never);
    vi.mocked(api.render).mockRejectedValue(new Error("render exploded"));

    const { container } = render(<MemoryRouter><Workbench /></MemoryRouter>);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /make my ad/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ad/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });

  it("shows the daily-limit message (and no Try again) when render is rate-limited", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.adPrompt).mockResolvedValue({ adPrompt: { ad_prompt: {} } } as never);
    vi.mocked(api.render).mockRejectedValue(
      new ApiError("Daily limit of 10 creatives reached. Try again tomorrow.", "RATE_LIMITED", 429, "render"),
    );

    const { container } = render(<MemoryRouter><Workbench /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByRole("button", { name: /make my ad/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ad/i }));

    await waitFor(() => expect(screen.getByText(/daily limit of 10 creatives reached/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
  });

  it("disables Make my ad and shows the cap message when no creatives remain", async () => {
    vi.mocked(api.getUsage).mockResolvedValue({ unlimited: false, used: 10, limit: 10, remaining: 0 });
    vi.mocked(api.getBrand).mockResolvedValue({
      id: "b1",
      brandExtraction: { brand_identity: { brand_name: "Acme" } },
      measuredSiteData: null,
    } as never);
    const { container } = render(
      <MemoryRouter initialEntries={["/create?brandId=b1"]}><Workbench /></MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByText(/daily limit reached/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /make my ad/i })).toBeDisabled();
  });

  it("presets a saved brand from ?brandId and lands in pick-ref", async () => {
    vi.mocked(api.getBrand).mockResolvedValue({
      id: "b1",
      brandExtraction: { brand_identity: { brand_name: "Acme" } },
      measuredSiteData: null,
    } as never);
    render(
      <MemoryRouter initialEntries={["/create?brandId=b1"]}>
        <Workbench />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());
    // pick-ref shows the "Make my ad" button
    expect(screen.getByRole("button", { name: /make my ad/i })).toBeInTheDocument();
  });
});
