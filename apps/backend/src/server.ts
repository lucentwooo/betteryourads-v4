import express, { type Express } from "express";
import { extractRouter } from "./routes/extract.js";
import { configRouter } from "./routes/config.js";
import { brandRouter } from "./routes/brand.js";
import { adPromptRouter } from "./routes/ad-prompt.js";

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", extractRouter);
  app.use("/api", configRouter);
  app.use("/api", brandRouter);
  app.use("/api", adPromptRouter);
  return app;
}
