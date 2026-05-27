import { describe, it, expect } from "vitest";
import { AppError, ExtractionError, OpenRouterError, toHttpError } from "../src/lib/errors.js";

describe("errors", () => {
  it("ExtractionError carries stage + 502 status", () => {
    const e = new ExtractionError("nav failed");
    expect(e).toBeInstanceOf(AppError);
    expect(e.stage).toBe("extract");
    expect(e.status).toBe(502);
  });

  it("toHttpError maps AppError to its status/code/stage", () => {
    expect(toHttpError(new ExtractionError("boom"))).toEqual({
      status: 502,
      body: { error: { code: "EXTRACTION_ERROR", message: "boom", stage: "extract" } },
    });
  });

  it("toHttpError maps unknown errors to a 500 without leaking internals", () => {
    const r = toHttpError(new Error("secret stack detail"));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("INTERNAL");
  });
});

describe("OpenRouterError", () => {
  it("defaults to the brand stage with a 502 status", () => {
    const e = new OpenRouterError("upstream 500");
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("OPENROUTER_ERROR");
    expect(e.status).toBe(502);
    expect(e.stage).toBe("brand");
  });

  it("accepts an explicit stage", () => {
    expect(new OpenRouterError("boom", "ad-prompt").stage).toBe("ad-prompt");
  });
});
