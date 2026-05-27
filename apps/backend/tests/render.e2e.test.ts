import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runRender } from "../src/pipelines/render.js";

loadEnvFile(process.cwd());

const ref = process.env.BYA_REF_AD_PATH;
const logo = process.env.BYA_LOGO_PATH;
const enabled = process.env.BYA_E2E === "1" && Boolean(ref) && Boolean(logo) && Boolean(process.env.KIE_API_KEY);
const run = enabled ? describe : describe.skip;

function toDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

run("render e2e (real KIE)", () => {
  it("renders an image from an ad prompt + reference + logo", async () => {
    const adPrompt = {
      ad_prompt: {
        goal: "Promote Acme",
        canvas: { aspect_ratio: "1:1" },
        copy: { brand_name: "Acme", headline: "Ship faster" },
      },
    };
    const imageUrl = await runRender({
      adPrompt,
      referenceAdImage: toDataUrl(ref!),
      logoImage: toDataUrl(logo!),
    });
    expect(typeof imageUrl).toBe("string");
    expect(imageUrl).toMatch(/^https?:\/\//);
  }, 180_000);
});
