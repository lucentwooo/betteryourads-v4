import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/kie.js", () => ({
  uploadBase64: vi.fn(),
  createTask: vi.fn(),
  pollResult: vi.fn(),
}));

import { uploadBase64, createTask, pollResult } from "../src/services/kie.js";
import { runRender } from "../src/pipelines/render.js";
import { ValidationError, KieError } from "../src/lib/errors.js";

const adPrompt = { ad_prompt: { goal: "x", canvas: { aspect_ratio: "1:1 (1080x1080)" } }, schema_version: 1 };
const REF = "data:image/png;base64,REF";
const LOGO = "data:image/png;base64,LOGO";
const ASSET = "data:image/png;base64,ASSET";
const fast = { pollIntervalMs: 1, pollTimeoutMs: 1000 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(uploadBase64).mockImplementation(async (_img, name) => `https://cdn/${name}`);
  vi.mocked(createTask).mockResolvedValue("task-1");
});

describe("runRender", () => {
  it("rejects a malformed request before calling KIE", async () => {
    await expect(runRender({ adPrompt, referenceAdImage: REF } as never, fast)).rejects.toBeInstanceOf(ValidationError);
    expect(uploadBase64).not.toHaveBeenCalled();
  });

  it("rejects when ad_prompt is missing", async () => {
    await expect(
      runRender({ adPrompt: { schema_version: 1 }, referenceAdImage: REF, logoImage: LOGO }, fast),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("uploads reference+logo, creates the task, and returns the first result URL", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "success", urls: ["https://cdn/out.png"], failMsg: "" });
    const url = await runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast);
    expect(url).toBe("https://cdn/out.png");
    expect(uploadBase64).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createTask).mock.calls[0][0].aspectRatio).toBe("1:1");
  });

  it("uploads the product asset as a third image when present", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "success", urls: ["https://cdn/out.png"], failMsg: "" });
    await runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO, productAsset: ASSET }, fast);
    expect(uploadBase64).toHaveBeenCalledTimes(3);
    expect(vi.mocked(createTask).mock.calls[0][0].inputUrls).toHaveLength(3);
  });

  it("polls until success", async () => {
    vi.mocked(pollResult)
      .mockResolvedValueOnce({ state: "processing", progress: 0.5, urls: [], failMsg: "" })
      .mockResolvedValueOnce({ state: "success", urls: ["https://cdn/out.png"], failMsg: "" });
    const url = await runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast);
    expect(url).toBe("https://cdn/out.png");
    expect(pollResult).toHaveBeenCalledTimes(2);
  });

  it("throws KieError when the task fails", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "fail", urls: [], failMsg: "content policy" });
    await expect(runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast)).rejects.toBeInstanceOf(KieError);
  });

  it("throws KieError when polling times out", async () => {
    vi.mocked(pollResult).mockResolvedValue({ state: "processing", urls: [], failMsg: "" });
    await expect(
      runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, { pollIntervalMs: 1, pollTimeoutMs: 0 }),
    ).rejects.toBeInstanceOf(KieError);
  });

  it("propagates an upstream upload KieError", async () => {
    vi.mocked(uploadBase64).mockRejectedValue(new KieError("upload down"));
    await expect(runRender({ adPrompt, referenceAdImage: REF, logoImage: LOGO }, fast)).rejects.toBeInstanceOf(KieError);
  });
});
