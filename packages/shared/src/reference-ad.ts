import { z } from "zod";

/** Which library a curated reference belongs to. `with_asset` references are designed to
 *  feature a product image; `no_asset` references don't use one. Mirrors the Stage-2 prompt
 *  variant selection in the backend. */
export const ReferenceAdVariant = z.enum(["with_asset", "no_asset"]);
export type ReferenceAdVariant = z.infer<typeof ReferenceAdVariant>;

/** A curated reference ad as returned to the client (GET /api/reference-ads, and the rows the
 *  admin endpoints create). `url` is a freshly-signed Storage URL; the storage path stays
 *  server-side. */
export const ReferenceAd = z.object({
  id: z.string(),
  variant: ReferenceAdVariant,
  label: z.string().nullable(),
  url: z.string(),
  createdAt: z.string(),
});
export type ReferenceAd = z.infer<typeof ReferenceAd>;
