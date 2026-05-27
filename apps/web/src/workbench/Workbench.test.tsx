import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
    },
  };
});
import { api } from "../api/client";

describe("Workbench flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drives URL → analyzing → pick-ref → generating → ready", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.adPrompt).mockResolvedValue({ adPrompt: { ad_prompt: {} } } as never);
    vi.mocked(api.render).mockResolvedValue({ imageUrl: "https://img/out.png" } as never);

    const { container } = render(<Workbench />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));

    await waitFor(() => expect(screen.getByText("Acme")).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /make my ad/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ad/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://img/out.png"));
  });

  it("shows an error when analysis fails", async () => {
    vi.mocked(api.extract).mockRejectedValue(new Error("nope"));
    render(<Workbench />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });

  it("shows error screen when render fails", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.adPrompt).mockResolvedValue({ adPrompt: { ad_prompt: {} } } as never);
    vi.mocked(api.render).mockRejectedValue(new Error("render exploded"));

    const { container } = render(<Workbench />);

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
});
