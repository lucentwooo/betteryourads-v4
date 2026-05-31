import { chromium } from "playwright";
import type { Browser } from "playwright";

// Launch one browser and reuse it across requests. Module caching on the
// long-running Node host (NOT serverless) keeps this a singleton, exactly like
// server.js's module-level `browserPromise`. Server-only.
let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}
