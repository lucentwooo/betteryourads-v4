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
const storage = { from: vi.fn(() => ({ upload, createSignedUrl })) };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: vi.fn() }, from, storage }),
}));

import {
  saveBrandExtraction,
  getBrandExtraction,
  saveAdPrompt,
  getAdPrompt,
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
    const be = await getBrandExtraction("b1");
    expect(be?.brand_identity).toEqual({ brand_name: "Acme" });
    expect(eq).toHaveBeenCalledWith("id", "b1");
  });

  it("returns null when no row is found", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await getBrandExtraction("missing")).toBeNull();
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
    const ap = await getAdPrompt("p1");
    expect(ap?.ad_prompt?.goal).toBe("x");
    expect(eq).toHaveBeenCalledWith("id", "p1");
  });

  it("returns null when no row is found", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await getAdPrompt("missing")).toBeNull();
  });
});
