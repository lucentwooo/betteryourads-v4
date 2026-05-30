import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/pipelines/ad-prompt.js", () => ({ runAdPrompt: vi.fn() }));
vi.mock("../src/pipelines/render.js", () => ({ runRender: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  saveAdPrompt: vi.fn(),
  persistRenderedAd: vi.fn(),
  updateBatchItem: vi.fn(),
  finalizeBatchIfDone: vi.fn(),
}));

import { runAdPrompt } from "../src/pipelines/ad-prompt.js";
import { runRender } from "../src/pipelines/render.js";
import { saveAdPrompt, persistRenderedAd, updateBatchItem, finalizeBatchIfDone } from "../src/services/supabase.js";
import { runBatch } from "../src/services/batch-worker.js";

import type { Concept } from "@bya/shared";

const baseItem = (id: string) => ({
  itemId: id,
  concept: { angle: "a", stage: "solution", headline: "h", rationale: "r" } satisfies Concept,
  brandExtraction: {},
  referenceAdImage: "data:ref",
  logoImage: "data:logo",
  productAsset: undefined,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: {} });
  vi.mocked(saveAdPrompt).mockResolvedValue({ id: "ap1" });
  vi.mocked(runRender).mockResolvedValue({ imageUrl: "http://img", aspectRatio: "1:1", resolution: "1K" });
  vi.mocked(persistRenderedAd).mockResolvedValue({ id: "ad1", imageUrl: "signed" });
});

describe("runBatch", () => {
  it("processes all items to done and finalizes", async () => {
    await runBatch({ batchId: "b1", userId: "u1", brandExtractionId: "be1", items: [baseItem("i1"), baseItem("i2")] });
    expect(updateBatchItem).toHaveBeenCalledWith("i1", expect.objectContaining({ status: "done", generatedAdId: "ad1" }));
    expect(updateBatchItem).toHaveBeenCalledWith("i2", expect.objectContaining({ status: "done" }));
    expect(finalizeBatchIfDone).toHaveBeenCalledWith("b1");
  });

  it("isolates a failing item without sinking the batch", async () => {
    vi.mocked(runRender)
      .mockResolvedValueOnce({ imageUrl: "http://img", aspectRatio: "1:1", resolution: "1K" })
      .mockRejectedValueOnce(new Error("render boom"));
    await runBatch({ batchId: "b1", userId: "u1", brandExtractionId: "be1", items: [baseItem("i1"), baseItem("i2")] });
    const errorCall = vi.mocked(updateBatchItem).mock.calls.find((c) => c[1].status === "error");
    expect(errorCall).toBeTruthy();
    expect(finalizeBatchIfDone).toHaveBeenCalledWith("b1");
  });
});
