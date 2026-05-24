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

Then open the **`http://localhost:<port>`** URL it prints (default **8787**) in your browser.

> **Important:** open that exact URL — do NOT double-click `index.html` (a `file://` page
> can't reach the backend) and don't assume port 3000 (another app uses it on this machine).
> If 8787 is busy, the server auto-picks the next free port and prints it. Override with
> `$env:PORT=9000; node server.js`.

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
