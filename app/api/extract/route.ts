import { NextRequest, NextResponse } from "next/server";
import type { BrowserContext } from "playwright";
import { getApprovedUser } from "@/lib/auth-guard";
import { getBrowser } from "@/lib/browser";
import { extractFromPage } from "@/lib/extract";

// Long-running Node host (Render/Docker), not Vercel serverless: Playwright needs
// the Node runtime and a generous timeout. Mirrors server.js POST /extract.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getApprovedUser(req);
  if (auth instanceof NextResponse) return auth;

  let body: { url?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const url = (body && body.url ? String(body.url) : "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Provide a valid http(s) URL." }, { status: 400 });
  }

  let context: BrowserContext | undefined;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const page = await context.newPage();
    // Don't wait for "networkidle": many sites (analytics, ads, websockets) never go
    // idle and would time out. The DOM + load event is all we need for computed styles.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {}); // tolerate slow/never-firing load
    await page.waitForTimeout(2000); // let late styles/fonts settle

    const data = await page.evaluate(extractFromPage);
    data.finalUrl = page.url();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    if (context) await context.close().catch(() => {});
  }
}
