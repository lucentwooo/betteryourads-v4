import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/services/supabase.js", () => ({
  getUserFromToken: vi.fn(),
  isApproved: vi.fn(),
}));

import { getUserFromToken, isApproved } from "../src/services/supabase.js";
import { requireApprovedUser } from "../src/middleware/require-approved-user.js";

function makeApp() {
  const app = express();
  app.get("/protected", requireApprovedUser, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  return app;
}

const app = makeApp();
beforeEach(() => vi.resetAllMocks());

describe("requireApprovedUser", () => {
  it("401s when no Authorization header is present", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
    expect(getUserFromToken).not.toHaveBeenCalled();
  });

  it("401s when the token is invalid", async () => {
    vi.mocked(getUserFromToken).mockResolvedValue(null);
    const res = await request(app).get("/protected").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("403s when the user is not approved", async () => {
    vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
    vi.mocked(isApproved).mockResolvedValue(false);
    const res = await request(app).get("/protected").set("Authorization", "Bearer ok");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_APPROVED");
  });

  it("passes through and attaches req.user when approved", async () => {
    vi.mocked(getUserFromToken).mockResolvedValue({ id: "u1", email: "a@b.com" });
    vi.mocked(isApproved).mockResolvedValue(true);
    const res = await request(app).get("/protected").set("Authorization", "Bearer ok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, user: { id: "u1", email: "a@b.com" } });
  });
});
