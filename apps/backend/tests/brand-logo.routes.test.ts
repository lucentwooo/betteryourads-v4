import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  saveBrandLogo: vi.fn(),
}));

import { getUserFromToken, isApproved, saveBrandLogo } from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const VALID_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

describe("POST /api/brand/:id/logo", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/brand/brand-1/logo").send({ dataUrl: VALID_DATA_URL });
    expect(res.status).toBe(401);
    expect(saveBrandLogo).not.toHaveBeenCalled();
  });

  it("422s when dataUrl is missing", async () => {
    approve();
    const res = await request(app)
      .post("/api/brand/brand-1/logo")
      .set("Authorization", "Bearer ok")
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(saveBrandLogo).not.toHaveBeenCalled();
  });

  it("422s when dataUrl is an empty string", async () => {
    approve();
    const res = await request(app)
      .post("/api/brand/brand-1/logo")
      .set("Authorization", "Bearer ok")
      .send({ dataUrl: "" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(saveBrandLogo).not.toHaveBeenCalled();
  });

  it("calls saveBrandLogo and returns { url } on success", async () => {
    approve();
    vi.mocked(saveBrandLogo).mockResolvedValue({ url: "https://signed/logo.png" });
    const res = await request(app)
      .post("/api/brand/brand-1/logo")
      .set("Authorization", "Bearer ok")
      .send({ dataUrl: VALID_DATA_URL });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://signed/logo.png" });
    expect(saveBrandLogo).toHaveBeenCalledWith({
      userId: "u1",
      brandId: "brand-1",
      dataUrl: VALID_DATA_URL,
    });
  });
});
