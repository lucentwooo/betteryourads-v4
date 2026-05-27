import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/ad-prompt.js", () => ({ runAdPrompt: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  getBrandExtraction: vi.fn(),
  saveAdPrompt: vi.fn(),
  assemblePerformanceMemory: vi.fn(),
}));

import { runAdPrompt } from "../src/pipelines/ad-prompt.js";
import {
  getUserFromToken,
  isApproved,
  getBrandExtraction,
  saveAdPrompt,
  assemblePerformanceMemory,
} from "../src/services/supabase.js";
import { ValidationError, OpenRouterError, PersistenceError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const body = {
  brandExtraction: { brand_identity: { brand_name: "Acme" } },
  referenceAdImage: "data:image/png;base64,REF",
  logoImage: "data:image/png;base64,LOGO",
};

describe("POST /api/ad-prompt", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/ad-prompt").send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runAdPrompt).not.toHaveBeenCalled();
  });

  it("returns 200 with { id, adPrompt } for an approved user", async () => {
    approve();
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    vi.mocked(saveAdPrompt).mockResolvedValue({ id: "p1" });
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("p1");
    expect(res.body.adPrompt.ad_prompt.goal).toBe("x");
    // inline brandExtraction → no lookup; no productAsset → variant no_asset
    expect(getBrandExtraction).not.toHaveBeenCalled();
    expect(vi.mocked(saveAdPrompt).mock.calls[0][0].variant).toBe("no_asset");
    expect(assemblePerformanceMemory).not.toHaveBeenCalled();
  });

  it("resolves brandExtractionId, assembles performance memory, and persists w_asset", async () => {
    approve();
    vi.mocked(getBrandExtraction).mockResolvedValue({ brand_identity: { brand_name: "Acme" } });
    vi.mocked(assemblePerformanceMemory).mockResolvedValue([{ performance: { ctr: 0.05 }, ad_prompt: {} }]);
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    vi.mocked(saveAdPrompt).mockResolvedValue({ id: "p2" });
    const res = await request(app)
      .post("/api/ad-prompt")
      .set("Authorization", "Bearer ok")
      .send({
        brandExtractionId: "b1",
        referenceAdImage: "data:image/png;base64,REF",
        logoImage: "data:image/png;base64,LOGO",
        productAsset: "data:image/png;base64,ASSET",
      });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("p2");
    expect(getBrandExtraction).toHaveBeenCalledWith("b1");
    expect(assemblePerformanceMemory).toHaveBeenCalledWith({ userId: "u1", brandExtractionId: "b1" });
    const passedToPipeline = vi.mocked(runAdPrompt).mock.calls[0][0];
    expect(passedToPipeline.performanceMemory).toEqual([{ performance: { ctr: 0.05 }, ad_prompt: {} }]);
    expect(vi.mocked(saveAdPrompt).mock.calls[0][0].variant).toBe("w_asset");
    expect(vi.mocked(saveAdPrompt).mock.calls[0][0].brandExtractionId).toBe("b1");
  });

  it("422s when brandExtractionId is not found", async () => {
    approve();
    vi.mocked(getBrandExtraction).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/ad-prompt")
      .set("Authorization", "Bearer ok")
      .send({ brandExtractionId: "missing", referenceAdImage: "x", logoImage: "y" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(runAdPrompt).not.toHaveBeenCalled();
  });

  it("maps a PersistenceError from the save to 500", async () => {
    approve();
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    vi.mocked(saveAdPrompt).mockRejectedValue(new PersistenceError("db down"));
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("PERSISTENCE_ERROR");
  });

  it("maps ValidationError to 422", async () => {
    approve();
    vi.mocked(runAdPrompt).mockRejectedValue(new ValidationError("bad input"));
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps OpenRouterError to 502 with stage ad-prompt", async () => {
    approve();
    vi.mocked(runAdPrompt).mockRejectedValue(new OpenRouterError("upstream down", "ad-prompt"));
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("OPENROUTER_ERROR");
    expect(res.body.error.stage).toBe("ad-prompt");
  });
});
