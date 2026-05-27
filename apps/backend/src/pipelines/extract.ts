import { MeasuredSiteData } from "@bya/shared";
import { extractSite } from "../services/browser.js";
import { ValidationError } from "../lib/errors.js";

export async function runExtract(rawUrl: string): Promise<MeasuredSiteData> {
  const url = (rawUrl ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new ValidationError("Provide a valid http(s) URL.");
  }
  const data = await extractSite(url);
  const parsed = MeasuredSiteData.safeParse(data);
  if (!parsed.success) {
    throw new ValidationError("Extraction returned an unexpected shape.");
  }
  return parsed.data;
}
