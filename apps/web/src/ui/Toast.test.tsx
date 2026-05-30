import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Toast } from "./Toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the message when open", () => {
    render(<Toast message="Your ads are ready" open onDone={vi.fn()} />);
    expect(screen.getByText("Your ads are ready")).toBeInTheDocument();
  });

  it("renders nothing when not open", () => {
    render(<Toast message="Your ads are ready" open={false} onDone={vi.fn()} />);
    expect(screen.queryByText("Your ads are ready")).not.toBeInTheDocument();
  });

  it("calls onDone after ~4500ms", () => {
    const onDone = vi.fn();
    render(<Toast message="Your ads are ready" open onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(4500); });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("does not call onDone before the timer fires", () => {
    const onDone = vi.fn();
    render(<Toast message="Your ads are ready" open onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onDone).not.toHaveBeenCalled();
  });
});
