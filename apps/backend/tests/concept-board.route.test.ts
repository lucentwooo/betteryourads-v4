import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/pipelines/concept-board.js", () => ({ runConceptBoard: vi.fn() }));
vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  getBrandExtraction: vi.fn(),
  saveConceptBoard: vi.fn(),
  getConceptBoard: vi.fn(),
  setBrandGoal: vi.fn(),
}));

import { runConceptBoard } from "../src/pipelines/concept-board.js";
import {
  getUserFromToken,
  isApproved,
  getBrandExtraction,
  saveConceptBoard,
  getConceptBoard,
  setBrandGoal,
} from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function approve() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

const fakeBoard = {
  goal: "trials",
  concepts: [{ angle: "Pain point", stage: "solution", headline: "Stop the pain", rationale: "It works" }],
};

const fakeBrand = { brand_identity: { name: "Acme" } };

describe("POST /api/concept-board", () => {
  it("401s without a token", async () => {
    const res = await request(app)
      .post("/api/concept-board")
      .send({ brandExtractionId: "be1", goal: "trials" });
    expect(res.status).toBe(401);
    expect(runConceptBoard).not.toHaveBeenCalled();
  });

  it("422s with a bad goal", async () => {
    approve();
    const res = await request(app)
      .post("/api/concept-board")
      .set("Authorization", "Bearer ok")
      .send({ brandExtractionId: "be1", goal: "INVALID_GOAL" });
    expect(res.status).toBe(422);
    expect(runConceptBoard).not.toHaveBeenCalled();
  });

  it("422s when brandExtractionId is missing", async () => {
    approve();
    const res = await request(app)
      .post("/api/concept-board")
      .set("Authorization", "Bearer ok")
      .send({ goal: "trials" });
    expect(res.status).toBe(422);
    expect(runConceptBoard).not.toHaveBeenCalled();
  });

  it("422s when brand not found", async () => {
    approve();
    vi.mocked(getBrandExtraction).mockResolvedValue(null);
    const res = await request(app)
      .post("/api/concept-board")
      .set("Authorization", "Bearer ok")
      .send({ brandExtractionId: "be1", goal: "trials" });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("Brand not found.");
    expect(runConceptBoard).not.toHaveBeenCalled();
  });

  it("happy path: calls pipeline + persistence and returns board", async () => {
    approve();
    vi.mocked(getBrandExtraction).mockResolvedValue(fakeBrand as never);
    vi.mocked(runConceptBoard).mockResolvedValue(fakeBoard as never);
    vi.mocked(saveConceptBoard).mockResolvedValue({ id: "cb1" });
    vi.mocked(setBrandGoal).mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/concept-board")
      .set("Authorization", "Bearer ok")
      .send({ brandExtractionId: "be1", goal: "trials" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ board: fakeBoard });
    expect(runConceptBoard).toHaveBeenCalledWith({ analysis: fakeBrand, goal: "trials" });
    expect(saveConceptBoard).toHaveBeenCalled();
    expect(setBrandGoal).toHaveBeenCalledWith("u1", "be1", "trials");
  });
});

describe("GET /api/concept-board/:brandId", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/concept-board/be1");
    expect(res.status).toBe(401);
  });

  it("404s when no board exists", async () => {
    approve();
    vi.mocked(getConceptBoard).mockResolvedValue(null);
    const res = await request(app)
      .get("/api/concept-board/be1")
      .set("Authorization", "Bearer ok");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("No concept board.");
  });

  it("returns board when it exists", async () => {
    approve();
    vi.mocked(getConceptBoard).mockResolvedValue(fakeBoard as never);
    const res = await request(app)
      .get("/api/concept-board/be1")
      .set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ board: fakeBoard });
  });
});

describe("PATCH /api/brand/:id/goal", () => {
  it("401s without a token", async () => {
    const res = await request(app)
      .patch("/api/brand/be1/goal")
      .send({ goal: "paid" });
    expect(res.status).toBe(401);
  });

  it("422s with a bad goal", async () => {
    approve();
    const res = await request(app)
      .patch("/api/brand/be1/goal")
      .set("Authorization", "Bearer ok")
      .send({ goal: "bad" });
    expect(res.status).toBe(422);
    expect(setBrandGoal).not.toHaveBeenCalled();
  });

  it("calls setBrandGoal and returns ok", async () => {
    approve();
    vi.mocked(setBrandGoal).mockResolvedValue(undefined);
    const res = await request(app)
      .patch("/api/brand/be1/goal")
      .set("Authorization", "Bearer ok")
      .send({ goal: "paid" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(setBrandGoal).toHaveBeenCalledWith("u1", "be1", "paid");
  });
});
