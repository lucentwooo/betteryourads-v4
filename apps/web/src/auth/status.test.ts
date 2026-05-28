import { describe, it, expect } from "vitest";
import { deriveStatus, type ProfileLoad } from "./status";

const profile = (approved: boolean) => ({ approved, email: "a@b.com", is_admin: false });
const loaded = (approved: boolean): ProfileLoad => ({ state: "loaded", profile: profile(approved) });

describe("deriveStatus", () => {
  it("is signed-out with no session", () => {
    expect(deriveStatus(false, { state: "loading" })).toBe("signed-out");
  });
  it("is loading with a session but profile still loading", () => {
    expect(deriveStatus(true, { state: "loading" })).toBe("loading");
  });
  it("is approved when the profile is approved", () => {
    expect(deriveStatus(true, loaded(true))).toBe("approved");
  });
  it("is awaiting-approval when the profile is not approved", () => {
    expect(deriveStatus(true, loaded(false))).toBe("awaiting-approval");
  });
  it("is awaiting-approval when the profile row is missing (loaded but null)", () => {
    expect(deriveStatus(true, { state: "loaded", profile: null })).toBe("awaiting-approval");
  });
  it("is error (not endless loading) when the profile lookup failed", () => {
    expect(deriveStatus(true, { state: "error" })).toBe("error");
  });
});
