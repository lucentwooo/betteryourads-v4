// usage.ts — daily generation-cap helpers. Pure and framework/DOM-free so it can
// be unit-tested without booting the app. Ported from usage.js.

const DEFAULT_LIMIT = 10;
const DEFAULT_LIFETIME_LIMIT = 5;
const DEFAULT_TZ = "Australia/Sydney";

export function dailyLimit(): number {
  const n = parseInt(process.env.DAILY_GENERATION_LIMIT || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
}

// Per-account lifetime free cap (total generations ever). Testers hit this wall,
// then get bumped to admin (is_admin = unlimited) to keep going.
export function lifetimeLimit(): number {
  const n = parseInt(process.env.LIFETIME_GENERATION_LIMIT || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIFETIME_LIMIT;
}

export function generationTz(): string {
  return process.env.GENERATION_TZ || DEFAULT_TZ;
}

// ms to add to a UTC instant to get the wall-clock time in `tz` at that instant.
export function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // some runtimes emit "24" for midnight
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    hour, Number(map.minute), Number(map.second)
  );
  return asUTC - date.getTime();
}

// The UTC Date of the most recent local midnight in `tz` relative to `now`.
export function startOfDayInTz(tz: string, now?: Date): Date {
  now = now || new Date();
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dateFmt.formatToParts(now)) map[p.type] = p.value;
  const naiveMidnightUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day), 0, 0, 0
  );
  // We want the instant T whose local wall-clock is 00:00 of this date, i.e.
  // T = naiveMidnightUTC - offset(T). Approximate with the offset at the naive
  // instant, then refine once using the offset at the candidate. The refinement
  // corrects the two DST-transition days/year, where the offset at naive-midnight
  // differs from the offset at true local midnight.
  let offset = tzOffsetMs(tz, new Date(naiveMidnightUTC));
  let candidate = naiveMidnightUTC - offset;
  offset = tzOffsetMs(tz, new Date(candidate));
  candidate = naiveMidnightUTC - offset;
  return new Date(candidate);
}
