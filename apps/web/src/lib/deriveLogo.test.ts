import { describe, it, expect } from "vitest";
import { deriveLogoFromUrls } from "./deriveLogo";

describe("deriveLogoFromUrls", () => {
  it("resolves null for an empty list", async () => {
    expect(await deriveLogoFromUrls([])).toBeNull();
  });

  it("resolves null when given only falsy entries", async () => {
    expect(await deriveLogoFromUrls(["", null as unknown as string])).toBeNull();
  });
});
