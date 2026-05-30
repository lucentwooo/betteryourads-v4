import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startOfDayInTz, dailyLimit, generationTz } from "../src/lib/usage.js";

// A known UTC instant: 2024-06-15 03:30:00 UTC
// Sydney (AEST, UTC+10) = 2024-06-15 13:30:00 local  → same day, midnight is 2024-06-14 14:00:00 UTC
// Sydney (AEDT, UTC+11) is only in effect Nov–Apr, so June is AEST (+10).
const NOW_UTC = new Date("2024-06-15T03:30:00.000Z");

// Expected Sydney local midnight on 2024-06-15 → UTC = 2024-06-14T14:00:00Z (AEST = UTC+10)
const EXPECTED_SYDNEY_MIDNIGHT = new Date("2024-06-14T14:00:00.000Z");

describe("startOfDayInTz", () => {
  it("returns the UTC instant of Sydney local midnight for a given now (AEST, UTC+10)", () => {
    const result = startOfDayInTz("Australia/Sydney", NOW_UTC);
    expect(result.toISOString()).toBe(EXPECTED_SYDNEY_MIDNIGHT.toISOString());
  });

  it("result is <= now", () => {
    const result = startOfDayInTz("Australia/Sydney", NOW_UTC);
    expect(result.getTime()).toBeLessThanOrEqual(NOW_UTC.getTime());
  });

  it("result is within 24 hours before now", () => {
    const result = startOfDayInTz("Australia/Sydney", NOW_UTC);
    const diffMs = NOW_UTC.getTime() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0);
    expect(diffMs).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("UTC zone: result equals now truncated to UTC midnight", () => {
    // 2024-06-15T03:30:00Z → UTC midnight = 2024-06-15T00:00:00Z
    const expected = new Date("2024-06-15T00:00:00.000Z");
    const result = startOfDayInTz("UTC", NOW_UTC);
    expect(result.toISOString()).toBe(expected.toISOString());
  });

  it("handles a time that is just before midnight in Sydney (would be previous UTC day)", () => {
    // 2024-06-14T13:59:00Z = 2024-06-14 23:59 Sydney → local date is still June 14
    // midnight of June 14 in Sydney = 2024-06-13T14:00:00Z (AEST)
    const beforeMidnight = new Date("2024-06-14T13:59:00.000Z");
    const result = startOfDayInTz("Australia/Sydney", beforeMidnight);
    expect(result.toISOString()).toBe("2024-06-13T14:00:00.000Z");
  });

  it("handles a time that is exactly at Sydney midnight (inclusive)", () => {
    // 2024-06-14T14:00:00Z = 2024-06-15 00:00 Sydney
    const atMidnight = new Date("2024-06-14T14:00:00.000Z");
    const result = startOfDayInTz("Australia/Sydney", atMidnight);
    expect(result.toISOString()).toBe("2024-06-14T14:00:00.000Z");
  });
});

describe("dailyLimit", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.DAILY_GENERATION_LIMIT;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.DAILY_GENERATION_LIMIT;
    } else {
      process.env.DAILY_GENERATION_LIMIT = savedEnv;
    }
  });

  it("returns 10 when DAILY_GENERATION_LIMIT is not set", () => {
    delete process.env.DAILY_GENERATION_LIMIT;
    expect(dailyLimit()).toBe(10);
  });

  it("returns the env value when DAILY_GENERATION_LIMIT is a valid positive integer", () => {
    process.env.DAILY_GENERATION_LIMIT = "25";
    expect(dailyLimit()).toBe(25);
  });

  it("returns 10 when DAILY_GENERATION_LIMIT is not a positive integer", () => {
    process.env.DAILY_GENERATION_LIMIT = "notanumber";
    expect(dailyLimit()).toBe(10);
  });
});

describe("generationTz", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.GENERATION_TZ;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.GENERATION_TZ;
    } else {
      process.env.GENERATION_TZ = savedEnv;
    }
  });

  it("returns Australia/Sydney when GENERATION_TZ is not set", () => {
    delete process.env.GENERATION_TZ;
    expect(generationTz()).toBe("Australia/Sydney");
  });

  it("returns the env value when GENERATION_TZ is set", () => {
    process.env.GENERATION_TZ = "America/New_York";
    expect(generationTz()).toBe("America/New_York");
  });
});
