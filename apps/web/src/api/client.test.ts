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
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
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

  it("throws ApiError (not a parse error) on a plain-text error body", async () => {
    fetchMock.mockResolvedValue(new Response("Request Entity Too Large", { status: 413 }));
    await expect(api.extract("https://x.com")).rejects.toMatchObject({
      name: "ApiError",
      status: 413,
      message: "Request Entity Too Large",
    });
  });

  it("throws ApiError on an HTML error page", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }),
    );
    await expect(api.extract("https://x.com")).rejects.toMatchObject({ name: "ApiError", status: 502 });
  });

  it("throws ApiError on an empty error body", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await expect(api.extract("https://x.com")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Request failed (500)",
    });
  });

  it("returns null for an empty successful body without throwing", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));
    await expect(api.getConfig()).resolves.toBeNull();
  });

  it("GETs /api/reference-ads?variant=no_asset and returns parsed array", async () => {
    const mockAds = [
      { id: "r1", variant: "no_asset", label: null, url: "https://cdn.example.com/r1.png", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "r2", variant: "no_asset", label: "clean look", url: "https://cdn.example.com/r2.png", createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(mockAds), { status: 200 }));
    const res = await api.getReferenceAds("no_asset");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reference-ads?variant=no_asset");
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeUndefined();
    expect(res).toEqual(mockAds);
  });

  it("GETs /api/reference-ads?variant=with_asset", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await api.getReferenceAds("with_asset");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/reference-ads?variant=with_asset");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("POSTs to /api/admin/reference-ads with variant, dataUrl, and label", async () => {
    const mockAd = { id: "r3", variant: "with_asset", label: "product shot", url: "https://cdn.example.com/r3.png", createdAt: "2026-01-03T00:00:00.000Z" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(mockAd), { status: 200 }));
    const res = await api.adminCreateReferenceAd("with_asset", "data:image/png;base64,abc", "product shot");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/reference-ads");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ variant: "with_asset", dataUrl: "data:image/png;base64,abc", label: "product shot" });
    expect(res).toEqual(mockAd);
  });

  it("DELETEs /api/admin/reference-ads/:id", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await api.adminDeleteReferenceAd("r1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/reference-ads/r1");
    expect(opts.method).toBe("DELETE");
    expect(res).toEqual({ ok: true });
  });
});
