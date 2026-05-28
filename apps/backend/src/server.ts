import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import { extractRouter } from "./routes/extract.js";
import { configRouter } from "./routes/config.js";
import { brandRouter } from "./routes/brand.js";
import { adPromptRouter } from "./routes/ad-prompt.js";
import { renderRouter } from "./routes/render.js";
import { libraryRouter } from "./routes/library.js";
import { adminRouter } from "./routes/admin.js";
import { conceptsRouter } from "./routes/concepts.js";
import { batchRouter } from "./routes/batch.js";

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", extractRouter);
  app.use("/api", configRouter);
  app.use("/api", brandRouter);
  app.use("/api", adPromptRouter);
  app.use("/api", renderRouter);
  app.use("/api", libraryRouter);
  app.use("/api", adminRouter);
  app.use("/api", conceptsRouter);
  app.use("/api", batchRouter);

  // Production: serve the built web app from the same origin as /api, so a deployed frontend
  // needs no CORS config or separate API base URL (the client already calls relative /api).
  // No-op in dev and tests, where apps/web/dist doesn't exist and Vite serves + proxies.
  const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    // SPA fallback: serve index.html for non-/api GETs so client-side routes survive reloads.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }
  return app;
}
