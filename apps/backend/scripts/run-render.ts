import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "../src/config/index.js";
import { runRender } from "../src/pipelines/render.js";

loadEnvFile(process.cwd());

const [adPromptPath, refPath, logoPath, assetPath] = process.argv.slice(2);
if (!adPromptPath || !refPath || !logoPath) {
  console.error(
    "Usage: npm --workspace @bya/backend run run:render -- <ad-prompt.json> <reference-ad.(png|jpg)> <logo.(png|jpg)> [product-asset.(png|jpg)]",
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
    const adPrompt = JSON.parse(fs.readFileSync(adPromptPath, "utf8"));
    const { imageUrl } = await runRender({
      adPrompt,
      referenceAdImage: toDataUrl(refPath),
      logoImage: toDataUrl(logoPath),
      productAsset: assetPath ? toDataUrl(assetPath) : undefined,
    });
    console.log("imageUrl:", imageUrl);
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
