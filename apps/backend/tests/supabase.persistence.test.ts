import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable query mock: filter/select/insert/upsert return the same object;
// single() and order() are the awaited terminals. Declared before vi.mock so the
// (lazily-called) factory closure can see them — same pattern as supabase.service.test.ts.
const single = vi.fn();
const order = vi.fn();
const eq = vi.fn();
const not = vi.fn();
const select = vi.fn();
const insert = vi.fn();
const upsert = vi.fn();
const chain = { select, insert, upsert, eq, not, order, single };
select.mockReturnValue(chain);
insert.mockReturnValue(chain);
upsert.mockReturnValue(chain);
eq.mockReturnValue(chain);
not.mockReturnValue(chain);
const from = vi.fn(() => chain);

const upload = vi.fn();
const createSignedUrl = vi.fn();
const remove = vi.fn();
const storage = { from: vi.fn(() => ({ upload, createSignedUrl, remove })) };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: vi.fn() }, from, storage }),
}));

import {
  saveBrandExtraction,
  getBrandExtraction,
  saveAdPrompt,
  getAdPrompt,
  persistRenderedAd,
  listGeneratedAds,
  assemblePerformanceMemory,
} from "../src/services/supabase.js";
import { PersistenceError } from "../src/lib/errors.js";

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.clearAllMocks(); // clears call history; keeps the chain return-value wiring
});

describe("saveBrandExtraction", () => {
  it("upserts on (user_id, website_url) and returns the new id", async () => {
    single.mockResolvedValue({ data: { id: "b1" }, error: null });
    const out = await saveBrandExtraction({
      userId: "u1",
      url: "https://acme.com",
      brandExtraction: { brand_identity: { brand_name: "Acme" }, schema_version: 1 },
      measuredSiteData: { title: "Acme" },
    });
    expect(out).toEqual({ id: "b1" });
    expect(from).toHaveBeenCalledWith("brand_extractions");
    const [row, opts] = upsert.mock.calls[0];
    expect(row.user_id).toBe("u1");
    expect(row.website_url).toBe("https://acme.com");
    expect(row.analysis.brand_identity.brand_name).toBe("Acme");
    expect(row.measured_site_data.title).toBe("Acme");
    expect(opts).toEqual({ onConflict: "user_id,website_url" });
  });

  it("throws PersistenceError when the upsert errors", async () => {
    single.mockResolvedValue({ data: null, error: { message: "duplicate" } });
    await expect(
      saveBrandExtraction({ userId: "u1", url: "x", brandExtraction: {}, measuredSiteData: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe("getBrandExtraction", () => {
  it("returns the parsed analysis for a row", async () => {
    single.mockResolvedValue({ data: { analysis: { brand_identity: { brand_name: "Acme" } } }, error: null });
    const be = await getBrandExtraction("b1", "u1");
    expect(be?.brand_identity).toEqual({ brand_name: "Acme" });
    expect(eq).toHaveBeenCalledWith("id", "b1");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(select).toHaveBeenCalledWith("analysis");
  });

  it("returns null when no row is found", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await getBrandExtraction("missing", "u1")).toBeNull();
  });
});

describe("saveAdPrompt", () => {
  it("inserts the prompt with its variant and returns the id", async () => {
    single.mockResolvedValue({ data: { id: "p1" }, error: null });
    const out = await saveAdPrompt({
      userId: "u1",
      brandExtractionId: "b1",
      variant: "w_asset",
      adPrompt: { ad_prompt: { goal: "x" }, schema_version: 1 },
      userDirection: { tone: "bold" },
      model: "some/model",
    });
    expect(out).toEqual({ id: "p1" });
    expect(from).toHaveBeenCalledWith("ad_prompts");
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe("u1");
    expect(row.brand_extraction_id).toBe("b1");
    expect(row.variant).toBe("w_asset");
    expect(row.ad_prompt_json.ad_prompt.goal).toBe("x");
    expect(row.model).toBe("some/model");
  });

  it("throws PersistenceError when the insert errors", async () => {
    single.mockResolvedValue({ data: null, error: { message: "bad fk" } });
    await expect(
      saveAdPrompt({ userId: "u1", brandExtractionId: null, variant: "no_asset", adPrompt: {}, userDirection: undefined, model: "m" }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });
});

describe("getAdPrompt", () => {
  it("returns the parsed ad_prompt_json for a row", async () => {
    single.mockResolvedValue({ data: { ad_prompt_json: { ad_prompt: { goal: "x" } } }, error: null });
    const ap = await getAdPrompt("p1", "u1");
    expect(ap?.ad_prompt?.goal).toBe("x");
    expect(eq).toHaveBeenCalledWith("id", "p1");
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(select).toHaveBeenCalledWith("ad_prompt_json");
  });

  it("returns null when no row is found", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await getAdPrompt("missing", "u1")).toBeNull();
  });
});

describe("persistRenderedAd", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    );
  });

  it("downloads, uploads to the ads bucket, inserts a row, and returns a signed url", async () => {
    upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    single.mockResolvedValue({ data: { id: "a1" }, error: null }); // generated_ads insert
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/x.png" }, error: null });

    const out = await persistRenderedAd({
      userId: "u1",
      imageUrl: "https://cdn/out.png",
      prompt: "{}",
      aspectRatio: "1:1",
      resolution: "1K",
      adPromptId: "p1",
    });

    expect(out).toEqual({ id: "a1", imageUrl: "https://signed/x.png" });
    expect(storage.from).toHaveBeenCalledWith("ads");
    const [uploadPath] = upload.mock.calls[0];
    expect(uploadPath.startsWith("u1/")).toBe(true);
    expect(uploadPath.endsWith(".png")).toBe(true);
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe("u1");
    expect(row.ad_prompt_id).toBe("p1");
    expect(row.image_path).toBe(uploadPath);
    expect(row.aspect_ratio).toBe("1:1");
    expect(row.resolution).toBe("1K");
  });

  it("throws PersistenceError when the image download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it("throws PersistenceError when the upload errors", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "bucket down" } });
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it("removes the orphaned upload and throws when the generated_ads insert errors", async () => {
    upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    single.mockResolvedValue({ data: null, error: { message: "db down" } });
    remove.mockResolvedValue({ data: {}, error: null });
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
    const uploadPath = upload.mock.calls[0][0];
    expect(remove).toHaveBeenCalledWith([uploadPath]);
  });

  it("removes the orphaned upload and throws when signing the url errors", async () => {
    upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    single.mockResolvedValue({ data: { id: "a1" }, error: null });
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "no signer" } });
    remove.mockResolvedValue({ data: {}, error: null });
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toBeInstanceOf(PersistenceError);
    const uploadPath = upload.mock.calls[0][0];
    expect(remove).toHaveBeenCalledWith([uploadPath]);
  });

  it("surfaces the original error and notes cleanup failure when remove also fails", async () => {
    upload.mockResolvedValue({ data: { path: "ignored" }, error: null });
    single.mockResolvedValue({ data: null, error: { message: "db down" } });
    remove.mockResolvedValue({ data: null, error: { message: "remove failed" } });
    await expect(
      persistRenderedAd({ userId: "u1", imageUrl: "https://cdn/x", prompt: "{}", aspectRatio: null, resolution: null }),
    ).rejects.toThrow(/db down.*remove failed/);
  });
});

describe("listGeneratedAds", () => {
  it("keeps a row whose signed url fails, marking imageUrl null with an error", async () => {
    order.mockResolvedValue({
      data: [
        { id: "a1", image_path: "u1/a1.png", aspect_ratio: "1:1", resolution: "1K", created_at: "2026-05-28T00:00:00Z" },
        { id: "a2", image_path: "u1/a2.png", aspect_ratio: "9:16", resolution: "1K", created_at: "2026-05-27T00:00:00Z" },
      ],
      error: null,
    });
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: "https://signed/a1.png" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "missing file" } });

    const out = await listGeneratedAds("u1");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a1", imageUrl: "https://signed/a1.png" });
    expect(out[1].id).toBe("a2");
    expect(out[1].imageUrl).toBeNull();
    expect(out[1].imageError).toContain("missing file");
  });
});

describe("assemblePerformanceMemory", () => {
  it("returns prior ads' performance joined to their prompt, newest first", async () => {
    order.mockResolvedValue({
      data: [{ performance: { ctr: 0.05 }, ad_prompts: { ad_prompt_json: { ad_prompt: { goal: "x" } } } }],
      error: null,
    });
    const mem = await assemblePerformanceMemory({ userId: "u1", brandExtractionId: "b1" });
    expect(mem).toEqual([{ performance: { ctr: 0.05 }, ad_prompt: { ad_prompt: { goal: "x" } } }]);
    expect(from).toHaveBeenCalledWith("generated_ads");
    expect(eq).toHaveBeenCalledWith("ad_prompts.brand_extraction_id", "b1");
  });

  it("returns undefined when there is no performance data", async () => {
    order.mockResolvedValue({ data: [], error: null });
    expect(await assemblePerformanceMemory({ userId: "u1", brandExtractionId: "b1" })).toBeUndefined();
  });

  it("throws PersistenceError when the query errors", async () => {
    order.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(assemblePerformanceMemory({ userId: "u1", brandExtractionId: "b1" })).rejects.toBeInstanceOf(
      PersistenceError,
    );
  });
});
