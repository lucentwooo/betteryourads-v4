import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config/index.js";

describe("loadConfig", () => {
  it("reads models and key-presence flags from the given env", () => {
    const cfg = loadConfig({
      STAGE1_MODEL: "x/stage1",
      STAGE2_MODEL: "x/stage2",
      KIE_IMAGE_MODEL: "gpt-image-2-image-to-image",
      KIE_IMAGE_RESOLUTION: "1K",
      OPENROUTER_API_KEY: "sk-or",
    });
    expect(cfg.stage1Model).toBe("x/stage1");
    expect(cfg.kieResolution).toBe("1K");
    expect(cfg.openrouterConfigured).toBe(true);
    expect(cfg.kieConfigured).toBe(false);
  });

  it("defaults KIE resolution to 1K when unset", () => {
    expect(loadConfig({}).kieResolution).toBe("1K");
  });

  it("exposes the browser-safe Supabase url + anon key, never the service-role key", () => {
    const cfg = loadConfig({
      SUPABASE_URL: "https://proj.supabase.co",
      SUPABASE_ANON_KEY: "anon-123",
      SUPABASE_SERVICE_ROLE_KEY: "service-secret-456",
    });
    expect(cfg.supabaseUrl).toBe("https://proj.supabase.co");
    expect(cfg.supabaseAnonKey).toBe("anon-123");
    expect(JSON.stringify(cfg)).not.toContain("service-secret-456");
  });
});
