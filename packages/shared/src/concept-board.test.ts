import { describe, it, expect } from "vitest";
import { ConceptBoard, Concept } from "./concept-board.js";

const validConcept = {
  angle: "Transformation",
  stage: "solution" as const,
  headline: "Stop losing leads overnight",
  rationale: "Speaks to the core fear",
};

describe("ConceptBoard", () => {
  it("parses a valid board", () => {
    const r = ConceptBoard.safeParse({ goal: "trials", concepts: [validConcept] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.goal).toBe("trials");
      expect(r.data.concepts).toHaveLength(1);
    }
  });

  it("rejects an empty concepts array", () => {
    const r = ConceptBoard.safeParse({ goal: "waitlist", concepts: [] });
    expect(r.success).toBe(false);
  });
});

describe("Concept", () => {
  it("coerces missing rationale to empty string", () => {
    const r = Concept.safeParse({ angle: "ROI", stage: "product", headline: "Save 10 hours" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rationale).toBe("");
    }
  });
});
