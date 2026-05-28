import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listReferenceAds: vi.fn(),
}));

import { getUserFromToken, isApproved, listReferenceAds } from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("GET /api/reference-ads", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/reference-ads?variant=no_asset");
    expect(res.status).toBe(401);
    expect(listReferenceAds).not.toHaveBeenCalled();
  });

  it("422s on a missing/invalid variant", async () => {
    approve();
    const res = await request(app).get("/api/reference-ads?variant=bogus").set("Authorization", "Bearer ok");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(listReferenceAds).not.toHaveBeenCalled();
  });

  it("returns references for the requested variant", async () => {
    approve();
    vi.mocked(listReferenceAds).mockResolvedValue([
      { id: "r1", variant: "with_asset", label: "Hero", url: "https://signed/r1.png", createdAt: "2026-05-28T00:00:00Z" },
    ]);
    const res = await request(app).get("/api/reference-ads?variant=with_asset").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe("r1");
    expect(listReferenceAds).toHaveBeenCalledWith("with_asset");
  });
});
