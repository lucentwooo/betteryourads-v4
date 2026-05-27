import { loadEnvFile } from "../src/config/index.js";
import { runExtract } from "../src/pipelines/extract.js";
import { runBrand } from "../src/pipelines/brand.js";

loadEnvFile(process.cwd());

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm --workspace @bya/backend run run:brand -- <https-url>");
  process.exit(1);
}

(async () => {
  try {
    const measuredSiteData = await runExtract(url);
    const brand = await runBrand({ url, measuredSiteData });
    console.log(JSON.stringify(brand, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
