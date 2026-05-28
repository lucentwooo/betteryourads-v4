import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
  listAllUsers: vi.fn(),
  deleteUser: vi.fn(),
  setUserApproved: vi.fn(),
}));

import { getUserFromToken, isApproved, setUserApproved } from "../src/services/supabase.js";
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
