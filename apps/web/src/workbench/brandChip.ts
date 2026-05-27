import type { BrandExtraction, MeasuredSiteData } from "@bya/shared";

export function brandName(be: BrandExtraction | null): string {
  return be?.brand_identity?.brand_name?.trim() || "Your brand";
}

export function positioningLine(be: BrandExtraction | null): string {
  const bi = be?.brand_identity;
  return (bi?.positioning_statement || bi?.one_line_description || "").trim();
}

export function accentColor(be: BrandExtraction | null, msd: MeasuredSiteData | null): string {
  const colors = be?.visual_brand_system?.colors;
  const accentArr = colors?.accent;
  const primaryArr = colors?.primary;
  const brandAccent = (Array.isArray(accentArr) ? accentArr[0] : undefined)
    ?? (Array.isArray(primaryArr) ? primaryArr[0] : undefined);
  if (brandAccent) return brandAccent;
  const measured = msd?.colors?.accent_cta?.[0]?.hex;
  if (measured) return measured;
  return "var(--accent)";
}
