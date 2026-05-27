import { describe, it, expect } from "vitest";
import { runExtract } from "../src/pipelines/extract.js";

const run = process.env.BYA_E2E === "1" ? describe : describe.skip;

run("extract e2e (real Playwright)", () => {
  it("measures a real site", async () => {
    const data = await runExtract("https://example.com");
    expect(data.title.length).toBeGreaterThan(0);
    expect(data.finalUrl).toMatch(/^https?:\/\//);
  }, 90_000);
});
