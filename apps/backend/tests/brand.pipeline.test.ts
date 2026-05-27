import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runBrand } from "../src/pipelines/brand.js";
import { BRAND_AGENT_GROUPS } from "../src/prompts/registry.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";
import type { MeasuredSiteData } from "@bya/shared";

const measured: MeasuredSiteData = {
  title: "Acme",
  description: "do things",
  colors: { text: [], background: [], border: [], accent_cta: [] },
  cssColorVariables: {},
  fonts: { body: null, heading: null, button: null },
  logos: [],
  text: "hello",
  finalUrl: "https://acme.com/",
};

// Disjoint slices keyed to the three agent groups.
const sliceA = {
  brand_identity: { brand_name: "Acme" },
  visual_brand_system: {},
  product_representation: {},
  offer_dna: {},
};
const sliceB = { messaging_foundation: { homepage_headline: "Hi" }, proof_library: {}, customer_dna_from_website: {} };
const sliceC = {
  external_customer_research_plan: {},
  competitor_intelligence: {},
  claim_constraints: {},
  missing_information: {},
  source_map: [],
};

/** Identify which agent group a call belongs to by the key-list embedded in its first message.
 *  Stage-1 messages always use string content; the wider type covers the multimodal union. */
function groupOf(content: string | { type: string }[]): "A" | "B" | "C" {
  const prompt = typeof content === "string" ? content : "";
  if (prompt.includes(JSON.stringify(BRAND_AGENT_GROUPS[0].keys))) return "A";
  if (prompt.includes(JSON.stringify(BRAND_AGENT_GROUPS[1].keys))) return "B";
  return "C";
}

beforeEach(() => vi.resetAllMocks());

describe("runBrand (3-agent merge)", () => {
  it("rejects a non-http URL before calling the model", async () => {
    await expect(runBrand({ url: "ftp://nope", measuredSiteData: measured })).rejects.toBeInstanceOf(ValidationError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("rejects malformed measuredSiteData before calling the model", async () => {
    await expect(
      runBrand({ url: "https://acme.com", measuredSiteData: { title: 123 } as unknown as MeasuredSiteData }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(chat).not.toHaveBeenCalled();
  });

  it("merges all three agent slices and stamps schema_version", async () => {
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      return JSON.stringify(g === "A" ? sliceA : g === "B" ? sliceB : sliceC);
    });
    const out = await runBrand({ url: "https://acme.com", measuredSiteData: measured });
    expect(out.brand_identity?.brand_name).toBe("Acme");
    expect(out.messaging_foundation?.homepage_headline).toBe("Hi");
    expect(out.competitor_intelligence).toBeTruthy();
    expect(out.schema_version).toBe(1);
    expect(chat).toHaveBeenCalledTimes(3);
  });

  it("repairs a single agent that returns non-JSON on its first try", async () => {
    const calls: Record<string, number> = { A: 0, B: 0, C: 0 };
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      calls[g]++;
      if (g === "A" && calls.A === 1) return "Sorry, no JSON here.";
      return JSON.stringify(g === "A" ? sliceA : g === "B" ? sliceB : sliceC);
    });
    const out = await runBrand({ url: "https://acme.com", measuredSiteData: measured });
    expect(out.brand_identity?.brand_name).toBe("Acme");
    expect(chat).toHaveBeenCalledTimes(4); // A retried once; B and C succeeded first try
  });

  it("returns a partial merge when a non-identity agent fails twice", async () => {
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      if (g === "B") return "no json"; // fails both attempts
      return JSON.stringify(g === "A" ? sliceA : sliceC);
    });
    const out = await runBrand({ url: "https://acme.com", measuredSiteData: measured });
    expect(out.brand_identity?.brand_name).toBe("Acme");
    expect(out.messaging_foundation).toBeUndefined(); // B's slice dropped
    expect(chat).toHaveBeenCalledTimes(4); // A(1) + B(2) + C(1)
  });

  it("throws ValidationError when the identity agent (A) fails twice", async () => {
    vi.mocked(chat).mockImplementation(async ({ messages }) => {
      const g = groupOf(messages[0].content);
      if (g === "A") return "no json";
      return JSON.stringify(g === "B" ? sliceB : sliceC);
    });
    await expect(runBrand({ url: "https://acme.com", measuredSiteData: measured })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("surfaces an OpenRouterError when every agent's call fails upstream", async () => {
    vi.mocked(chat).mockRejectedValue(new OpenRouterError("upstream down"));
    await expect(runBrand({ url: "https://acme.com", measuredSiteData: measured })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });
});
