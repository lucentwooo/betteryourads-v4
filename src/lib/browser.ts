import { chromium, type Browser } from "playwright";
let p: Promise<Browser> | null = null;
export function getBrowser(): Promise<Browser> {
  if (!p) p = chromium.launch({ headless: true });
  return p;
}
