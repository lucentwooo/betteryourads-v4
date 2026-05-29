import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runConceptBoard } from "../src/pipelines/concept-board.js";

const makeConcept = (stage = "solution") => ({
  angle: "Transformation",
  stage,
  headline: "Stop losing leads",
  rationale: "Speaks to core fear",
});

const validResponse = JSON.stringify({ concepts: [makeConcept(), makeConcept("problem")] });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STAGE3_MODEL = "deepseek/deepseek-v4-flash";
});

describe("runConceptBoard", () => {
  it("returns a valid board (≥1 concept) from a good model response", async () => {
    vi.mocked(chat).mockResolvedValueOnce(validResponse);
    const board = await runConceptBoard({ analysis: {} as never, goal: "trials" });
    expect(board.goal).toBe("trials");
    expect(board.concepts.length).toBeGreaterThanOrEqual(1);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("coerces an unrecognised stage to 'solution'", async () => {
    const badStage = JSON.stringify({ concepts: [makeConcept("unknown-stage")] });
    vi.mocked(chat).mockResolvedValueOnce(badStage);
    const board = await runConceptBoard({ analysis: {} as never, goal: "paid" });
    expect(board.concepts[0].stage).toBe("solution");
  });

  it("retries then succeeds on first-bad-then-good JSON", async () => {
    vi.mocked(chat).mockResolvedValueOnce("not json at all").mockResolvedValueOnce(validResponse);
    const board = await runConceptBoard({ analysis: {} as never, goal: "waitlist" });
    expect(board.concepts.length).toBeGreaterThanOrEqual(1);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("throws ValidationError after two invalid responses", async () => {
    vi.mocked(chat).mockResolvedValue("nope");
    await expect(runConceptBoard({ analysis: {} as never, goal: "trials" })).rejects.toThrow();
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
