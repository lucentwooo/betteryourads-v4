import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/ad-prompt.js", () => ({ runAdPrompt: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { runAdPrompt } from "../src/pipelines/ad-prompt.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";
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

  it("returns 200 with { adPrompt } for an approved user", async () => {
    approve();
    vi.mocked(runAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x" }, schema_version: 1 });
    const res = await request(app).post("/api/ad-prompt").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.adPrompt.ad_prompt.goal).toBe("x");
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
