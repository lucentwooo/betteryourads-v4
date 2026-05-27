import { describe, it, expect } from "vitest";
import { fileToDataUrl } from "./fileToDataUrl";

describe("fileToDataUrl", () => {
  it("resolves a base64 data URL for a file", async () => {
    const file = new File(["hello"], "x.png", { type: "image/png" });
    const url = await fileToDataUrl(file);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
