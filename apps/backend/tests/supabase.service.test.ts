import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser }, from }),
}));

import { getUserFromToken, isApproved } from "../src/services/supabase.js";

beforeEach(() => {
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  vi.clearAllMocks(); // clears call history; keeps the chain factory implementations
});

describe("getUserFromToken", () => {
  it("returns id + email for a valid token", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } }, error: null });
    expect(await getUserFromToken("tok")).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("returns null when Supabase reports an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await getUserFromToken("tok")).toBeNull();
  });
});

describe("isApproved", () => {
  it("is true when the profile row has approved = true", async () => {
    single.mockResolvedValue({ data: { approved: true }, error: null });
    expect(await isApproved("u1")).toBe(true);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
  });

  it("is false when approved = false", async () => {
    single.mockResolvedValue({ data: { approved: false }, error: null });
    expect(await isApproved("u1")).toBe(false);
  });

  it("is false when there is no profile row", async () => {
    single.mockResolvedValue({ data: null, error: { message: "no rows" } });
    expect(await isApproved("u1")).toBe(false);
  });
});
