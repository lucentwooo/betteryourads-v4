import { z } from "zod";

/** Free-form string list (e.g. value props, search queries).
 *  Accepts a plain string too (model sometimes returns a single narrative string)
 *  and coerces it into a single-element array. */
const strList = z.union([z.array(z.string()), z.string().transform((s) => [s])]);
/** Heterogeneous list whose items vary (strings or objects) across sites; kept loose on purpose. */
const looseList = z.array(z.unknown());

const BrandIdentity = z
  .object({
    brand_name: z.string().optional(),
    product_name: z.string().optional(),
    website_url: z.string().optional(),
    landing_page_url: z.string().optional(),
    category: z.string().optional(),
    one_line_description: z.string().optional(),
    primary_customer: z.string().optional(),
    primary_industry: z.string().optional(),
    primary_role: z.string().optional(),
    primary_outcome: z.string().optional(),
    positioning_statement: z.string().optional(),
    confidence: z.string().optional(),
  })
  .passthrough();

const VisualBrandSystem = z
  .object({
    logos: looseList.optional(),
    colors: z
      .object({
        primary: strList.optional(),
        secondary: strList.optional(),
        accent: strList.optional(),
        neutral: strList.optional(),
        background: strList.optional(),
        text: strList.optional(),
        cta: strList.optional(),
      })
      .passthrough()
      .optional(),
    typography: z
      .object({
        font_families: strList.optional(),
        heading_style: z.string().optional(),
        body_style: z.string().optional(),
        button_style: z.string().optional(),
        casing_style: z.string().optional(),
      })
      .passthrough()
      .optional(),
    ui_style: z
      .object({
        button_style: z.string().optional(),
        card_style: z.string().optional(),
        corner_radius: z.string().optional(),
        border_style: z.string().optional(),
        shadow_style: z.string().optional(),
        icon_style: z.string().optional(),
        illustration_style: z.string().optional(),
        screenshot_style: z.string().optional(),
        spacing_style: z.string().optional(),
        layout_style: z.string().optional(),
        overall_mood: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const ProductRepresentation = z
  .object({
    screenshots: looseList.optional(),
    dashboard_visuals: looseList.optional(),
    feature_visuals: looseList.optional(),
    workflow_visuals: looseList.optional(),
    integration_visuals: looseList.optional(),
    recommended_ad_visuals: looseList.optional(),
    visuals_to_avoid: looseList.optional(),
  })
  .passthrough();

const OfferDna = z
  .object({
    product: z.string().optional(),
    main_problem_solved: z.string().optional(),
    main_promise: z.string().optional(),
    main_use_case: z.string().optional(),
    target_customer: z.string().optional(),
    target_industry: z.string().optional(),
    target_role: z.string().optional(),
    key_features: strList.optional(),
    key_benefits: strList.optional(),
    pricing_model: z.string().optional(),
    plans: looseList.optional(),
    free_trial: z.string().optional(),
    demo_available: z.string().optional(),
    entry_offer: z.string().optional(),
    primary_cta: z.string().optional(),
    secondary_cta: z.string().optional(),
    sales_motion: z.string().optional(),
    risk_reversal: z.string().optional(),
    guarantee: z.string().optional(),
    onboarding_promise: z.string().optional(),
    time_to_value: z.string().optional(),
    integrations: looseList.optional(),
    main_differentiator: z.string().optional(),
  })
  .passthrough();

const MessagingFoundation = z
  .object({
    homepage_headline: z.string().optional(),
    homepage_subheadline: z.string().optional(),
    value_props: strList.optional(),
    features: strList.optional(),
    benefits: strList.optional(),
    use_cases: strList.optional(),
    customer_segments: strList.optional(),
    pain_points_mentioned: strList.optional(),
    outcomes_mentioned: strList.optional(),
    objections_addressed: strList.optional(),
    faq_themes: strList.optional(),
    cta_language: strList.optional(),
    repeated_phrases: strList.optional(),
    headline_patterns: strList.optional(),
    tone_notes: strList.optional(),
  })
  .passthrough();

const ProofLibrary = z
  .object({
    customer_logos: looseList.optional(),
    testimonials: looseList.optional(),
    case_study_metrics: looseList.optional(),
    roi_claims: looseList.optional(),
    usage_numbers: looseList.optional(),
    review_ratings: looseList.optional(),
    security_badges: looseList.optional(),
    press_mentions: looseList.optional(),
    awards: looseList.optional(),
    safe_ad_proof_points: looseList.optional(),
  })
  .passthrough();

const CustomerDnaFromWebsite = z
  .object({
    brand_claims_about_customers: looseList.optional(),
    real_customer_quotes: looseList.optional(),
    pains: looseList.optional(),
    desired_outcomes: looseList.optional(),
    objections: looseList.optional(),
    buying_triggers: looseList.optional(),
    alternatives: looseList.optional(),
    decision_criteria: looseList.optional(),
    exact_phrases: looseList.optional(),
  })
  .passthrough();

const ExternalCustomerResearchPlan = z
  .object({
    recommended_subreddits: strList.optional(),
    review_sites: strList.optional(),
    communities: strList.optional(),
    search_queries: strList.optional(),
    competitor_review_targets: strList.optional(),
    what_to_extract: strList.optional(),
  })
  .passthrough();

const CompetitorIntelligence = z
  .object({
    direct_competitors: looseList.optional(),
    indirect_competitors: looseList.optional(),
    manual_alternatives: looseList.optional(),
    comparison_pages: looseList.optional(),
    differentiators: looseList.optional(),
    category_norms: looseList.optional(),
    research_needed: looseList.optional(),
  })
  .passthrough();

const ClaimConstraints = z
  .object({
    allowed_claims: looseList.optional(),
    claims_requiring_proof: looseList.optional(),
    unsupported_claims: looseList.optional(),
    forbidden_claims: looseList.optional(),
    required_disclaimers: looseList.optional(),
    correct_terms: looseList.optional(),
    terms_to_avoid: looseList.optional(),
    compliance_notes: looseList.optional(),
  })
  .passthrough();

const MissingInformation = z
  .object({
    must_ask_client: strList.optional(),
    nice_to_have: strList.optional(),
    not_found_on_website: strList.optional(),
  })
  .passthrough();

const SourceMapEntry = z
  .object({
    field: z.string().optional(),
    value: z.string().optional(),
    source_url: z.string().optional(),
    confidence: z.string().optional(),
  })
  .passthrough();

/** Voice-of-customer research output (legacy researchCustomers). Each list accepts a single
 *  string too, mirroring strList, since the model occasionally returns a narrative string. */
export const ExternalVoc = z
  .object({
    top_complaints: strList.optional(),
    recurring_phrases: strList.optional(),
    desired_outcomes: strList.optional(),
    objections: strList.optional(),
    switching_triggers: strList.optional(),
    competitor_gripes: strList.optional(),
    sources: strList.optional(),
  })
  .passthrough();
export type ExternalVoc = z.infer<typeof ExternalVoc>;

export const BrandExtraction = z
  .object({
    schema_version: z.number().optional(),
    brand_identity: BrandIdentity.optional(),
    external_voc: ExternalVoc.optional(),
    visual_brand_system: VisualBrandSystem.optional(),
    product_representation: ProductRepresentation.optional(),
    offer_dna: OfferDna.optional(),
    messaging_foundation: MessagingFoundation.optional(),
    proof_library: ProofLibrary.optional(),
    customer_dna_from_website: CustomerDnaFromWebsite.optional(),
    external_customer_research_plan: ExternalCustomerResearchPlan.optional(),
    competitor_intelligence: CompetitorIntelligence.optional(),
    claim_constraints: ClaimConstraints.optional(),
    missing_information: MissingInformation.optional(),
    source_map: z.array(SourceMapEntry).optional(),
  })
  .passthrough();

export type BrandExtraction = z.infer<typeof BrandExtraction>;

/** Request body for POST /api/brand. */
export const BrandRequest = z.object({
  url: z.string(),
  measuredSiteData: z.unknown(),
});

export type BrandRequest = z.infer<typeof BrandRequest>;
