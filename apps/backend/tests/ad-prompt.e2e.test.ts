import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runAdPrompt } from "../src/pipelines/ad-prompt.js";

loadEnvFile(process.cwd());

const ref = process.env.BYA_REF_AD_PATH;
const logo = process.env.BYA_LOGO_PATH;
const enabled = process.env.BYA_E2E === "1" && Boolean(ref) && Boolean(logo) && Boolean(process.env.OPENROUTER_API_KEY);
const run = enabled ? describe : describe.skip;

function toDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

run("ad-prompt e2e (real OpenRouter vision)", () => {
  it("produces an AdPrompt from a reference ad + logo", async () => {
    const adPrompt = await runAdPrompt({
      brandExtraction: { brand_identity: { brand_name: "Acme", category: "SaaS" } },
      referenceAdImage: toDataUrl(ref!),
      logoImage: toDataUrl(logo!),
    });
    expect(adPrompt.schema_version).toBe(1);
    expect(adPrompt.ad_prompt).toBeTruthy();
  }, 180_000);
});
