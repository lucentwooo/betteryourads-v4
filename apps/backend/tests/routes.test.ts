import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/extract.js", () => ({ runExtract: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { runExtract } from "../src/pipelines/extract.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { ValidationError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("POST /api/extract", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/extract").send({ url: "https://acme.com" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(runExtract).not.toHaveBeenCalled();
  });

  it("returns 200 with the measured data for an approved user", async () => {
    approve();
    vi.mocked(runExtract).mockResolvedValue({ title: "Acme" } as any);
    const res = await request(app)
      .post("/api/extract")
      .set("Authorization", "Bearer ok")
      .send({ url: "https://acme.com" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Acme");
  });

  it("maps ValidationError to 422 with a typed error body", async () => {
    approve();
    vi.mocked(runExtract).mockRejectedValue(new ValidationError("bad url"));
    const res = await request(app)
      .post("/api/extract")
      .set("Authorization", "Bearer ok")
      .send({ url: "nope" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/config", () => {
  it("returns model + key-presence flags, never secret values", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("openrouterConfigured");
    expect(JSON.stringify(res.body)).not.toContain("sk-");
  });
});
