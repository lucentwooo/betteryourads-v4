import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/brand.js", () => ({ runBrand: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  saveBrandExtraction: vi.fn(),
}));

import { runBrand } from "../src/pipelines/brand.js";
import { getUserFromToken, isApproved, saveBrandExtraction } from "../src/services/supabase.js";
import { ValidationError, OpenRouterError, PersistenceError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("POST /api/brand", () => {
  it("401s without a token", async () => {
    const res = await request(app)
      .post("/api/brand")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runBrand).not.toHaveBeenCalled();
  });

  it("returns 200 with { id, brandExtraction } for an approved user", async () => {
    approve();
    vi.mocked(runBrand).mockResolvedValue({ brand_identity: { brand_name: "Acme" }, schema_version: 1 });
    vi.mocked(saveBrandExtraction).mockResolvedValue({ id: "b1" });
    const res = await request(app)
      .post("/api/brand")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("b1");
    expect(res.body.brandExtraction.brand_identity.brand_name).toBe("Acme");
    expect(saveBrandExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        url: "https://acme.com",
        brandExtraction: { brand_identity: { brand_name: "Acme" }, schema_version: 1 },
      }),
    );
  });

  it("includes partialAnalysis listing missing sections when an agent slice is absent", async () => {
    approve();
    // Only brand_identity succeeded; every other expected section is missing.
    vi.mocked(runBrand).mockResolvedValue({ brand_identity: { brand_name: "Acme" }, schema_version: 1 });
    vi.mocked(saveBrandExtraction).mockResolvedValue({ id: "b1" });
    const res = await request(app)
      .post("/api/brand")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(200);
    expect(res.body.partialAnalysis).not.toBeNull();
    expect(res.body.partialAnalysis.missing).toContain("messaging_foundation");
    expect(res.body.partialAnalysis.missing).toContain("competitor_intelligence");
    expect(res.body.partialAnalysis.missing).not.toContain("brand_identity");
  });

  it("returns partialAnalysis null when every expected section is present", async () => {
    approve();
    vi.mocked(runBrand).mockResolvedValue({
      schema_version: 1,
      brand_identity: {},
      visual_brand_system: {},
      product_representation: {},
      offer_dna: {},
      messaging_foundation: {},
      proof_library: {},
      customer_dna_from_website: {},
      external_customer_research_plan: {},
      competitor_intelligence: {},
      claim_constraints: {},
      missing_information: {},
    });
    vi.mocked(saveBrandExtraction).mockResolvedValue({ id: "b1" });
    const res = await request(app)
      .post("/api/brand")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(200);
    expect(res.body.partialAnalysis).toBeNull();
  });

  it("maps ValidationError to 422", async () => {
    approve();
    vi.mocked(runBrand).mockRejectedValue(new ValidationError("bad input"));
    const res = await request(app).post("/api/brand").set("Authorization", "Bearer ok").send({ url: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps OpenRouterError to 502", async () => {
    approve();
    vi.mocked(runBrand).mockRejectedValue(new OpenRouterError("upstream down"));
    const res = await request(app)
      .post("/api/brand")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("OPENROUTER_ERROR");
    expect(res.body.error.stage).toBe("brand");
  });

  it("maps a PersistenceError from the save to 500", async () => {
    approve();
    vi.mocked(runBrand).mockResolvedValue({ brand_identity: { brand_name: "Acme" }, schema_version: 1 });
    vi.mocked(saveBrandExtraction).mockRejectedValue(new PersistenceError("db down"));
    const res = await request(app)
      .post("/api/brand")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com", measuredSiteData: { title: "Acme" } });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("PERSISTENCE_ERROR");
  });
});
