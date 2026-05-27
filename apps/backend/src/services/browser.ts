import { chromium, type Browser } from "playwright";
import type { MeasuredSiteData } from "@bya/shared";
import { extractFromPage } from "./extract-in-page.js";
import { ExtractionError } from "../lib/errors.js";

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((e) => {
      browserPromise = null; // allow relaunch on next call if launch failed
      throw e;
    });
  }
  return browserPromise;
}

export async function extractSite(url: string): Promise<MeasuredSiteData> {
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // esbuild (used by tsx) injects __name helpers into compiled function bodies;
    // stub it in the browser context before invoking the serialized function.
    const fnSrc = extractFromPage.toString();
    const data = (await page.evaluate(
      `(function(){var __name=(f)=>f;return (${fnSrc})();})()`
    )) as MeasuredSiteData;
    data.finalUrl = page.url();
    return data;
  } catch (e) {
    throw new ExtractionError(e instanceof Error ? e.message : String(e));
  } finally {
    if (context) await context.close().catch(() => {});
  }
}
