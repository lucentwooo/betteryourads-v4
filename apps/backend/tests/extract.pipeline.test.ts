import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/browser.js", () => ({
  extractSite: vi.fn(),
}));

import { extractSite } from "../src/services/browser.js";
import { runExtract } from "../src/pipelines/extract.js";
import { ValidationError } from "../src/lib/errors.js";

const valid = {
  title: "Acme", description: "do things",
  colors: { text: [], background: [], border: [], accent_cta: [] },
  cssColorVariables: {}, fonts: { body: null, heading: null, button: null },
  logos: [], text: "hello", finalUrl: "https://acme.com/",
};

describe("runExtract", () => {
  it("rejects a non-http URL before touching the browser", async () => {
    await expect(runExtract("ftp://nope")).rejects.toBeInstanceOf(ValidationError);
    expect(extractSite).not.toHaveBeenCalled();
  });

  it("returns validated MeasuredSiteData for a valid URL", async () => {
    vi.mocked(extractSite).mockResolvedValue(valid as any);
    const out = await runExtract("https://acme.com");
    expect(out.title).toBe("Acme");
  });

  it("throws ValidationError when the browser returns a malformed shape", async () => {
    vi.mocked(extractSite).mockResolvedValue({ title: 123 } as any);
    await expect(runExtract("https://acme.com")).rejects.toBeInstanceOf(ValidationError);
  });
});
