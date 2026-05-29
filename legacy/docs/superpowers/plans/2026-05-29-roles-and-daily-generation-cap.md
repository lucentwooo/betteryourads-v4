# Roles & Daily Generation Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap non-admin users at 10 successful image generations per `Australia/Sydney` day, with admins (DB `is_admin` flag) unlimited.

**Architecture:** A small zero-dependency `usage.js` module computes the day boundary (DST-aware via `Intl`). `server.js` extends the existing `requireApprovedUser` middleware to load `is_admin`, enforces the cap in `/kie/generate` before spending money, records each successful generation in a new `generations` table, and exposes `GET /usage` for the UI. Roles are the existing `profiles.is_admin` column — set only via SQL.

**Tech Stack:** Node.js + Express (CommonJS), `@supabase/supabase-js` (service-role client), Supabase Postgres + RLS, Node built-in `assert` for tests (no test framework in this repo).

---

### Task 1: `usage.js` day-boundary + limit helpers

**Files:**
- Create: `usage.js`
- Test: `test/usage.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/usage.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/usage.test.js`
Expected: FAIL — `Cannot find module '../usage.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `usage.js`:

```js
// usage.js — daily generation-cap helpers. Pure and Express/DOM-free so it can be
// unit-tested with `node test/usage.test.js` without booting the server.

const DEFAULT_LIMIT = 10;
const DEFAULT_TZ = "Australia/Sydney";

function dailyLimit() {
  const n = parseInt(process.env.DAILY_GENERATION_LIMIT, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
}

function generationTz() {
  return process.env.GENERATION_TZ || DEFAULT_TZ;
}

// ms to add to a UTC instant to get the wall-clock time in `tz` at that instant.
function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map = {};
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
function startOfDayInTz(tz, now) {
  now = now || new Date();
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const map = {};
  for (const p of dateFmt.formatToParts(now)) map[p.type] = p.value;
  const naiveMidnightUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day), 0, 0, 0
  );
  const offset = tzOffsetMs(tz, new Date(naiveMidnightUTC));
  return new Date(naiveMidnightUTC - offset);
}

module.exports = { DEFAULT_LIMIT, DEFAULT_TZ, dailyLimit, generationTz, tzOffsetMs, startOfDayInTz };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/usage.test.js`
Expected: PASS — prints `usage.js tests passed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add usage.js test/usage.test.js
git commit -m "Add daily-limit + Sydney day-boundary helpers (usage.js)"
```

---

### Task 2: `generations` usage-log table in schema

**Files:**
- Modify: `supabase/schema.sql` (append at end, currently 135 lines)

- [ ] **Step 1: Append the table + RLS to the schema**

Add to the end of `supabase/schema.sql`:

```sql
-- generations: one row per SUCCESSFUL image generation, used to enforce the
-- per-user daily cap (non-admins). Written by the server (service role); not all
-- generations become saved ads, so this is a separate log from `ads`.
create table if not exists public.generations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at);

alter table public.generations enable row level security;
drop policy if exists "own generations read" on public.generations;
create policy "own generations read" on public.generations
  for select using (auth.uid() = user_id);
```

- [ ] **Step 2: Verify the SQL is syntactically consistent with the file**

Run: `node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); if(!/create table if not exists public.generations/.test(s)) throw new Error('generations table missing'); console.log('schema contains generations table');"`
Expected: prints `schema contains generations table`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add generations usage-log table for the daily cap"
```

- [ ] **Step 4: Apply to Supabase (manual, by the operator)**

This SQL is idempotent. Paste the whole `supabase/schema.sql` into the Supabase dashboard → SQL Editor → Run, OR run just the new block. Required before the cap works in a live environment. No automated step — note it in the handoff.

---

### Task 3: Enforce the cap and expose `/usage` in `server.js`

**Files:**
- Modify: `server.js` — import (after line 16), `requireApprovedUser` (lines 49-70), `/config` neighbor for `/usage`, and `/kie/generate` (lines 352-411)

- [ ] **Step 1: Import the helpers**

In `server.js`, immediately after line 16 (`const { createClient } = require("@supabase/supabase-js");`), add:

```js
const { dailyLimit, generationTz, startOfDayInTz } = require("./usage.js");
```

- [ ] **Step 2: Load `is_admin` in the auth middleware**

In `requireApprovedUser`, replace this block (currently lines 62-69):

```js
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles").select("approved").eq("id", userData.user.id).single();
  if (profErr || !profile || !profile.approved) {
    return res.status(403).json({ error: "Your account is awaiting approval." });
  }

  req.user = userData.user;
  next();
```

with:

```js
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles").select("approved,is_admin").eq("id", userData.user.id).single();
  if (profErr || !profile || !profile.approved) {
    return res.status(403).json({ error: "Your account is awaiting approval." });
  }

  req.user = userData.user;
  req.profile = profile;
  next();
```

- [ ] **Step 3: Add usage-counting helpers**

In `server.js`, immediately after the `requireApprovedUser` function (after its closing `}` on line 70), add:

```js
// Count this user's successful generations since the start of the current
// `GENERATION_TZ` day (default Australia/Sydney). Used to enforce the daily cap.
async function generationsToday(userId) {
  const since = startOfDayInTz(generationTz()).toISOString();
  const { count, error } = await supabaseAdmin
    .from("generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count || 0;
}

// Best-effort: log one successful generation. A failure here must not fail the
// already-completed (paid) generation, so we only warn.
async function recordGeneration(userId) {
  const { error } = await supabaseAdmin.from("generations").insert({ user_id: userId });
  if (error) console.error("Failed to record generation for", userId, "-", error.message);
}
```

- [ ] **Step 4: Add the `/usage` endpoint**

In `server.js`, immediately after the `/config` endpoint (after its closing `});` on line 236), add:

```js
// ── Daily-cap usage for the signed-in user. Admins are unlimited. ──
app.get("/usage", requireApprovedUser, async (req, res) => {
  const limit = dailyLimit();
  if (req.profile.is_admin) return res.json({ used: 0, limit, isAdmin: true });
  try {
    const used = await generationsToday(req.user.id);
    res.json({ used, limit, isAdmin: false });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});
```

- [ ] **Step 5: Enforce the cap at the top of `/kie/generate`**

In `/kie/generate`, find this line (currently line 358):

```js
  aspect_ratio = aspect_ratio || "auto";
```

Immediately after it, insert:

```js

  // Enforce the per-user daily cap BEFORE spending money on an image. Admins skip.
  if (!req.profile.is_admin) {
    let used;
    try {
      used = await generationsToday(req.user.id);
    } catch (e) {
      return res.status(502).json({ error: "Couldn't check your daily usage: " + (e.message || e) });
    }
    if (used >= dailyLimit()) {
      return res.status(429).json({
        error: "Daily limit of " + dailyLimit() + " reached. It resets at midnight (AEST).",
      });
    }
  }
```

- [ ] **Step 6: Record success in the OpenRouter branch**

In `/kie/generate`, find (currently lines 367-369):

```js
    try {
      const urls = await openrouterGenerateImage(orKey, orModel, { prompt, referenceImage, logoImage, productImages, aspect_ratio });
      return res.json({ urls, done: true });
```

Replace with:

```js
    try {
      const urls = await openrouterGenerateImage(orKey, orModel, { prompt, referenceImage, logoImage, productImages, aspect_ratio });
      await recordGeneration(req.user.id);
      return res.json({ urls, done: true });
```

- [ ] **Step 7: Record success in the KIE branch**

In `/kie/generate`, find (currently lines 404-407):

```js
    if (!r.ok || (data && data.code !== 200) || !taskId) {
      return res.status(502).json({ error: (data && (data.msg || data.message)) || "KIE createTask HTTP " + r.status });
    }
    res.json({ taskId });
```

Replace with:

```js
    if (!r.ok || (data && data.code !== 200) || !taskId) {
      return res.status(502).json({ error: (data && (data.msg || data.message)) || "KIE createTask HTTP " + r.status });
    }
    await recordGeneration(req.user.id);
    res.json({ taskId });
```

- [ ] **Step 8: Smoke-test that the server parses and routes are wired**

Verify `server.js` parses with no syntax error:

Run: `node --check server.js`
Expected: no output, exit code 0 (file parses).

Then verify the route exists without needing real Supabase creds:

Run: `node -e "const s=require('fs').readFileSync('server.js','utf8'); ['app.get(\"/usage\"','recordGeneration(req.user.id)','select(\"approved,is_admin\")','status(429)'].forEach(t=>{if(!s.includes(t)) throw new Error('missing: '+t)}); console.log('server.js wiring present');"`
Expected: prints `server.js wiring present`.

- [ ] **Step 9: Commit**

```bash
git add server.js
git commit -m "Enforce 10/day generation cap for non-admins; add /usage endpoint"
```

---

### Task 4: Document the new env vars

**Files:**
- Modify: `.env.example` (Supabase section, lines 31-39)

- [ ] **Step 1: Append config docs after the Supabase block**

In `.env.example`, after the last line (`SUPABASE_SERVICE_ROLE_KEY=`), add:

```
# ── Daily generation cap (non-admin users) ──
# Admins (profiles.is_admin = true, set only via SQL) are unlimited. Everyone
# else may run this many successful generations per day.
DAILY_GENERATION_LIMIT=10
# IANA timezone whose midnight resets the daily count (DST-aware).
GENERATION_TZ=Australia/Sydney
```

- [ ] **Step 2: Verify**

Run: `node -e "const s=require('fs').readFileSync('.env.example','utf8'); if(!/DAILY_GENERATION_LIMIT/.test(s)||!/GENERATION_TZ/.test(s)) throw new Error('env docs missing'); console.log('env docs present');"`
Expected: prints `env docs present`.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "Document DAILY_GENERATION_LIMIT and GENERATION_TZ"
```

---

## Manual end-to-end verification (operator, after deploy)

The unit + wiring checks above don't exercise a real Supabase session. After applying
the schema (Task 2 Step 4) and setting env vars, verify in the running app:

1. As a normal user (`is_admin = false`), generate ads until the 11th is blocked with
   "Daily limit of 10 reached. It resets at midnight (AEST)." (surfaced by `generateImage`).
2. `GET /usage` with that user's bearer token returns `{ used: 10, limit: 10, isAdmin: false }`.
3. Set `is_admin = true` for that user via SQL; confirm generation is no longer blocked
   and `/usage` returns `{ isAdmin: true }`.
4. After Sydney midnight, confirm the count resets (or temporarily lower
   `DAILY_GENERATION_LIMIT` to re-test quickly).

## Out of scope (per spec)

- No UI badge for remaining quota in `app.html` — the 429 message already surfaces via
  `bya-pipeline.js` `generateImage`. A `/usage`-driven badge is a future follow-up.
- No backfill of `generations` from existing `ads` rows; counting starts at deploy.
- No role-assignment UI; roles are DB-only.
