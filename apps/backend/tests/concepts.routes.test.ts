import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/concepts.js", () => ({ runConcepts: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  saveConceptSet: vi.fn(),
}));

import { runConcepts } from "../src/pipelines/concepts.js";
import { getUserFromToken, isApproved, saveConceptSet } from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("POST /api/concepts", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/concepts").send({ brandExtraction: {}, brandExtractionId: "be1" });
    expect(res.status).toBe(401);
    expect(runConcepts).not.toHaveBeenCalled();
  });

  it("runs the pipeline, persists, and returns the set", async () => {
    approve();
    const set = { ad_ideas: [{ idea_name: "A", main_hook: "h", cta: "c" }] };
    vi.mocked(runConcepts).mockResolvedValue(set as never);
    vi.mocked(saveConceptSet).mockResolvedValue({ id: "cs1" });
    const res = await request(app)
      .post("/api/concepts")
      .set("Authorization", "Bearer ok")
      .send({ brandExtraction: { brand_identity: {} }, brandExtractionId: "be1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "cs1", conceptSet: set });
    expect(saveConceptSet).toHaveBeenCalled();
  });

  it("422s when brandExtractionId is missing", async () => {
    approve();
    const res = await request(app).post("/api/concepts").set("Authorization", "Bearer ok").send({ brandExtraction: {} });
    expect(res.status).toBe(422);
    expect(runConcepts).not.toHaveBeenCalled();
  });
});
