import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Dropzone } from "./Dropzone";

describe("Dropzone", () => {
  it("renders the label and calls onPick with a data URL when a file is chosen", async () => {
    const onPick = vi.fn();
    const { container } = render(<Dropzone label="Reference ad" value={null} onPick={onPick} />);
    expect(screen.getByText("Reference ad")).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "ad.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect((onPick.mock.calls[0][0] as string).startsWith("data:image/png;base64,")).toBe(true);
  });

  it("shows a preview image when value is set", () => {
    render(<Dropzone label="Logo" value="data:image/png;base64,AAAA" onPick={() => {}} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });
});
