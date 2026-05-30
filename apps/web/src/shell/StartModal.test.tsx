import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StartModal } from "./StartModal";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../data/cache", () => ({
  useResource: () => ({
    data: [
      { id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-01-01" },
      { id: "b2", websiteUrl: "https://globex.io", updatedAt: "2026-01-02" },
    ],
    status: "ready",
    error: null,
    refresh: vi.fn(),
  }),
}));

describe("StartModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<StartModal open={false} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the dialog title when open", () => {
    render(<StartModal open={true} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Which brand?")).toBeInTheDocument();
  });

  it("lists brand hostnames when open with saved brands", () => {
    render(<StartModal open={true} onClose={onClose} />);
    expect(screen.getByText("acme.com")).toBeInTheDocument();
    expect(screen.getByText("globex.io")).toBeInTheDocument();
  });

  it("clicking a brand navigates to /board/<id>", () => {
    render(<StartModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("acme.com"));
    expect(mockPush).toHaveBeenCalledWith("/board/b1");
  });

  it('"Add a new client" navigates to /onboarding', () => {
    render(<StartModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Add a new client"));
    expect(mockPush).toHaveBeenCalledWith("/onboarding");
  });

  it("Escape key calls onClose", () => {
    render(<StartModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the scrim calls onClose", () => {
    render(<StartModal open={true} onClose={onClose} />);
    // The scrim is the modal-scrim div; click it directly
    const scrim = document.querySelector(".modal-scrim")!;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the X button calls onClose", () => {
    render(<StartModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
