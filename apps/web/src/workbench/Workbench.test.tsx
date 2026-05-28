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
      concepts: vi.fn(),
      startBatch: vi.fn(),
      getBatch: vi.fn(),
      getConfig: vi.fn(),
      getBrand: vi.fn(),
      getUsage: vi.fn(),
      getReferenceAds: vi.fn(),
    },
  };
});
import { api } from "../api/client";

const idea = (n: number) => ({
  idea_number: n, idea_name: `Idea${n}`, main_hook: "hook text", cta: "Sign up",
  awareness_level: "Pain aware", core_angle: "", customer_context: "", customer_pain_or_desire: "",
  customer_insight: "", belief_to_shift: "", supporting_message: "", why_this_could_work: "",
  proof_or_reason_to_believe: "", safe_claims_used: [], claims_to_avoid: [],
  visual_direction_for_later: "", brand_dna_fields_used: [],
});

describe("Workbench concept→batch flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getUsage).mockResolvedValue({ unlimited: false, used: 0, limit: 10, remaining: 10 });
    vi.mocked(api.getReferenceAds).mockResolvedValue([]);
  });

  it("drives URL → concepts → pick → assets → batch done", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: { brand_name: "Acme" } } } as never);
    vi.mocked(api.concepts).mockResolvedValue({ id: "cs1", conceptSet: { ad_ideas: [idea(1), idea(2)], recommended_top_3: [] } } as never);
    vi.mocked(api.startBatch).mockResolvedValue({ batchId: "b1" } as never);
    vi.mocked(api.getBatch).mockResolvedValue({
      id: "b1", status: "done",
      items: [{ id: "i1", ideaNumber: 1, ideaName: "Idea1", status: "done", imageUrl: "https://img/out.png", error: null }],
    } as never);

    const { container } = render(<MemoryRouter><Workbench /></MemoryRouter>);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));

    await waitFor(() => expect(screen.getByText(/pick your concepts/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Idea1/ }));
    fireEvent.click(screen.getByRole("button", { name: /add assets/i }));

    await waitFor(() => expect(screen.getByText(/add assets per concept/i)).toBeInTheDocument());

    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [new File(["r"], "ref.png", { type: "image/png" })] } });
    fireEvent.change(fileInputs[1], { target: { files: [new File(["l"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /make my ads/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /make my ads/i }));

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https://img/out.png"));
    expect(vi.mocked(api.startBatch).mock.calls[0][0].items).toHaveLength(1);
  });

  it("shows an error when analysis fails", async () => {
    vi.mocked(api.extract).mockRejectedValue(new Error("nope"));
    render(<MemoryRouter><Workbench /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });

  it("shows an error when concept generation fails", async () => {
    vi.mocked(api.extract).mockResolvedValue({ title: "Acme" } as never);
    vi.mocked(api.brand).mockResolvedValue({ id: "be1", brandExtraction: { brand_identity: {} } } as never);
    vi.mocked(api.concepts).mockRejectedValue(new Error("concept boom"));
    render(<MemoryRouter><Workbench /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /analyze brand/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument());
  });
});
