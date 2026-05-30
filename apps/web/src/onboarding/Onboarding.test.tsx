import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import Onboarding from "./Onboarding";

// Mock next/navigation
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock api/client
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      extract: vi.fn(),
      brand: vi.fn(),
      setBrandGoal: vi.fn(),
    },
  };
});
import { api } from "../api/client";
import type { MeasuredSiteData, BrandExtraction } from "@bya/shared";

const measuredData = { url: "https://example.com", colors: [], fonts: [] } as unknown as MeasuredSiteData;
const brandResponse = { id: "brand-123", brandExtraction: {} as BrandExtraction, partialAnalysis: null };

beforeEach(() => {
  vi.clearAllMocks();
  pushMock.mockReset();
});

describe("Onboarding — url step", () => {
  it("renders the url step with a disabled Continue button when input is empty", () => {
    render(<Onboarding />);
    expect(screen.getByRole("heading", { name: /learn your brand/i })).toBeInTheDocument();
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeDisabled();
  });

  it("enables Continue once the user types a URL", () => {
    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });

  it("calls extract then brand and advances to the goal step", async () => {
    vi.mocked(api.extract).mockResolvedValue(measuredData);
    vi.mocked(api.brand).mockResolvedValue(brandResponse);

    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/what are you trying to do/i)).toBeInTheDocument());

    expect(api.extract).toHaveBeenCalledWith("https://example.com");
    expect(api.brand).toHaveBeenCalledWith({ url: "https://example.com", measuredSiteData: measuredData });
  });
});

describe("Onboarding — analyzing step", () => {
  it("shows the hostname and spinner while analyzing", async () => {
    // Never resolves so we stay on analyzing step
    vi.mocked(api.extract).mockReturnValue(new Promise(() => {}));

    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/example\.com/i)).toBeInTheDocument());
    expect(screen.getByText(/learning your colors/i)).toBeInTheDocument();
  });

  it("Back button on the analyzing step returns to the url step with url retained", async () => {
    vi.mocked(api.extract).mockReturnValue(new Promise(() => {}));

    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    // Should be back on url step with the url still present
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("https://example.com");
  });
});

describe("Onboarding — goal step", () => {
  async function reachGoalStep() {
    vi.mocked(api.extract).mockResolvedValue(measuredData);
    vi.mocked(api.brand).mockResolvedValue(brandResponse);

    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/what are you trying to do/i)).toBeInTheDocument());
  }

  it("shows the three goal cards", async () => {
    await reachGoalStep();
    expect(screen.getByText(/grow a waitlist/i)).toBeInTheDocument();
    expect(screen.getByText(/get signups/i)).toBeInTheDocument();
    expect(screen.getByText(/convert to paid/i)).toBeInTheDocument();
  });

  it("Back on the goal step returns to the url step with url retained", async () => {
    await reachGoalStep();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("https://example.com");
  });

  it("selecting a goal calls setBrandGoal then router.push to board", async () => {
    vi.mocked(api.setBrandGoal).mockResolvedValue({ ok: true });
    await reachGoalStep();

    fireEvent.click(screen.getByText(/grow a waitlist/i));

    await waitFor(() => expect(api.setBrandGoal).toHaveBeenCalledWith("brand-123", "waitlist"));
    expect(pushMock).toHaveBeenCalledWith("/board/brand-123");
  });

  it("selecting trials calls setBrandGoal with 'trials'", async () => {
    vi.mocked(api.setBrandGoal).mockResolvedValue({ ok: true });
    await reachGoalStep();

    fireEvent.click(screen.getByText(/get signups/i));

    await waitFor(() => expect(api.setBrandGoal).toHaveBeenCalledWith("brand-123", "trials"));
    expect(pushMock).toHaveBeenCalledWith("/board/brand-123");
  });
});

describe("Onboarding — error handling", () => {
  it("shows an error message and a Try another URL button when extract fails", async () => {
    vi.mocked(api.extract).mockRejectedValue(new Error("Network error"));

    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try another url/i })).toBeInTheDocument();
  });

  it("Try another URL after error returns to url step with prior url retained", async () => {
    vi.mocked(api.extract).mockRejectedValue(new Error("Network error"));

    render(<Onboarding />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /try another url/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /try another url/i }));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("https://example.com");
  });
});
