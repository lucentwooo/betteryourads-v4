const assert = require("assert");
const { startOfDayInTz, dailyLimit } = require("../usage.js");

// AEST (winter, UTC+10): Sydney midnight = 14:00 UTC the previous day.
{
  const now = new Date("2026-07-15T03:00:00Z"); // Sydney 2026-07-15 13:00
  const start = startOfDayInTz("Australia/Sydney", now);
  assert.strictEqual(start.toISOString(), "2026-07-14T14:00:00.000Z", "AEST start of day");
}

// AEDT (summer, UTC+11): Sydney midnight = 13:00 UTC the previous day.
{
  const now = new Date("2026-01-15T03:00:00Z"); // Sydney 2026-01-15 14:00
  const start = startOfDayInTz("Australia/Sydney", now);
  assert.strictEqual(start.toISOString(), "2026-01-14T13:00:00.000Z", "AEDT start of day");
}

// Just after Sydney midnight: the window is the new day's midnight.
{
  const now = new Date("2026-07-14T14:30:00Z"); // Sydney 2026-07-15 00:30
  const start = startOfDayInTz("Australia/Sydney", now);
  assert.strictEqual(start.toISOString(), "2026-07-14T14:00:00.000Z", "post-midnight rollover");
}

// DST "fall back" day 2026-04-05 (AEDT+11 → AEST+10 at 03:00 local). Local
// midnight is still AEDT, so the day starts at 13:00Z the previous day.
{
  const now = new Date("2026-04-05T06:00:00Z"); // Sydney 2026-04-05 16:00 (AEST)
  const start = startOfDayInTz("Australia/Sydney", now);
  assert.strictEqual(start.toISOString(), "2026-04-04T13:00:00.000Z", "fall-back day start");
}

// DST "spring forward" day 2026-10-04 (AEST+10 → AEDT+11 at 02:00 local). Local
// midnight is still AEST, so the day starts at 14:00Z the previous day.
{
  const now = new Date("2026-10-04T06:00:00Z"); // Sydney 2026-10-04 17:00 (AEDT)
  const start = startOfDayInTz("Australia/Sydney", now);
  assert.strictEqual(start.toISOString(), "2026-10-03T14:00:00.000Z", "spring-forward day start");
}

// dailyLimit defaults to 10 and honors a valid env override.
{
  delete process.env.DAILY_GENERATION_LIMIT;
  assert.strictEqual(dailyLimit(), 10, "default limit");
  process.env.DAILY_GENERATION_LIMIT = "25";
  assert.strictEqual(dailyLimit(), 25, "env override");
  process.env.DAILY_GENERATION_LIMIT = "garbage";
  assert.strictEqual(dailyLimit(), 10, "invalid env falls back to default");
  delete process.env.DAILY_GENERATION_LIMIT;
}

console.log("usage.js tests passed");
