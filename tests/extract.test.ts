import { describe, it, expect } from "vitest";
import { stripFences, parseJsonLoose, mapAspectRatio } from "@/lib/extract";

describe("stripFences", () => {
  it("pulls JSON out of a fenced block", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
describe("parseJsonLoose", () => {
  it("parses fenced JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("parses the outermost object when surrounded by prose", () => {
    expect(parseJsonLoose('here you go: {"a":2} thanks')).toEqual({ a: 2 });
  });
});
describe("mapAspectRatio", () => {
  it("passes supported ratios through", () => {
    expect(mapAspectRatio("16:9")).toBe("16:9");
  });
  it("maps 4:5 to nearest portrait 3:4", () => {
    expect(mapAspectRatio("4:5")).toBe("3:4");
  });
  it("defaults junk to auto", () => {
    expect(mapAspectRatio("banana")).toBe("auto");
  });
});
