import { describe, it, expect } from "vitest";
import { loadEnvFile } from "../src/config/index.js";
import { getUserFromToken, isApproved } from "../src/services/supabase.js";

loadEnvFile(process.cwd());

// Provide a real token for an APPROVED test user:
//   BYA_AUTH_E2E=1 BYA_TEST_TOKEN=<jwt> npm --workspace @bya/backend run test -- auth.e2e
const token = process.env.BYA_TEST_TOKEN;
const run = process.env.BYA_AUTH_E2E === "1" && token ? describe : describe.skip;

run("auth e2e (real Supabase)", () => {
  it("resolves the token to a user and confirms approval", async () => {
    const user = await getUserFromToken(token!);
    expect(user).not.toBeNull();
    expect(await isApproved(user!.id)).toBe(true);
  }, 30_000);
});
