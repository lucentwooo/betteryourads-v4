import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runCustomerResearch } from "../src/pipelines/customer-research.js";

const analysis = {
  brand_identity: { brand_name: "Chirp", positioning: "the friendly CRM" },
  messaging_foundation: { customer_segments: ["founders"] },
  external_customer_research_plan: { search_queries: ["chirp crm reviews"] },
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.STAGE1_MODEL = "test/model";
});

describe("runCustomerResearch", () => {
  it("returns the parsed VOC object and calls the model online", async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({ top_complaints: ["slow"], sources: ["reddit"] }));
    const voc = await runCustomerResearch(analysis);
    expect(voc?.top_complaints).toEqual(["slow"]);
    expect(voc?.sources).toEqual(["reddit"]);
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ online: true, model: "test/model" }));
  });

  it("returns null when the model errors (best-effort)", async () => {
    vi.mocked(chat).mockRejectedValueOnce(new Error("upstream 500"));
    expect(await runCustomerResearch(analysis)).toBeNull();
  });

  it("returns null when the model returns non-JSON", async () => {
    vi.mocked(chat).mockResolvedValueOnce("here are some thoughts, not json");
    expect(await runCustomerResearch(analysis)).toBeNull();
  });
});
