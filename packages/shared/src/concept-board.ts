import { z } from "zod";

export const AwarenessStage = z.enum(["unaware", "problem", "solution", "product", "most"]);
export type AwarenessStage = z.infer<typeof AwarenessStage>;

export const Goal = z.enum(["waitlist", "trials", "paid"]);
export type Goal = z.infer<typeof Goal>;

export const Concept = z.object({
  angle: z.string().min(1),
  stage: AwarenessStage,
  headline: z.string().min(1),
  rationale: z.string().default(""),
});
export type Concept = z.infer<typeof Concept>;

export const ConceptBoard = z.object({
  goal: Goal,
  concepts: z.array(Concept).min(1),
});
export type ConceptBoard = z.infer<typeof ConceptBoard>;

export const STAGE_ORDER: AwarenessStage[] = ["unaware", "problem", "solution", "product", "most"];

export const STAGE_META: Record<AwarenessStage, { name: string; blurb: string }> = {
  unaware: { name: "Unaware", blurb: "They don't know they have this problem yet." },
  problem: { name: "Problem-aware", blurb: "They feel the pain but don't know solutions exist." },
  solution: { name: "Solution-aware", blurb: "They know tools like this exist; weighing approaches." },
  product: { name: "Product-aware", blurb: "They know you; comparing you to alternatives." },
  most: { name: "Most-aware", blurb: "Basically ready — they just need a nudge." },
};

export const GOAL_LABEL: Record<Goal, string> = {
  waitlist: "Grow a waitlist",
  trials: "Get signups / trials",
  paid: "Convert to paid",
};

export const GOAL_FOCUS: Record<Goal, AwarenessStage[]> = {
  waitlist: ["problem", "solution"],
  trials: ["solution", "product"],
  paid: ["product", "most"],
};
