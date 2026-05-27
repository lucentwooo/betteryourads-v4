import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chat } from "../src/services/openrouter.js";
import { OpenRouterError } from "../src/lib/errors.js";

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
});
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
  vi.unstubAllGlobals();
});

describe("chat", () => {
  it("posts to OpenRouter with bearer auth and returns the assistant content", async () => {
    const fn = mockFetchOnce(200, { choices: [{ message: { content: "hello" } }] });
    const out = await chat({ model: "x/model", messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("hello");
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
    expect(JSON.parse(init.body).model).toBe("x/model");
  });

  it("appends :online to the model when online is set", async () => {
    const fn = mockFetchOnce(200, { choices: [{ message: { content: "{}" } }] });
    await chat({ model: "x/model", messages: [{ role: "user", content: "hi" }], online: true });
    expect(JSON.parse(fn.mock.calls[0][1].body).model).toBe("x/model:online");
  });

  it("throws OpenRouterError on a non-2xx response", async () => {
    mockFetchOnce(500, { error: { message: "boom" } });
    await expect(chat({ model: "x/model", messages: [] })).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("throws OpenRouterError when the API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(chat({ model: "x/model", messages: [] })).rejects.toBeInstanceOf(OpenRouterError);
  });
});
