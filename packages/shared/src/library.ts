import { z } from "zod";
import { BrandExtraction } from "./brand-extraction.js";

/** Row summary for the saved-brands list (GET /api/brands). */
export const BrandSummary = z.object({
  id: z.string(),
  websiteUrl: z.string(),
  updatedAt: z.string(),
});
export type BrandSummary = z.infer<typeof BrandSummary>;

/** Row summary for the library (GET /api/ads). imageUrl is a freshly-signed Storage URL,
 *  or null when signing failed — in which case imageError carries the reason. */
export const AdSummary = z.object({
  id: z.string(),
  imageUrl: z.string().nullable(),
  imageError: z.string().optional(),
  aspectRatio: z.string().nullable(),
  resolution: z.string().nullable(),
  createdAt: z.string(),
});
export type AdSummary = z.infer<typeof AdSummary>;

/** A user account row for the admin dashboard (GET /api/admin/users). lastSignInAt is null
 *  for users who have never signed in. */
export const AdminUser = z.object({
  id: z.string(),
  email: z.string().nullable(),
  approved: z.boolean(),
  isAdmin: z.boolean(),
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
});
export type AdminUser = z.infer<typeof AdminUser>;

/** Full saved brand for reuse (GET /api/brand/:id). measuredSiteData is opaque jsonb. */
export const BrandDetail = z.object({
  id: z.string(),
  brandExtraction: BrandExtraction,
  measuredSiteData: z.unknown(),
});
export type BrandDetail = z.infer<typeof BrandDetail>;
