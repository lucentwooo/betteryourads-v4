# Customer Logins + Saved Brands & Ad Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase magic-link login (gated by manual approval), persist per-user brand analyses and generated ads, and add a Library page to browse generated ads.

**Architecture:** Browser uses the Supabase JS client directly for auth and for reading/writing the signed-in user's own rows (protected by Row-Level Security). The Express server (`server.js`) additionally enforces login+approval on the cost-incurring endpoints, and owns image persistence (download from KIE → Supabase Storage → insert `ads` row) via the service-role key.

**Tech Stack:** Node/Express, Playwright (existing); `@supabase/supabase-js` v2 (server, new); Supabase JS UMD via CDN (browser); vanilla HTML/JS; Supabase Auth + Postgres + Storage.

**Spec:** `docs/superpowers/specs/2026-05-25-auth-and-library-design.md`

**Testing note:** This repo has no automated test framework. Each task is verified with explicit `curl`/browser checks. Full end-to-end (real magic-link email, approval, image generation) requires the user's manual pass after implementation; tasks verify everything checkable without a live logged-in session.

**Branch:** `feature/auth-and-saving` (already checked out).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/schema.sql` | Tables, trigger, RLS, storage bucket + policies | Create |
| `server.js` | Add supabase admin client, `/config` keys, auth middleware, `/library/ads` | Modify |
| `package.json` | Add `@supabase/supabase-js` dependency | Modify |
| `auth.js` | Shared browser auth module (`window.Auth`): client, gate, authedFetch | Create |
| `index.html` | Auth gate + header, brand switcher, save-brand, save-ad, authed fetches | Modify |
| `library.html` | Gallery of the user's generated ads (signed URLs) | Create |
| `README.md` | One-time Supabase setup steps | Modify |

Tasks are **sequential** — Tasks 6–7 edit the same large file (`index.html`) and depend on Tasks 2–5. Do not parallelize tasks that touch the same file.

---

## Task 1: Supabase schema (tables, RLS, storage)

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Create the schema file**

Create `supabase/schema.sql` with exactly:

```sql
-- ============================================================================
-- BetterYourAds — auth/profiles, brands, ads, and storage.
-- Run once in the Supabase dashboard: SQL Editor → paste → Run.
-- Safe to re-run (idempotent).
-- ============================================================================

-- profiles: one row per auth user; gates app access via `approved`.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  approved   boolean not null default false,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- brands: saved website analyses (one per user+website).
create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text,
  website_url text not null,
  analysis    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, website_url)
);
alter table public.brands enable row level security;
drop policy if exists "own brands" on public.brands;
create policy "own brands" on public.brands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ads: generated ad records (image bytes live in Storage; inserted by server).
create table if not exists public.ads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  brand_id     uuid references public.brands(id) on delete set null,
  website_url  text,
  image_path   text not null,
  prompt       text,
  aspect_ratio text,
  resolution   text,
  created_at   timestamptz not null default now()
);
alter table public.ads enable row level security;
drop policy if exists "own ads read" on public.ads;
create policy "own ads read" on public.ads
  for select using (auth.uid() = user_id);
drop policy if exists "own ads delete" on public.ads;
create policy "own ads delete" on public.ads
  for delete using (auth.uid() = user_id);

-- Storage: private bucket for ad images; users read only their own <uid>/ prefix.
insert into storage.buckets (id, name, public)
values ('ads', 'ads', false)
on conflict (id) do nothing;

drop policy if exists "own ad files read" on storage.objects;
create policy "own ad files read" on storage.objects
  for select using (
    bucket_id = 'ads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Sanity-check the SQL**

Run: `grep -c "create policy" supabase/schema.sql`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(db): add Supabase schema for profiles, brands, ads, storage"
```

> Note for the operator: this SQL is run by the user in the Supabase dashboard (documented in Task 8). Service-role writes bypass RLS, so `ads`/`brands` inserts from the server need no extra insert policy.

---

## Task 2: Server — dependency, admin client, expose Supabase config

**Files:**
- Modify: `package.json`
- Modify: `server.js` (requires block near top; `/config` handler ~line 176)

- [ ] **Step 1: Install the Supabase server SDK**

Run:
```bash
npm install @supabase/supabase-js
```
Expected: `package.json` `dependencies` now lists `@supabase/supabase-js`.

- [ ] **Step 2: Add the require and admin client**

In `server.js`, after the line `const { chromium } = require("playwright");` add:

```js
const { createClient } = require("@supabase/supabase-js");
```

Then immediately after the `loadEnv();` call, add:

```js
// Server-side Supabase client (service role — bypasses RLS). Used to verify
// user tokens and to write ads/storage on the user's behalf.
const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
```

- [ ] **Step 3: Expose non-secret Supabase config to the browser**

In the `app.get("/config", ...)` handler, add two fields to the returned object (keep existing fields):

```js
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
```

- [ ] **Step 4: Verify config exposes the keys**

Run (server must be running; restart it after the edit):
```bash
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
curl -s http://localhost:8787/config | grep -o '"supabaseUrl":"[^"]*"' | head -c 40; echo
```
Expected: a non-empty `"supabaseUrl":"https://...` value.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "feat(server): add Supabase admin client and expose anon config"
```

---

## Task 3: Server — require-approved-user middleware on costly endpoints

**Files:**
- Modify: `server.js` (add middleware; apply to `/extract`, `/chat`, `/kie/generate`, `/kie/result`)

- [ ] **Step 1: Add the middleware**

In `server.js`, after the `supabaseAdmin` definition (Task 2), add:

```js
// Gate the cost-incurring endpoints: caller must present a valid Supabase
// access token AND be approved. Prevents bypassing the browser gate.
async function requireApprovedUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Supabase is not configured on the server (.env)." });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not signed in." });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles").select("approved").eq("id", userData.user.id).single();
  if (profErr || !profile || !profile.approved) {
    return res.status(403).json({ error: "Your account is awaiting approval." });
  }

  req.user = userData.user;
  next();
}
```

- [ ] **Step 2: Apply the middleware to the four endpoints**

Edit each route definition to insert `requireApprovedUser` as the middleware argument:

- `app.post("/extract", async (req, res) => {` → `app.post("/extract", requireApprovedUser, async (req, res) => {`
- `app.post("/chat", async (req, res) => {` → `app.post("/chat", requireApprovedUser, async (req, res) => {`
- `app.post("/kie/generate", async (req, res) => {` → `app.post("/kie/generate", requireApprovedUser, async (req, res) => {`
- `app.get("/kie/result", async (req, res) => {` → `app.get("/kie/result", requireApprovedUser, async (req, res) => {`

Leave `app.get("/config", ...)` and `app.use(express.static(...))` unauthenticated (the browser needs `/config` before login, and the static files include the login UI itself).

- [ ] **Step 3: Verify the gate rejects anonymous calls**

Run (restart server first):
```bash
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
echo -n "extract: "; curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/extract -H "Content-Type: application/json" -d '{"url":"https://example.com"}'; echo
echo -n "chat: ";    curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/chat -H "Content-Type: application/json" -d '{"stage":1,"messages":[]}'; echo
echo -n "config: ";  curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/config; echo
```
Expected: `extract: 401`, `chat: 401`, `config: 200`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(server): gate extract/chat/kie endpoints behind approved login"
```

---

## Task 4: Server — POST /library/ads (persist generated image)

**Files:**
- Modify: `server.js` (add route after the `/kie/result` handler, before `function start(...)`)

- [ ] **Step 1: Add the endpoint**

In `server.js`, add this route immediately after the `/kie/result` handler closes (before `// Start on the desired port`):

```js
// ── Persist a generated ad: download the (temporary) KIE image, store it in
//    Supabase Storage under the user's folder, and insert an `ads` row. ──
app.post("/library/ads", requireApprovedUser, async (req, res) => {
  const { imageUrl, brandId, websiteUrl, prompt, aspectRatio, resolution } = req.body || {};
  if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return res.status(502).json({ error: "Could not download image (HTTP " + imgRes.status + ")" });
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    const adId = require("crypto").randomUUID();
    const path = req.user.id + "/" + adId + "." + ext;

    const up = await supabaseAdmin.storage.from("ads").upload(path, buffer, { contentType, upsert: false });
    if (up.error) return res.status(502).json({ error: "Storage upload failed: " + up.error.message });

    const ins = await supabaseAdmin
      .from("ads")
      .insert({
        id: adId,
        user_id: req.user.id,
        brand_id: brandId || null,
        website_url: websiteUrl || null,
        image_path: path,
        prompt: prompt || null,
        aspect_ratio: aspectRatio || null,
        resolution: resolution || null,
      })
      .select()
      .single();
    if (ins.error) return res.status(502).json({ error: "Saving record failed: " + ins.error.message });

    res.json({ ad: ins.data });
  } catch (e) {
    res.status(502).json({ error: e.message || String(e) });
  }
});
```

- [ ] **Step 2: Verify it is gated (anonymous → 401) and routed**

Run (restart server first):
```bash
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
echo -n "library/ads anon: "; curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/library/ads -H "Content-Type: application/json" -d '{"imageUrl":"https://example.com/x.png"}'; echo
```
Expected: `401`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(server): add /library/ads to persist generated images to storage"
```

---

## Task 5: Browser shared auth module (`auth.js`)

**Files:**
- Create: `auth.js`

- [ ] **Step 1: Create `auth.js`**

Create `auth.js` with exactly:

```js
// Shared browser auth: magic-link login, approval gate, and authed fetch.
// Requires the Supabase UMD bundle (window.supabase) to be loaded first.
(function () {
  const Auth = {};
  let client = null;
  let cachedToken = null;

  Auth.init = async function () {
    if (client) return client;
    const cfg = await fetch("/config").then((r) => r.json());
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error("Supabase is not configured on the server (.env).");
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    Auth.client = client;
    return client;
  };

  function overlay(innerHtml) {
    let el = document.getElementById("authOverlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "authOverlay";
      el.style.cssText =
        "position:fixed;inset:0;background:#0b0b0c;color:#eee;display:flex;" +
        "align-items:center;justify-content:center;z-index:9999;padding:24px;" +
        "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;";
      document.body.appendChild(el);
    }
    el.innerHTML =
      '<div style="max-width:380px;width:100%;border:1px solid #2a2a2e;border-radius:12px;' +
      'padding:24px;background:#141416;">' + innerHtml + "</div>";
    el.style.display = "flex";
    return el;
  }
  function clearOverlay() {
    const el = document.getElementById("authOverlay");
    if (el) el.style.display = "none";
  }

  function loginScreen() {
    const el = overlay(
      '<h2 style="margin:0 0 8px;font-size:18px;">Sign in</h2>' +
      '<p style="margin:0 0 16px;color:#999;font-size:13px;">Enter your email and we\'ll ' +
      "send you a one-click sign-in link.</p>" +
      '<input id="authEmail" type="email" placeholder="you@company.com" ' +
      'style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;' +
      'border:1px solid #2a2a2e;border-radius:8px;background:#0b0b0c;color:#eee;" />' +
      '<button id="authSend" style="width:100%;padding:10px;border-radius:8px;border:0;' +
      'background:#4f7cff;color:#fff;cursor:pointer;">Send magic link</button>' +
      '<div id="authMsg" style="margin-top:12px;font-size:13px;color:#999;"></div>'
    );
    const emailEl = el.querySelector("#authEmail");
    const btn = el.querySelector("#authSend");
    const msg = el.querySelector("#authMsg");
    btn.addEventListener("click", async function () {
      const email = (emailEl.value || "").trim();
      if (!email) { msg.textContent = "Enter your email."; return; }
      btn.disabled = true; btn.textContent = "Sending…";
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.signInWithOtp({
        email: email, options: { emailRedirectTo: redirectTo },
      });
      btn.disabled = false; btn.textContent = "Send magic link";
      msg.textContent = error
        ? "Couldn't send link: " + error.message
        : "Check your inbox for the sign-in link, then return to this tab.";
    });
  }

  function pendingScreen(email) {
    const el = overlay(
      '<h2 style="margin:0 0 8px;font-size:18px;">Awaiting approval</h2>' +
      '<p style="margin:0 0 16px;color:#999;font-size:13px;">You\'re signed in as ' +
      "<strong>" + (email || "") + "</strong>, but your account hasn't been approved yet. " +
      "You'll get access once it's approved.</p>" +
      '<button id="authSignout" style="width:100%;padding:10px;border-radius:8px;border:0;' +
      'background:#2a2a2e;color:#eee;cursor:pointer;">Sign out</button>'
    );
    el.querySelector("#authSignout").addEventListener("click", function () { Auth.signOut(); });
  }

  async function getProfile(userId) {
    const { data, error } = await client
      .from("profiles").select("approved,email,is_admin").eq("id", userId).single();
    if (error) return null;
    return data;
  }

  // Resolves with { session, profile, userId } only for an approved user.
  // Otherwise renders the appropriate gate and keeps the app hidden.
  Auth.guard = function () {
    return new Promise(async function (resolve) {
      await Auth.init();
      let resolved = false;
      async function evaluate(session) {
        cachedToken = session ? session.access_token : null;
        if (!session) { loginScreen(); return; }
        const profile = await getProfile(session.user.id);
        if (profile && profile.approved) {
          clearOverlay();
          if (!resolved) {
            resolved = true;
            resolve({ session: session, profile: profile, userId: session.user.id });
          }
        } else {
          pendingScreen(session.user.email);
        }
      }
      const { data } = await client.auth.getSession();
      await evaluate(data.session);
      client.auth.onAuthStateChange(function (_event, session) { evaluate(session); });
    });
  };

  Auth.getToken = async function () {
    if (cachedToken) return cachedToken;
    const { data } = await client.auth.getSession();
    cachedToken = data.session ? data.session.access_token : null;
    return cachedToken;
  };

  Auth.authedFetch = async function (url, opts) {
    opts = opts || {};
    const token = await Auth.getToken();
    const headers = Object.assign({}, opts.headers, token ? { Authorization: "Bearer " + token } : {});
    return fetch(url, Object.assign({}, opts, { headers: headers }));
  };

  Auth.signOut = async function () {
    if (client) await client.auth.signOut();
    cachedToken = null;
    window.location.href = "/";
  };

  window.Auth = Auth;
})();
```

- [ ] **Step 2: Verify it is served and syntactically valid**

Run:
```bash
node --check auth.js && echo "syntax OK"
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/auth.js; echo
```
Expected: `syntax OK` then `200`.

- [ ] **Step 3: Commit**

```bash
git add auth.js
git commit -m "feat(web): add shared browser auth module (magic-link gate + authedFetch)"
```

---

## Task 6: Wire auth gate into `index.html`

**Files:**
- Modify: `index.html` (`<head>` ~line 78; top of `.wrap` ~line 81; the 4 fetch calls; bottom init)

- [ ] **Step 1: Load Supabase + auth.js in `<head>`**

In `index.html`, immediately before `</head>` (line 79), add:

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/auth.js"></script>
```

- [ ] **Step 2: Add a header bar**

In `index.html`, immediately after `<div class="wrap">` (line 81), add:

```html
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
    <a href="/library.html" style="font-size:13px;">📁 My Ad Library</a>
    <span style="font-size:13px;color:var(--muted);">
      <span id="authUserEmail"></span>
      <button id="signOutBtn" style="width:auto;padding:4px 10px;margin-left:8px;">Sign out</button>
    </span>
  </div>
```

- [ ] **Step 3: Switch the four backend calls to `Auth.authedFetch`**

In `index.html`, replace these calls (the only matches for each path):

- In `send()`: `const exRes = await fetch("/extract", {` → `const exRes = await Auth.authedFetch("/extract", {`
- In `runAgent()`: `const res = await fetch("/chat", {` → `const res = await Auth.authedFetch("/chat", {`
- In `generateImage()`: `const genRes = await fetch("/kie/generate", {` → `const genRes = await Auth.authedFetch("/kie/generate", {`
- In `generateImage()`: `const pollRes = await fetch("/kie/result?taskId=" + encodeURIComponent(taskId));` → `const pollRes = await Auth.authedFetch("/kie/result?taskId=" + encodeURIComponent(taskId));`

Leave `fetch("/config")` (line ~1208) as a plain `fetch` (it is public).

- [ ] **Step 4: Gate the app + wire header at the very end of the inline script**

In `index.html`, immediately before the final `</script>` (line ~1637, after `generateImageEl.addEventListener("click", generateImage);`), add:

```js
  // ===== Auth gate: reveal the app only for an approved, signed-in user =====
  let currentUserId = null;     // set once approved; used for brand upserts
  let currentBrandId = null;    // most-recent saved brand for this session

  document.getElementById("signOutBtn").addEventListener("click", function () { Auth.signOut(); });

  Auth.guard().then(function (ctx) {
    currentUserId = ctx.userId;
    document.getElementById("authUserEmail").textContent = ctx.session.user.email;
    if (typeof loadBrands === "function") loadBrands();
  }).catch(function (e) {
    document.getElementById("result").textContent = "Auth error: " + e.message;
  });
```

> `loadBrands` is added in Task 7; the `typeof` guard keeps this task runnable on its own.

- [ ] **Step 5: Verify gate renders and page still serves**

Run:
```bash
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
curl -s http://localhost:8787/ | grep -c "auth.js"; 
curl -s http://localhost:8787/ | grep -c "authUserEmail"
```
Expected: `1` and `1`.

Manual: open `http://localhost:8787` — a "Sign in" overlay should cover the page (you are not logged in yet).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(web): gate generator behind auth and attach tokens to API calls"
```

---

## Task 7: Brand switcher + save-brand + save-ad in `index.html`

**Files:**
- Modify: `index.html` (brand switcher markup ~line 88; helper functions; `send()` ~line 1410; `generateImage()` ~line 1628)

- [ ] **Step 1: Add the brand-switcher dropdown**

In `index.html`, immediately before `<label for="websiteUrl">` (line 87), add:

```html
  <label for="brandSwitcher">Your saved brands</label>
  <select id="brandSwitcher" style="margin-bottom:12px;">
    <option value="">— New brand (analyze a URL below) —</option>
  </select>
```

- [ ] **Step 2: Add brand helper functions**

In `index.html`, add inside the inline `<script>`, immediately before the auth-gate block you added in Task 6 Step 4:

```js
  // ===== Brands: list / switch / save =====
  const brandSwitcherEl = document.getElementById("brandSwitcher");

  async function loadBrands() {
    if (!Auth.client) return;
    const { data, error } = await Auth.client
      .from("brands").select("id,name,website_url,analysis").order("updated_at", { ascending: false });
    if (error) return;
    brandSwitcherEl.innerHTML = '<option value="">— New brand (analyze a URL below) —</option>';
    (data || []).forEach(function (b) {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = (b.name || b.website_url) + " — " + b.website_url;
      opt._brand = b;
      brandSwitcherEl.appendChild(opt);
    });
  }

  brandSwitcherEl.addEventListener("change", function () {
    const opt = brandSwitcherEl.selectedOptions[0];
    const b = opt && opt._brand;
    if (!b) { return; }
    currentBrandId = b.id;
    websiteUrlEl.value = b.website_url;
    const str = JSON.stringify(b.analysis, null, 2);
    lastStage1Output = str;
    localStorage.setItem("or_stage1", str);
    setResult(str);
    updateStage1Status();
  });

  async function saveBrand(websiteUrl, analysisObj) {
    if (!Auth.client || !currentUserId) return;
    let host = websiteUrl;
    try { host = new URL(websiteUrl).hostname; } catch (e) {}
    const { data, error } = await Auth.client
      .from("brands")
      .upsert(
        { user_id: currentUserId, name: host, website_url: websiteUrl,
          analysis: analysisObj, updated_at: new Date().toISOString() },
        { onConflict: "user_id,website_url" }
      )
      .select().single();
    if (!error && data) { currentBrandId = data.id; await loadBrands(); brandSwitcherEl.value = data.id; }
  }
```

- [ ] **Step 3: Save the brand after Stage 1 succeeds**

In `index.html` `send()`, immediately after the line `updateStage1Status();` (inside `send`, ~line 1412), add:

```js
    // Persist the analysis as a brand (non-fatal if it fails).
    try { await saveBrand(extracted.finalUrl || url, merged); }
    catch (e) { metaEl.textContent += " · (couldn't save brand)"; }
```

- [ ] **Step 4: Save the ad after Stage 3 succeeds**

In `index.html` `generateImage()`, immediately after the line `stage3MetaEl.textContent = "KIE GPT Image 2 · " + secs + "s · " + aspectRatioEl.value + " · " + resolutionEl.value;` (~line 1628), add:

```js
      // Persist the generated image to the user's Library (non-fatal on failure).
      try {
        const saveRes = await Auth.authedFetch("/library/ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: urls[0],
            brandId: currentBrandId,
            websiteUrl: websiteUrlEl.value.trim(),
            prompt: prompt,
            aspectRatio: aspectRatioEl.value,
            resolution: resolutionEl.value,
          }),
        });
        const saved = await saveRes.json();
        stage3MetaEl.textContent += saveRes.ok
          ? " · Saved to Library ✓"
          : " · (couldn't save to Library: " + (saved.error || saveRes.status) + ")";
      } catch (e) {
        stage3MetaEl.textContent += " · (couldn't save to Library)";
      }
```

- [ ] **Step 5: Verify markup + functions present and page valid**

Run:
```bash
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
curl -s http://localhost:8787/ | grep -c "brandSwitcher"
curl -s http://localhost:8787/ | grep -c "saveBrand"
curl -s http://localhost:8787/ | grep -c "/library/ads"
```
Expected: each ≥ `1` (brandSwitcher appears twice: markup + JS, so `2` is fine).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(web): brand switcher, save brand on Stage 1, save ad on Stage 3"
```

---

## Task 8: Library page (`library.html`)

**Files:**
- Create: `library.html`

- [ ] **Step 1: Create `library.html`**

Create `library.html` with exactly:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My Ad Library</title>
  <style>
    :root { --bg:#0b0b0c; --fg:#eee; --muted:#999; --border:#2a2a2e; --card:#141416; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--fg);
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
    .wrap { max-width:980px; margin:0 auto; padding:24px; }
    .topbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; font-size:13px; }
    a { color:#7aa2ff; }
    button { padding:4px 10px; border-radius:8px; border:0; background:#2a2a2e; color:var(--fg); cursor:pointer; }
    h1 { font-size:22px; }
    #grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; }
    .card { border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--card); }
    .card img { width:100%; display:block; }
    .card .meta { padding:8px 10px; font-size:12px; color:var(--muted); }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/auth.js"></script>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <a href="/">← Back to generator</a>
      <span><span id="who"></span>
        <button id="signout">Sign out</button></span>
    </div>
    <h1>My Ad Library</h1>
    <div id="grid">Loading…</div>
  </div>
  <script>
    const $ = function (id) { return document.getElementById(id); };
    $("signout").addEventListener("click", function () { Auth.signOut(); });

    Auth.guard().then(async function (ctx) {
      $("who").textContent = ctx.session.user.email;
      const { data: ads, error } = await Auth.client
        .from("ads").select("*").order("created_at", { ascending: false });
      if (error) { $("grid").textContent = "Couldn't load ads: " + error.message; return; }
      if (!ads || !ads.length) {
        $("grid").innerHTML = '<p style="color:var(--muted);">No ads yet. <a href="/">Generate one →</a></p>';
        return;
      }
      const cards = [];
      for (const ad of ads) {
        const signed = await Auth.client.storage.from("ads").createSignedUrl(ad.image_path, 3600);
        const src = signed && signed.data ? signed.data.signedUrl : "";
        cards.push(
          '<div class="card">' +
          (src ? '<a href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="generated ad" /></a>'
               : '<div class="meta">image unavailable</div>') +
          '<div class="meta">' + (ad.website_url || "") + "<br>" +
          new Date(ad.created_at).toLocaleString() + "</div>" +
          "</div>"
        );
      }
      $("grid").innerHTML = cards.join("");
    }).catch(function (e) { $("grid").textContent = "Auth error: " + e.message; });
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify it is served**

Run:
```bash
pkill -f "node server.js"; (PORT=8787 node server.js &) ; sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/library.html; echo
curl -s http://localhost:8787/library.html | grep -c "createSignedUrl"
```
Expected: `200` then `1`.

- [ ] **Step 3: Commit**

```bash
git add library.html
git commit -m "feat(web): add Library page showing the user's generated ads"
```

---

## Task 9: Document the one-time Supabase setup

**Files:**
- Modify: `README.md` (append a new section)

- [ ] **Step 1: Append setup instructions**

Append to `README.md`:

```markdown
## Customer logins & saved ads (Supabase)

This app uses Supabase for magic-link login, saved brand analyses, and an ad Library.

### One-time Supabase setup

1. **Create the database structure.** In your Supabase dashboard, open **SQL Editor**,
   paste the contents of `supabase/schema.sql`, and click **Run**. (Safe to re-run.)
2. **Allow the login redirect.** Go to **Authentication → URL Configuration**. Set
   **Site URL** to `http://localhost:8787` and add `http://localhost:8787` to
   **Redirect URLs**.
3. **Keys.** Ensure `.env` has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` (the service-role key is secret, server-only).
4. **Run with a fixed port** so the magic-link redirect stays valid:
   `PORT=8787 node server.js`.

### Approving a user (demo gate)

Anyone can request a magic link, but the app stays locked until you approve them:

1. Have the person sign in once (so their row is created).
2. In the dashboard, open **Table Editor → `profiles`**, find their email, and tick
   **`approved`** (set it to `true`). They get access on their next page load.

### What gets saved

- **Brands** (`brands` table): each analyzed website's brand JSON. Switch between them
  with the "Your saved brands" dropdown.
- **Ads** (`ads` table + private `ads` storage bucket): every generated image, copied off
  KIE so it doesn't expire. Browse them on the **My Ad Library** page.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Supabase setup, user approval, and saved data"
```

---

## Final manual verification (performed by the user with a real login)

1. `PORT=8787 node server.js`, open `http://localhost:8787` → "Sign in" overlay appears.
2. Enter your email → receive magic link → click it → returns to the app showing
   "Awaiting approval".
3. Approve yourself in the dashboard (`profiles.approved = true`) → reload → app appears.
4. Analyze a URL (Stage 1) → it appears in the "Your saved brands" dropdown.
5. Run Stage 2 + Stage 3 → image generates and meta shows "Saved to Library ✓".
6. Open **My Ad Library** → the generated ad shows (via a signed URL).
7. Wait >24h (or trust the design): the Library image still loads (stored copy), even though
   the raw KIE link would have expired.
8. (RLS) Sign in as a second approved user → you see none of the first user's brands/ads.

---

## Self-Review

**Spec coverage:**
- Magic-link auth → Task 5 (`signInWithOtp`), Task 6 (gate). ✓
- Approval gate (anyone logs in, app gated) → Task 1 (`profiles.approved`), Task 3 (server 403), Task 5 (pending screen). ✓
- Option A + server enforcement → Task 5 (browser client/RLS), Task 3 (middleware). ✓
- Brands table + multiple + switcher → Task 1, Task 7. ✓
- Ads table + storage + copy-off-KIE → Task 1, Task 4, Task 7 (save-ad). ✓
- Library page → Task 8. ✓
- Dashboard approval + redirect/site URL setup → Task 9. ✓
- Config exposes anon key/url → Task 2. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; the one forward reference
(`loadBrands` in Task 6) is guarded with `typeof` and defined in Task 7. ✓

**Type/name consistency:** `Auth.guard()` returns `{ session, profile, userId }` (Task 5),
consumed as `ctx.userId`/`ctx.session` (Tasks 6, 8). `currentUserId`/`currentBrandId` declared
in Task 6, used in Task 7. `image_path` column (Task 1) written by `/library/ads` (Task 4) and
read by Library `createSignedUrl(ad.image_path, ...)` (Task 8). `/library/ads` request body keys
(`imageUrl,brandId,websiteUrl,prompt,aspectRatio,resolution`) match between Task 4 and Task 7. ✓
