import { z } from "zod";
import { BrandExtraction } from "./brand-extraction.js";

/** Row summary for the saved-brands list (GET /api/brands). */
export const BrandSummary = z.object({
  id: z.string(),
  websiteUrl: z.string(),
  updatedAt: z.string(),
});
export type BrandSummary = z.infer<typeof BrandSummary>;

/** Row summary for the library (GET /api/ads). imageUrl is a freshly-signed Storage URL. */
export const AdSummary = z.object({
  id: z.string(),
  imageUrl: z.string(),
  aspectRatio: z.string().nullable(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});
export type AdSummary = z.infer<typeof AdSummary>;

/** Full saved brand for reuse (GET /api/brand/:id). measuredSiteData is opaque jsonb. */
export const BrandDetail = z.object({
  id: z.string(),
  brandExtraction: BrandExtraction,
  measuredSiteData: z.unknown(),
});
export type BrandDetail = z.infer<typeof BrandDetail>;
