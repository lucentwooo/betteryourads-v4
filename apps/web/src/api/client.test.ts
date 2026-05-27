import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, setTokenProvider } from "./client";

describe("api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    setTokenProvider(async () => null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("attaches a bearer token when the provider returns one", async () => {
    setTokenProvider(async () => "tok123");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ title: "T" }), { status: 200 }));
    await api.extract("https://x.com");
    const opts = fetchMock.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe("Bearer tok123");
  });

  it("posts to /api/extract with the url body and returns parsed json", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ title: "T" }), { status: 200 }));
    const res = await api.extract("https://x.com");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/extract");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ url: "https://x.com" });
    expect(res).toEqual({ title: "T" });
  });

  it("issues GET for getConfig (no body)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ supabaseUrl: "u", supabaseAnonKey: "k" }), { status: 200 }));
    await api.getConfig();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/config");
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeUndefined();
  });

  it("GETs /api/brands", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await api.getBrands();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brands");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("GETs /api/ads", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await api.getAds();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ads");
  });

  it("GETs /api/brand/:id", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "b1" }), { status: 200 }));
    await api.getBrand("b1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brand/b1");
  });

  it("throws ApiError carrying code/status/stage on error responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_APPROVED", message: "nope", stage: "auth" } }), { status: 403 }),
    );
    await expect(api.extract("https://x.com")).rejects.toMatchObject({
      name: "ApiError",
      code: "NOT_APPROVED",
      status: 403,
      stage: "auth",
    });
  });
});
