import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/extract.js", () => ({ runExtract: vi.fn() }));

import { runExtract } from "../src/pipelines/extract.js";
import { ValidationError } from "../src/lib/errors.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

describe("POST /api/extract", () => {
  it("returns 200 with the measured data", async () => {
    vi.mocked(runExtract).mockResolvedValue({ title: "Acme" } as any);
    const res = await request(app).post("/api/extract").send({ url: "https://acme.com" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Acme");
  });

  it("maps ValidationError to 422 with a typed error body", async () => {
    vi.mocked(runExtract).mockRejectedValue(new ValidationError("bad url"));
    const res = await request(app).post("/api/extract").send({ url: "nope" });
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
