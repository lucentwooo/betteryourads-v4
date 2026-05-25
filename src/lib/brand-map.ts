type AnyObj = Record<string, any>;
const first = (a: unknown): string | null =>
  Array.isArray(a) && a.length ? String(a[0]) : null;

export function mapBrandFields(extraction: AnyObj) {
  const colors = extraction?.visual_brand_system?.colors ?? {};
  return {
    color_primary: first(colors.primary),
    color_secondary: first(colors.secondary),
    color_accent: first(colors.accent),
    color_background: first(colors.background),
    color_text: first(colors.text),
    brand_vibe: extraction?.visual_brand_system?.ui_style?.overall_mood ?? null,
    brand_vibe_note: extraction?.brand_identity?.one_line_description ?? null,
  };
}

export function mapConcepts(extraction: AnyObj) {
  const raw = extraction?.static_ad_creative_recommendations?.ad_concepts;
  const list: AnyObj[] = Array.isArray(raw) ? raw : [];
  return list.map((c) => ({
    name: c.concept_name ?? null,
    headline: c.suggested_headline ?? null,
    subheadline: c.suggested_subheadline ?? null,
    cta: c.suggested_cta ?? null,
    angle: c.main_angle ?? c.ad_angle ?? null,
    hook: c.hook ?? null,
    proof_point: c.proof_point ?? null,
    visual_metaphor: c.visual_metaphor ?? null,
    suggested_layout: c.suggested_layout ?? null,
    rationale: c.why_this_should_work ?? null,
    awareness_stage: null,
    raw: c,
  }));
}
