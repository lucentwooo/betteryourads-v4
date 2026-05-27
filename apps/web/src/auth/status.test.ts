import { describe, it, expect } from "vitest";
import { deriveStatus } from "./status";

const profile = (approved: boolean) => ({ approved, email: "a@b.com", is_admin: false });

describe("deriveStatus", () => {
  it("is signed-out with no session", () => {
    expect(deriveStatus(false, null)).toBe("signed-out");
  });
  it("is loading with a session but no profile yet", () => {
    expect(deriveStatus(true, null)).toBe("loading");
  });
  it("is approved when the profile is approved", () => {
    expect(deriveStatus(true, profile(true))).toBe("approved");
  });
  it("is awaiting-approval when the profile is not approved", () => {
    expect(deriveStatus(true, profile(false))).toBe("awaiting-approval");
  });
});
