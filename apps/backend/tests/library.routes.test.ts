import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listBrandExtractions: vi.fn(),
  getBrandDetail: vi.fn(),
  listGeneratedAds: vi.fn(),
}));

import {
  getUserFromToken,
  isApproved,
  listBrandExtractions,
  getBrandDetail,
  listGeneratedAds,
} from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("GET /api/brands", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/brands");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(listBrandExtractions).not.toHaveBeenCalled();
  });

  it("returns the user's brand summaries", async () => {
    approve();
    vi.mocked(listBrandExtractions).mockResolvedValue([
      { id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-05-28T00:00:00Z" },
    ]);
    const res = await request(app).get("/api/brands").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "b1", websiteUrl: "https://acme.com", updatedAt: "2026-05-28T00:00:00Z" }]);
    expect(listBrandExtractions).toHaveBeenCalledWith("u1");
  });
});

describe("GET /api/brand/:id", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/brand/b1");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(getBrandDetail).not.toHaveBeenCalled();
  });

  it("404s when the brand is not found", async () => {
    approve();
    vi.mocked(getBrandDetail).mockResolvedValue(null);
    const res = await request(app).get("/api/brand/nope").set("Authorization", "Bearer ok");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the brand detail when found", async () => {
    approve();
    vi.mocked(getBrandDetail).mockResolvedValue({
      id: "b1",
      brandExtraction: { brand_identity: { brand_name: "Acme" } },
      measuredSiteData: { title: "Acme" },
    });
    const res = await request(app).get("/api/brand/b1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("b1");
    expect(res.body.brandExtraction.brand_identity.brand_name).toBe("Acme");
    expect(getBrandDetail).toHaveBeenCalledWith("b1", "u1");
  });
});

describe("GET /api/ads", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/ads");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(listGeneratedAds).not.toHaveBeenCalled();
  });

  it("returns the user's ads with signed urls", async () => {
    approve();
    vi.mocked(listGeneratedAds).mockResolvedValue([
      { id: "a1", imageUrl: "https://signed/x.png", aspectRatio: "1:1", resolution: "1K", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    const res = await request(app).get("/api/ads").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body[0].imageUrl).toBe("https://signed/x.png");
    expect(listGeneratedAds).toHaveBeenCalledWith("u1", undefined);
  });

  it("passes brandId to listGeneratedAds when provided as a query param", async () => {
    approve();
    vi.mocked(listGeneratedAds).mockResolvedValue([]);
    const res = await request(app).get("/api/ads?brandId=brand-x").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(listGeneratedAds).toHaveBeenCalledWith("u1", "brand-x");
  });
});
