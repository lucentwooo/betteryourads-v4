import express, { type Express } from "express";
import { extractRouter } from "./routes/extract.js";
import { configRouter } from "./routes/config.js";

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", extractRouter);
  app.use("/api", configRouter);
  return app;
}
