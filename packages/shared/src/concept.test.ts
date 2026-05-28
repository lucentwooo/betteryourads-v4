import { describe, it, expect } from "vitest";
import { ConceptSet } from "./concept.js";

const idea = {
  idea_number: 1,
  awareness_level: "Pain aware",
  idea_name: "Stop guessing",
  core_angle: "frustration",
  main_hook: "Tired of X?",
  cta: "Start free",
  visual_direction_for_later: "bold type",
};

describe("ConceptSet", () => {
  it("parses a minimal valid set and defaults arrays", () => {
    const r = ConceptSet.safeParse({ ad_ideas: [idea] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ad_ideas[0].safe_claims_used).toEqual([]);
      expect(r.data.ad_ideas[0].idea_name).toBe("Stop guessing");
    }
  });

  it("rejects an empty ad_ideas array", () => {
    expect(ConceptSet.safeParse({ ad_ideas: [] }).success).toBe(false);
  });

  it("rejects an idea missing required fields", () => {
    expect(ConceptSet.safeParse({ ad_ideas: [{ idea_number: 1 }] }).success).toBe(false);
  });
});
