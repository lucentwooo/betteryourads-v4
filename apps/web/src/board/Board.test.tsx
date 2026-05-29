import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Board from "./Board";
import { ApiError } from "../api/client";
import type { ConceptBoard } from "@bya/shared";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      getConceptBoard: vi.fn(),
      generateConceptBoard: vi.fn(),
      setBrandGoal: vi.fn(),
    },
  };
});
import { api } from "../api/client";

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockClear();
});

const BRAND_ID = "brand-123";

const mockBoard: ConceptBoard = {
  goal: "trials",
  concepts: [
    // focus stage: solution (trials focus = solution, product)
    { angle: "Compare angle", stage: "solution", headline: "We beat the rest", rationale: "Head-to-head" },
    // focus stage: product
    { angle: "Feature angle", stage: "product", headline: "Try the product now", rationale: "Direct" },
    // off-focus stage: unaware
    { angle: "Unaware angle", stage: "unaware", headline: "Hidden cost of manual work", rationale: "Story" },
  ],
};

describe("Board — goal picker (404 → generate flow)", () => {
  it("shows goal picker when getConceptBoard rejects with 404", async () => {
    vi.mocked(api.getConceptBoard).mockRejectedValue(
      new ApiError("Not found", "NOT_FOUND", 404),
    );
    render(<Board brandId={BRAND_ID} />);
    await waitFor(() => expect(screen.getByText(/grow a waitlist/i)).toBeInTheDocument());
    expect(screen.getByText(/get signups/i)).toBeInTheDocument();
    expect(screen.getByText(/convert to paid/i)).toBeInTheDocument();
  });

  it("clicking a goal calls generateConceptBoard then renders concepts", async () => {
    vi.mocked(api.getConceptBoard).mockRejectedValue(
      new ApiError("Not found", "NOT_FOUND", 404),
    );
    vi.mocked(api.generateConceptBoard).mockResolvedValue({ board: mockBoard });

    render(<Board brandId={BRAND_ID} />);
    await waitFor(() => expect(screen.getByText(/grow a waitlist/i)).toBeInTheDocument());

    fireEvent.click(screen.getByText(/grow a waitlist/i));

    await waitFor(() => expect(api.generateConceptBoard).toHaveBeenCalledWith(BRAND_ID, "waitlist"));
    await waitFor(() => expect(screen.getByText("We beat the rest")).toBeInTheDocument());
  });
});

describe("Board — board rendering", () => {
  beforeEach(() => {
    vi.mocked(api.getConceptBoard).mockResolvedValue({ board: mockBoard });
  });

  it("groups concepts by stage and shows focus-stage concepts immediately", async () => {
    render(<Board brandId={BRAND_ID} />);
    // solution is a focus stage for goal=trials — headline visible immediately
    await waitFor(() => expect(screen.getByText("We beat the rest")).toBeInTheDocument());
    // product is also a focus stage
    expect(screen.getByText("Try the product now")).toBeInTheDocument();
  });

  it("collapses off-focus stages behind 'Show N more' and expands on click", async () => {
    render(<Board brandId={BRAND_ID} />);
    await waitFor(() => expect(screen.getByText("We beat the rest")).toBeInTheDocument());

    // unaware is off-focus for trials — headline should be hidden
    expect(screen.queryByText("Hidden cost of manual work")).not.toBeInTheDocument();

    // "Show 1 more" toggle visible
    const showMore = screen.getByText(/show 1 more/i);
    expect(showMore).toBeInTheDocument();

    fireEvent.click(showMore);
    await waitFor(() => expect(screen.getByText("Hidden cost of manual work")).toBeInTheDocument());
  });

  it("Next button is disabled when nothing selected; enables when a concept is selected", async () => {
    render(<Board brandId={BRAND_ID} />);
    await waitFor(() => expect(screen.getByText("We beat the rest")).toBeInTheDocument());

    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).toBeDisabled();

    // click a concept row to select it
    fireEvent.click(screen.getByText("We beat the rest"));
    expect(nextBtn).not.toBeDisabled();
  });

  it("Next saves selected concepts to sessionStorage and navigates to /create", async () => {
    const sessionSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<Board brandId={BRAND_ID} />);
    await waitFor(() => expect(screen.getByText("We beat the rest")).toBeInTheDocument());

    fireEvent.click(screen.getByText("We beat the rest"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(sessionSpy).toHaveBeenCalledWith("bya_selected_brand", BRAND_ID);
    expect(sessionSpy).toHaveBeenCalledWith(
      "bya_selected_concepts",
      expect.stringContaining("We beat the rest"),
    );
    expect(mockPush).toHaveBeenCalledWith("/create");
  });
});

describe("Board — error states", () => {
  it("shows error + try again for non-404 failure on initial load", async () => {
    vi.mocked(api.getConceptBoard).mockRejectedValue(
      new ApiError("Server error", "SERVER_ERROR", 500),
    );
    render(<Board brandId={BRAND_ID} />);
    await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
