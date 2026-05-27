import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadBase64, createTask, pollResult } from "../src/services/kie.js";
import { KieError } from "../src/lib/errors.js";

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.KIE_API_KEY = "kie-test";
});
afterEach(() => {
  delete process.env.KIE_API_KEY;
  vi.unstubAllGlobals();
});

describe("uploadBase64", () => {
  it("strips the data-URL prefix, posts raw base64, returns the downloadUrl", async () => {
    const fn = mockFetchOnce(200, { data: { downloadUrl: "https://cdn/x.png" } });
    const url = await uploadBase64("data:image/png;base64,AAAA", "reference.png");
    expect(url).toBe("https://cdn/x.png");
    const [endpoint, init] = fn.mock.calls[0];
    expect(endpoint).toBe("https://kieai.redpandaai.co/api/file-base64-upload");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer kie-test");
    const sent = JSON.parse(init.body);
    expect(sent.base64Data).toBe("AAAA"); // prefix stripped
    expect(sent.uploadPath).toBe("images/ad-stage3");
  });

  it("throws KieError when no downloadUrl comes back", async () => {
    mockFetchOnce(500, { msg: "nope" });
    await expect(uploadBase64("AAAA", "x.png")).rejects.toBeInstanceOf(KieError);
  });
});

describe("createTask", () => {
  it("posts model + input and returns the taskId", async () => {
    const fn = mockFetchOnce(200, { code: 200, data: { taskId: "task-1" } });
    const id = await createTask({
      model: "gpt-image-2-image-to-image",
      prompt: "P",
      inputUrls: ["https://cdn/ref.png", "https://cdn/logo.png"],
      aspectRatio: "1:1",
      resolution: "1K",
    });
    expect(id).toBe("task-1");
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-image-2-image-to-image");
    expect(body.input.input_urls).toHaveLength(2);
    expect(body.input.aspect_ratio).toBe("1:1");
    expect(body.input.resolution).toBe("1K");
  });

  it("throws KieError when code is not 200", async () => {
    mockFetchOnce(200, { code: 400, msg: "bad" });
    await expect(
      createTask({ model: "m", prompt: "P", inputUrls: [], aspectRatio: "1:1", resolution: "1K" }),
    ).rejects.toBeInstanceOf(KieError);
  });
});

describe("pollResult", () => {
  it("parses resultJson into urls and returns the state", async () => {
    mockFetchOnce(200, {
      code: 200,
      data: { state: "success", progress: 1, resultJson: JSON.stringify({ resultUrls: ["https://cdn/out.png"] }) },
    });
    const r = await pollResult("task-1");
    expect(r.state).toBe("success");
    expect(r.urls).toEqual(["https://cdn/out.png"]);
  });

  it("returns a fail state with failMsg", async () => {
    mockFetchOnce(200, { code: 200, data: { state: "fail", failMsg: "content policy" } });
    const r = await pollResult("task-1");
    expect(r.state).toBe("fail");
    expect(r.failMsg).toBe("content policy");
  });

  it("throws KieError on an HTTP error", async () => {
    mockFetchOnce(500, { code: 500 });
    await expect(pollResult("task-1")).rejects.toBeInstanceOf(KieError);
  });
});
