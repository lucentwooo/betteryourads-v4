import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runAdPrompt } from "../src/pipelines/ad-prompt.js";

loadEnvFile(process.cwd());

const [brandPath, refPath, logoPath, assetPath] = process.argv.slice(2);
if (!brandPath || !refPath || !logoPath) {
  console.error(
    "Usage: npm --workspace @bya/backend run run:ad-prompt -- <brand.json> <reference-ad.(png|jpg)> <logo.(png|jpg)> [product-asset.(png|jpg)]",
  );
  process.exit(1);
}

function toDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

(async () => {
  try {
    const brandExtraction = JSON.parse(fs.readFileSync(brandPath, "utf8"));
    const adPrompt = await runAdPrompt({
      brandExtraction,
      referenceAdImage: toDataUrl(refPath),
      logoImage: toDataUrl(logoPath),
      productAsset: assetPath ? toDataUrl(assetPath) : undefined,
    });
    console.log("schema_version:", adPrompt.schema_version);
    console.log("top-level keys:", Object.keys(adPrompt));
    console.log("ad_prompt.canvas.aspect_ratio:", adPrompt.ad_prompt?.canvas?.aspect_ratio);
    console.log(JSON.stringify(adPrompt, null, 2).slice(0, 2000));
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
