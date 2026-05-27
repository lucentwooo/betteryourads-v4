import { loadEnvFile } from "../src/config/index.js";
import { runExtract } from "../src/pipelines/extract.js";

loadEnvFile(process.cwd());

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm --workspace @bya/backend run run:extract -- <https-url>");
  process.exit(1);
}

runExtract(url)
  .then((data) => {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAILED:", err?.message ?? err);
    process.exit(1);
  });
