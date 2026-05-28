import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  countAdsToday: vi.fn(),
  createBatch: vi.fn(),
  getBatch: vi.fn(),
}));
vi.mock("../src/services/batch-worker.js", () => ({ runBatch: vi.fn() }));

import { getUserFromToken, isApproved, countAdsToday, createBatch, getBatch } from "../src/services/supabase.js";
import { runBatch } from "../src/services/batch-worker.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runBatch).mockResolvedValue(undefined);
});

function approve(email = "user@y.z") {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const item = { concept: { idea_number: 1, idea_name: "A", main_hook: "h", cta: "c" }, referenceAdImage: "data:r", logoImage: "data:l" };

describe("POST /api/batch", () => {
  it("401s without a token", async () => {
    const res = await request(app).post("/api/batch").send({ brandExtractionId: "be1", brandExtraction: {}, items: [item] });
    expect(res.status).toBe(401);
  });

  it("creates a batch and kicks off the worker", async () => {
    approve();
    vi.mocked(countAdsToday).mockResolvedValue(0);
    vi.mocked(createBatch).mockResolvedValue({ batchId: "b1", itemIds: ["i1"] });
    const res = await request(app).post("/api/batch").set("Authorization", "Bearer ok").send({ brandExtractionId: "be1", brandExtraction: {}, items: [item] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ batchId: "b1" });
    expect(runBatch).toHaveBeenCalled();
  });

  it("429s when the batch exceeds the remaining daily limit", async () => {
    approve();
    vi.mocked(countAdsToday).mockResolvedValue(9);
    const res = await request(app).post("/api/batch").set("Authorization", "Bearer ok").send({ brandExtractionId: "be1", brandExtraction: {}, items: [item, item] });
    expect(res.status).toBe(429);
    expect(createBatch).not.toHaveBeenCalled();
  });

  it("422s when an item is missing required assets", async () => {
    approve();
    vi.mocked(countAdsToday).mockResolvedValue(0);
    const res = await request(app).post("/api/batch").set("Authorization", "Bearer ok").send({ brandExtractionId: "be1", brandExtraction: {}, items: [{ concept: { idea_name: "A", main_hook: "h", cta: "c" }, logoImage: "data:l" }] });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/batch/:id", () => {
  it("returns the batch view", async () => {
    approve();
    vi.mocked(getBatch).mockResolvedValue({ id: "b1", status: "running", items: [] });
    const res = await request(app).get("/api/batch/b1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("b1");
  });

  it("404s for an unknown batch", async () => {
    approve();
    vi.mocked(getBatch).mockResolvedValue(null);
    const res = await request(app).get("/api/batch/nope").set("Authorization", "Bearer ok");
    expect(res.status).toBe(404);
  });
});
