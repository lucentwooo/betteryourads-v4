import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/render.js", () => ({ runRender: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  getAdPrompt: vi.fn(),
  persistRenderedAd: vi.fn(),
}));

import { runRender } from "../src/pipelines/render.js";
import { getUserFromToken, isApproved, getAdPrompt, persistRenderedAd } from "../src/services/supabase.js";
import { ValidationError, KieError, PersistenceError } from "../src/lib/errors.js";
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

  it("returns 200 with { id, imageUrl } (signed) for an approved user", async () => {
    approve();
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    vi.mocked(persistRenderedAd).mockResolvedValue({ id: "a1", imageUrl: "https://signed/x.png" });
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("a1");
    expect(res.body.imageUrl).toBe("https://signed/x.png");
    expect(getAdPrompt).not.toHaveBeenCalled(); // inline adPrompt
    const persistArgs = vi.mocked(persistRenderedAd).mock.calls[0][0];
    expect(persistArgs.userId).toBe("u1");
    expect(persistArgs.imageUrl).toBe("https://cdn/out.png");
    expect(persistArgs.aspectRatio).toBe("1:1");
  });

  it("resolves adPromptId before rendering", async () => {
    approve();
    vi.mocked(getAdPrompt).mockResolvedValue({ ad_prompt: { goal: "x", canvas: { aspect_ratio: "9:16" } } });
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    vi.mocked(persistRenderedAd).mockResolvedValue({ id: "a2", imageUrl: "https://signed/y.png" });
    const res = await request(app)
      .post("/api/render")
      .set("Authorization", "Bearer ok")
      .send({ adPromptId: "p1", referenceAdImage: "data:image/png;base64,REF", logoImage: "data:image/png;base64,LOGO" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("a2");
    expect(getAdPrompt).toHaveBeenCalledWith("p1");
    expect(vi.mocked(persistRenderedAd).mock.calls[0][0].adPromptId).toBe("p1");
  });

  it("422s when adPromptId is not found", async () => {
    approve();
    vi.mocked(getAdPrompt).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/render")
      .set("Authorization", "Bearer ok")
      .send({ adPromptId: "missing", referenceAdImage: "x", logoImage: "y" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(runRender).not.toHaveBeenCalled();
  });

  it("maps a PersistenceError from the save to 500", async () => {
    approve();
    vi.mocked(runRender).mockResolvedValue("https://cdn/out.png");
    vi.mocked(persistRenderedAd).mockRejectedValue(new PersistenceError("storage down"));
    const res = await request(app).post("/api/render").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("PERSISTENCE_ERROR");
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
