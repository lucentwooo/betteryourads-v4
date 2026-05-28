import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listAllUsers: vi.fn(),
  deleteUser: vi.fn(),
  setUserApproved: vi.fn(),
  createReferenceAd: vi.fn(),
  deleteReferenceAd: vi.fn(),
}));

import { getUserFromToken, isApproved, setUserApproved, createReferenceAd, deleteReferenceAd } from "../src/services/supabase.js";
import { createServer } from "../src/server.js";

const app = createServer();
beforeEach(() => vi.resetAllMocks());

function asAdmin(id = "admin-id") {
  vi.mocked(getUserFromToken).mockResolvedValue({ id, email: "admin@betteryourads.dev" });
  vi.mocked(isApproved).mockResolvedValue(true);
}
function asNonAdmin() {
  vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "user@example.com" });
  vi.mocked(isApproved).mockResolvedValue(true);
}

describe("PATCH /api/admin/users/:id/approval", () => {
  it("approves a user for an admin", async () => {
    asAdmin();
    const res = await request(app).patch("/api/admin/users/u2/approval").set("Authorization", "Bearer ok").send({ approved: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(setUserApproved).toHaveBeenCalledWith("u2", true);
  });

  it("revokes a user for an admin", async () => {
    asAdmin();
    const res = await request(app).patch("/api/admin/users/u2/approval").set("Authorization", "Bearer ok").send({ approved: false });
    expect(res.status).toBe(200);
    expect(setUserApproved).toHaveBeenCalledWith("u2", false);
  });

  it("403s for a non-admin and never touches the flag", async () => {
    asNonAdmin();
    const res = await request(app).patch("/api/admin/users/u2/approval").set("Authorization", "Bearer ok").send({ approved: true });
    expect(res.status).toBe(403);
    expect(setUserApproved).not.toHaveBeenCalled();
  });

  it("403s when an admin tries to change their own approval", async () => {
    asAdmin("admin-id");
    const res = await request(app).patch("/api/admin/users/admin-id/approval").set("Authorization", "Bearer ok").send({ approved: false });
    expect(res.status).toBe(403);
    expect(setUserApproved).not.toHaveBeenCalled();
  });

  it("422s when `approved` is not a boolean", async () => {
    asAdmin();
    const res = await request(app).patch("/api/admin/users/u2/approval").set("Authorization", "Bearer ok").send({ approved: "yes" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(setUserApproved).not.toHaveBeenCalled();
  });

  it("401s without a token", async () => {
    const res = await request(app).patch("/api/admin/users/u2/approval").send({ approved: true });
    expect(res.status).toBe(401);
    expect(setUserApproved).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/reference-ads", () => {
  const body = { variant: "with_asset", label: "Hero", dataUrl: "data:image/png;base64,AAAA" };

  it("creates a reference for an admin", async () => {
    asAdmin();
    vi.mocked(createReferenceAd).mockResolvedValue({ id: "r1", variant: "with_asset", label: "Hero", url: "https://signed/r1.png", createdAt: "2026-05-28T00:00:00Z" });
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("r1");
    expect(createReferenceAd).toHaveBeenCalledWith({ variant: "with_asset", label: "Hero", dataUrl: "data:image/png;base64,AAAA", createdBy: "admin-id" });
  });

  it("422s on an invalid variant", async () => {
    asAdmin();
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send({ ...body, variant: "nope" });
    expect(res.status).toBe(422);
    expect(createReferenceAd).not.toHaveBeenCalled();
  });

  it("422s when dataUrl is missing", async () => {
    asAdmin();
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send({ variant: "no_asset" });
    expect(res.status).toBe(422);
    expect(createReferenceAd).not.toHaveBeenCalled();
  });

  it("403s for a non-admin", async () => {
    asNonAdmin();
    const res = await request(app).post("/api/admin/reference-ads").set("Authorization", "Bearer ok").send(body);
    expect(res.status).toBe(403);
    expect(createReferenceAd).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/reference-ads/:id", () => {
  it("deletes a reference for an admin", async () => {
    asAdmin();
    vi.mocked(deleteReferenceAd).mockResolvedValue(undefined);
    const res = await request(app).delete("/api/admin/reference-ads/r1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(deleteReferenceAd).toHaveBeenCalledWith("r1");
  });

  it("403s for a non-admin", async () => {
    asNonAdmin();
    const res = await request(app).delete("/api/admin/reference-ads/r1").set("Authorization", "Bearer ok");
    expect(res.status).toBe(403);
    expect(deleteReferenceAd).not.toHaveBeenCalled();
  });
});
