# OpenRouter Site Analyzer

Analyze a website with an OpenRouter LLM (Gemini 2.5 Pro, GPT-4o, etc.), grounded on
**real extracted data** — exact colors, fonts, and text are pulled from the live rendered
page by a headless browser, so the model stops guessing hex codes.

## One-time setup

```powershell
npm install
npx playwright install chromium
```

## Run

```powershell
node server.js
```

Then open the **`http://localhost:<port>`** URL it prints (default **3000**) in your browser.

> **Important:** open that exact URL — do NOT double-click `index.html` (a `file://` page
> can't reach the backend).
> If 3000 is busy, the server auto-picks the next free port and prints it. Override with
> `$env:PORT=9000; node server.js`. Whatever port you use must match the redirect URL
> registered in Supabase (see below).

## Use

1. Paste your OpenRouter API key (saved in your browser only).
2. Pick a model.
3. Enter the website URL to analyze.
4. Click **Send**.

On Send, the app:
1. Loads the URL in a real Chromium browser and extracts exact colors / fonts / CSS
   color variables / page text (`POST /extract`).
2. Injects that as authoritative "MEASURED SITE DATA" into the baked-in strategist prompt.
3. Sends it to the chosen model via OpenRouter.

The **analysis prompt is baked in** (collapsible section to view/edit/reset).

## Notes & limits

- **Colors/fonts/text are exact** (read from `getComputedStyle` on the live page).
- Optional "web-search other pages" checkbox adds OpenRouter's `:online` plugin to let the
  model also pull pricing/case-study pages beyond the one URL. Costs extra per request.
- Only the entered URL is rendered; sub-pages are not crawled by the browser (use the
  `:online` option for those).
- Logos detected via `<img>` tags only; inline-SVG logos won't be picked up.

## Customer logins & saved ads (Supabase)

This app uses Supabase for magic-link login, saved brand analyses, and an ad Library.

### One-time Supabase setup

1. **Create the database structure.** In your Supabase dashboard, open **SQL Editor**,
   paste the contents of `supabase/schema.sql`, and click **Run**. (Safe to re-run.)
2. **Allow the login redirect.** Go to **Authentication → URL Configuration**. Set
   **Site URL** to `http://localhost:3000` and add `http://localhost:3000` to
   **Redirect URLs**.
3. **Keys.** Ensure `.env` has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` (the service-role key is secret, server-only).
4. **Run** (the default port is now 3000): `node server.js`. To pin it explicitly,
   `PORT=3000 node server.js`. Keep the port matching the redirect URL above.

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
