import { describe, it, expect } from "vitest";
import { parseJsonLoose } from "../src/lib/json.js";

describe("parseJsonLoose", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("tolerates // comments and trailing commas", () => {
    expect(parseJsonLoose('{\n  "a": 1, // note\n  "b": 2,\n}')).toEqual({ a: 1, b: 2 });
  });

  it("extracts the outermost object when surrounded by prose", () => {
    expect(parseJsonLoose('Sure! Here you go: {"a":1} — hope that helps')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => parseJsonLoose("I cannot comply with that request.")).toThrow();
  });
});
