import express, { type Express } from "express";

export function createServer(): Express {
  const app = express();
  // Base64 images (reference ad, logo, product) make request bodies large.
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}
