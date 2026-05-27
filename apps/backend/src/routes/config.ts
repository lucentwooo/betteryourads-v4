import { Router } from "express";
import { loadConfig } from "../config/index.js";

export const configRouter = Router();

configRouter.get("/config", (_req, res) => {
  res.json(loadConfig());
});
