import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "@/lib/auth";

describe("session cookie", () => {
  it("verifies a token it signed", async () => {
    const token = await signSession("secret-123");
    expect(await verifySession(token, "secret-123")).toBe(true);
  });
  it("rejects a tampered token", async () => {
    const token = await signSession("secret-123");
    expect(await verifySession(token + "x", "secret-123")).toBe(false);
  });
  it("rejects under a different secret", async () => {
    const token = await signSession("secret-123");
    expect(await verifySession(token, "other")).toBe(false);
  });
});
