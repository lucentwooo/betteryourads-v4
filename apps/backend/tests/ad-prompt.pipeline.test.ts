import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/openrouter.js", () => ({ chat: vi.fn() }));

import { chat } from "../src/services/openrouter.js";
import { runAdPrompt } from "../src/pipelines/ad-prompt.js";
import { ValidationError, OpenRouterError } from "../src/lib/errors.js";

const brandExtraction = { brand_identity: { brand_name: "Acme" }, schema_version: 1 };
const REF = "data:image/png;base64,REF";
const LOGO = "data:image/png;base64,LOGO";
const ASSET = "data:image/png;base64,ASSET";

const validAd = {
  reference_ad_analysis: { aspect_ratio: "1:1" },
  reskin_map: { target_brand: "Acme" },
  ad_prompt: { goal: "promote", canvas: { aspect_ratio: "1:1" } },
};

/** Pull the assembled user-message text out of the (mocked) chat call. */
function lastText(callIndex = 0): string {
  const args = vi.mocked(chat).mock.calls[callIndex][0];
  const part = (args.messages[0].content as { type: string; text?: string }[])[0];
  return part.text ?? "";
}
function lastContent(callIndex = 0) {
  return vi.mocked(chat).mock.calls[callIndex][0].messages[0].content as unknown[];
}

beforeEach(() => vi.resetAllMocks());

describe("runAdPrompt", () => {
  it("rejects a malformed request before calling the model", async () => {
    await expect(runAdPrompt({ brandExtraction, referenceAdImage: REF } as never)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(chat).not.toHaveBeenCalled();
  });

  it("returns a validated AdPrompt with schema_version stamped", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify(validAd));
    const out = await runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO });
    expect(out.ad_prompt?.canvas?.aspect_ratio).toBe("1:1");
    expect(out.reskin_map).toBeTruthy();
    expect(out.schema_version).toBe(1);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("selects the w-asset variant and attaches the product image when productAsset is present", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify(validAd));
    await runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO, productAsset: ASSET });
    expect(lastText()).toContain("PRODUCT_VISUAL_IMAGE");
    expect(lastContent()).toHaveLength(4); // text + ref + logo + asset
  });

  it("threads optional inputs into the prompt when present", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify(validAd));
    await runAdPrompt({
      brandExtraction,
      referenceAdImage: REF,
      logoImage: LOGO,
      userDirection: "promote the free trial",
    });
    expect(lastText()).toContain("=== OPTIONAL_USER_DIRECTION ===");
    expect(lastText()).toContain("promote the free trial");
  });

  it("repairs a first-try non-JSON reply on the second attempt", async () => {
    vi.mocked(chat).mockResolvedValueOnce("Sure! Here is your ad:").mockResolvedValueOnce(JSON.stringify(validAd));
    const out = await runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO });
    expect(out.ad_prompt).toBeTruthy();
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("throws ValidationError when JSON lacks ad_prompt twice", async () => {
    vi.mocked(chat).mockResolvedValue(JSON.stringify({ reference_ad_analysis: {}, reskin_map: {} }));
    await expect(runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("propagates an upstream OpenRouterError", async () => {
    vi.mocked(chat).mockRejectedValue(new OpenRouterError("upstream down", "ad-prompt"));
    await expect(runAdPrompt({ brandExtraction, referenceAdImage: REF, logoImage: LOGO })).rejects.toBeInstanceOf(
      OpenRouterError,
    );
  });
});
