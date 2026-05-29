# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup   # npm install + npx playwright install chromium (one-time)
npm start       # node server.js — serves UI and proxies APIs on :3000
PORT=9000 npm start   # override port (auto-increments if busy, up to 20 tries)
```

There is no build step, no test suite, and no linter. The app is a single static `app.html`
(served at `/`), with its logic split into `bya-prompts.js` (prompt templates) and
`bya-pipeline.js` (the DOM-free pipeline API). Edits take effect on browser refresh.

Open the `http://localhost:<port>` URL the server prints — do **not** open `app.html` as a
`file://` page, because it can't reach the backend proxies.

## Architecture

`server.js` (Express backend) serves the vanilla-JS frontend — no framework, no bundler.
`app.html` is the whole product; `auth.js`, `bya-prompts.js`, and `bya-pipeline.js` are the
scripts it loads. The app is a 3-stage pipeline that turns a website URL
into a generated on-brand ad image.

**The server's sole job is to be a secret-keeping proxy.** All third-party API keys live only
in `.env` on the server and never reach the browser. Every external call goes through a
server endpoint:

- `POST /extract` — loads the target URL in a reused headless Chromium (Playwright) and runs
  `extractFromPage()` *inside the page* to read exact computed colors (area-weighted), CSS
  color variables, fonts, logos (`<img>` only — inline SVG logos are missed), and page text.
- `GET /config` — returns non-secret config (which models are active, whether keys are set)
  so the UI can display the active models.
- `POST /chat` — OpenRouter chat-completions proxy. The model is pinned **server-side** per
  stage (`STAGE1_MODEL` / `STAGE2_MODEL`); the client only sends `stage`, `messages`, and an
  `online` flag. Stage 1 can append OpenRouter's `:online` web-search plugin; Stage 2 cannot
  (it sends an image, which conflicts).
- `POST /kie/generate` + `GET /kie/result` — KIE GPT-Image-2 image-to-image. Base64 images are
  first uploaded via `kieUploadBase64` (note: that upload runs against `kieai.redpandaai.co`,
  **not** `api.kie.ai`), then a task is created and polled.

### The 3 stages (driven from `app.html` via `bya-pipeline.js` / `bya-prompts.js`)

1. **Stage 1 — brand extraction.** `/extract` returns measured site data, which is injected as
   authoritative "MEASURED SITE DATA" into the baked-in `STRATEGIST_PROMPT`, then sent via
   `/chat`. Output is brand-extraction JSON.
2. **Stage 2 — reference ad → ad prompt.** Takes a reference ad image + Stage 1's JSON (as
   `BRAND_EXTRACTION_JSON`) through the baked-in `STAGE2_PROMPT` on a vision model, producing a
   render-ready ad-prompt JSON.
3. **Stage 3 — image generation.** Feeds the Stage 2 prompt + reference ad + brand logo to KIE.
   Aspect ratio is auto-detected from the Stage 2 prompt; `4K` + `1:1` is silently downgraded to
   `2K` (KIE forbids that combo).

### Conventions to preserve

- **Prompts live in `bya-prompts.js`** as the `STRATEGIST_PROMPT` and `STAGE2_PROMPT` template
  literals (the source of truth loaded by `app.html`).
- **Client state lives in `localStorage`** (URL, edited prompts, Stage 1 output) — keys like
  `or_url`, `or_prompt`, `or_stage1`. No API keys are ever stored client-side.
- **Models are configured, not coded.** Switching models means editing `.env`
  (`STAGE1_MODEL`, `STAGE2_MODEL`, `KIE_IMAGE_MODEL`, `KIE_IMAGE_RESOLUTION`), never code.
- `server.js` uses a **hand-rolled `.env` loader** (`loadEnv()`) — there is no `dotenv`
  dependency, and real `process.env` values take precedence over the file.

### Note on Supabase

`.env.example` defines `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, but
no code reads them yet — Supabase integration is anticipated, not implemented. Wire it through
`server.js` (service-role key server-side only) to keep the secret-keeping-proxy invariant.
