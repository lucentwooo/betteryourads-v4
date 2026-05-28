import { z } from "zod";

const strArray = z.array(z.string()).default([]);

export const AdIdea = z
  .object({
    idea_number: z.number().optional(),
    awareness_level: z.string().optional(),
    idea_name: z.string().min(1),
    core_angle: z.string().optional().default(""),
    customer_context: z.string().optional().default(""),
    customer_pain_or_desire: z.string().optional().default(""),
    customer_insight: z.string().optional().default(""),
    belief_to_shift: z.string().optional().default(""),
    main_hook: z.string().min(1),
    supporting_message: z.string().optional().default(""),
    cta: z.string().min(1),
    why_this_could_work: z.string().optional().default(""),
    proof_or_reason_to_believe: z.string().optional().default(""),
    safe_claims_used: strArray,
    claims_to_avoid: strArray,
    visual_direction_for_later: z.string().optional().default(""),
    brand_dna_fields_used: strArray,
  })
  .passthrough();

export type AdIdea = z.infer<typeof AdIdea>;

export const CampaignStrategySummary = z
  .object({
    brand_name: z.string().optional().default(""),
    product_name: z.string().optional().default(""),
    category: z.string().optional().default(""),
    primary_customer: z.string().optional().default(""),
    primary_problem: z.string().optional().default(""),
    primary_outcome: z.string().optional().default(""),
    main_positioning: z.string().optional().default(""),
    strongest_ad_opportunity: z.string().optional().default(""),
    main_claim_constraints: strArray,
    tone_to_use: z.string().optional().default(""),
    tone_to_avoid: z.string().optional().default(""),
  })
  .passthrough()
  .optional();

const RecommendedItem = z
  .object({ rank: z.number().optional(), idea_number: z.union([z.number(), z.string()]).optional(), reason: z.string().optional() })
  .passthrough();

export const ConceptSet = z
  .object({
    campaign_strategy_summary: CampaignStrategySummary,
    ad_ideas: z.array(AdIdea).min(1),
    recommended_top_3: z.array(RecommendedItem).default([]),
    next_step_recommendations: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type ConceptSet = z.infer<typeof ConceptSet>;
