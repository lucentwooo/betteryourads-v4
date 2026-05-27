import { describe, it, expect } from "vitest";
import { loadEnvFile } from "../src/config/index.js";
import { runExtract } from "../src/pipelines/extract.js";
import { runBrand } from "../src/pipelines/brand.js";

loadEnvFile(process.cwd());

const enabled = process.env.BYA_E2E === "1" && Boolean(process.env.OPENROUTER_API_KEY);
const run = enabled ? describe : describe.skip;

run("brand e2e (real Playwright + OpenRouter)", () => {
  it("extracts then analyzes a real site", async () => {
    const measured = await runExtract("https://stripe.com");
    const brand = await runBrand({ url: "https://stripe.com", measuredSiteData: measured });
    expect(brand.schema_version).toBe(1);
    expect(brand.brand_identity).toBeTruthy();
  }, 180_000);
});
