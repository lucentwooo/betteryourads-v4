import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/render.js", () => ({ runRender: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { runRender } from "../src/pipelines/render.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { ValidationError, KieError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const body = {
  adPrompt: { ad_prompt: { goal: "x", canvas: { aspect_ratio: "1:1" } } },
  referenceAdImage: "data:image/png;base64,REF",
  logoImage: "data:image/png;base64,LOGO",
};

describe("POST /api/render", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/render").send(body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runRender).not.toHaveBeenCalled();
  });

  it("returns 200 with { imageUrl } for an approved user", async () => {
    approve();
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBe("https://cdn/out.png");
  });

  it("maps ValidationError to 422", async () => {
    approve();
    vi.mocked(runRender).mockRejectedValue(new ValidationError("bad input"));
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps KieError to 502 with stage render", async () => {
    approve();
    vi.mocked(runRender).mockRejectedValue(new KieError("render failed"));
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("KIE_ERROR");
    expect(res.body.error.stage).toBe("render");
  });
});
