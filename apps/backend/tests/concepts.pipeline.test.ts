import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runConcepts } from "../src/pipelines/concepts.js";

const idea = (n: number, lvl: string) => ({
  idea_number: n, awareness_level: lvl, idea_name: `Idea ${n}`,
  main_hook: "Hook", cta: "Go", visual_direction_for_later: "v",
});
const validSet = { ad_ideas: [idea(1, "Pain aware"), idea(2, "Problem aware")] };

beforeEach(() => { vi.resetAllMocks(); process.env.STAGE3_MODEL = "deepseek/deepseek-v4-flash"; });

describe("runConcepts", () => {
  it("parses a valid JSON concept set", async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify(validSet));
    const set = await runConcepts({ brandExtraction: { brand_identity: {} } });
    expect(set.ad_ideas).toHaveLength(2);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("retries once on invalid JSON then succeeds", async () => {
    vi.mocked(chat).mockResolvedValueOnce("not json").mockResolvedValueOnce(JSON.stringify(validSet));
    const set = await runConcepts({ brandExtraction: {} });
    expect(set.ad_ideas).toHaveLength(2);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("throws after two invalid responses", async () => {
    vi.mocked(chat).mockResolvedValue("nope");
    await expect(runConcepts({ brandExtraction: {} })).rejects.toThrow();
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
