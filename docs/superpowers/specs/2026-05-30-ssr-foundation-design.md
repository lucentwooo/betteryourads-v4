# Spec #1 — SSR Foundation

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Status:** Design approved; ready for implementation plan.

## Goal

Convert `apps/web` from a client-only Vite SPA into a **server-side-rendered app shell** that
hydrates on the client, and introduce a **client-side stale-while-revalidate data cache** so
pages render instantly from cache (the legacy "instant my ads" feel) instead of showing a
spinner on every mount.

This spec is the foundation the rest of the program builds on. It deliberately changes as
little product behavior as possible — it is plumbing, plus Home + Library as the proof.

## Non-goals (handled by later specs)

- No visual restyle to the legacy look (Spec #3).
- No concept-board changes (Spec #2).
- No auth/signup/admin changes (Spec #4).
- No quotas / per-brand filtering / per-brand logo (Spec #5).
- No reference-ads or file cleanup (Spec #6).
- **No backend changes at all.** Auth stays Bearer-token; the SSR server never calls `/api`.

## Architecture

### Topology

```
                 ┌─────────────────────────────────────────┐
  browser  ─────▶│ apps/web  server.ts (Express)            │
                 │   • GET *  → SSR: renderToString(<Document/>)
                 │   • /api/* → proxy ──────────────┐       │
                 │   • /assets, client bundle (prod) │       │
                 └───────────────────────────────────┼───────┘
                                                      ▼
                                          apps/backend (unchanged API)
  browser  ─── /api/* (Bearer token, client-side) ──▶ apps/backend
```

- The SSR server renders **only the shell** — it has no session, so it renders the
  logged-out/loading chrome. The browser hydrates, Supabase auth resolves client-side, and
  the client cache loads data.
- `/api/*` is proxied through `apps/web`'s server so the browser uses a single origin; the
  request still carries the Supabase Bearer token exactly as today. Backend untouched.

### Rendering pipeline

**Document is rendered from React** — there is no static `index.html`.

- `src/Document.tsx` — owns `<html><head>…</head><body><div id="root">{children}</div>…</body></html>`,
  including `<title>`, meta, font links, and the client entry `<script type="module">`.
- `src/App.tsx` — router-agnostic app body (current routes/shell). Receives no router itself;
  the entry points wrap it:
  - server: `<StaticRouter location={url}>` (from `react-router-dom/server`)
  - client: `<BrowserRouter>`
- `src/entry-server.tsx` — exports `render(url): string` →
  `renderToString(<Document><StaticRouter location={url}><App/></StaticRouter></Document>)`.
- `src/entry-client.tsx` — replaces `main.tsx`:
  `hydrateRoot(document, <Document><BrowserRouter><App/></BrowserRouter></Document>)`. It
  must render the **same `Document` tree** the server produced (whole-document hydration),
  swapping only `StaticRouter`→`BrowserRouter`; the DOM output is identical so hydration
  matches.
- `src/main.tsx` — **removed** (replaced by `entry-client.tsx`).
- `index.html` — **removed** (document comes from React).

### `server.ts` (new, in `apps/web`)

One small Express server, two modes:

- **Dev:** create a Vite server in `middlewareMode`. For each request:
  `ssrLoadModule('/src/entry-server.tsx')` → `render(url)`; inject Vite's HMR client +
  React-refresh preamble into the rendered `<head>` (the few `<script>`s `transformIndexHtml`
  used to add). Proxy `/api` to the backend (reuse the existing dev proxy target).
- **Prod:** serve `dist/client` statically (immutable assets); for document routes import
  `dist/server/entry-server.js` and stream/`send` the rendered HTML. Proxy `/api`.

`vite.config.ts` updates: add SSR build config (client build + `ssr` build of
`entry-server`), keep the `/api` proxy for dev, keep vitest config.

`package.json` (`@bya/web`) scripts:
- `dev` → run `server.ts` (tsx/node) with Vite middleware (replaces `vite`).
- `build` → `vite build` (client) + `vite build --ssr src/entry-server.tsx` (server).
- `start` → `NODE_ENV=production node server.ts` (or built server entry).
- `test` / `build` typecheck unchanged otherwise.

### Client data cache (stale-while-revalidate)

A small hand-rolled module — **no new dependency**. Mirrors how legacy boots data once and
serves from memory while refreshing.

- `src/data/cache.ts` (new): an in-memory store keyed by resource (`brands`, `ads`, `usage`),
  each holding `{ data, status: 'idle'|'loading'|'ready'|'error', error }` plus subscribers.
- Public surface (kept intentionally small — only what Home/Library need this spec):
  - `useResource<T>(key)` — React hook returning `{ data, status, error, refresh }`. On first
    use, if `idle`, kicks off a fetch; returns cached `data` immediately on subsequent mounts
    and triggers a background `refresh` (stale-while-revalidate). Subscribes the component to
    updates.
  - `primeAfterAuth()` — called once when auth becomes `approved`, eagerly fetches `brands`
    and `ads` so the first navigation is instant (the legacy boot-load).
  - `invalidate(key)` — mark stale / drop, used after mutations in later specs.
- The cache calls the existing `api.*` functions in `src/api/client.ts` (unchanged). It lives
  only on the client; on the server `useResource` returns `idle`/empty so SSR renders the
  loading/empty shell deterministically (no hydration mismatch).

### Home & Library (smoke test for the cache)

Rewire `Home.tsx` and `Library.tsx` to read via `useResource('ads')` / `useResource('brands')`
instead of their local `useState`+`useEffect`+spinner. Behavior change: on a *revisit* (cache
warm) they render instantly and refresh in the background; first-ever load still shows the
existing loading state. **No markup/style changes** beyond swapping the data source — visual
restyle is Spec #3.

## Files

**Added**
- `apps/web/server.ts`
- `apps/web/src/Document.tsx`
- `apps/web/src/entry-server.tsx`
- `apps/web/src/entry-client.tsx`
- `apps/web/src/data/cache.ts` (+ `cache.test.ts`)

**Changed**
- `apps/web/src/App.tsx` (router-agnostic)
- `apps/web/vite.config.ts` (SSR build)
- `apps/web/package.json` (scripts; add `tsx`/server deps if needed — flag before installing)
- `apps/web/src/home/Home.tsx`, `apps/web/src/library/Library.tsx` (use cache)

**Removed**
- `apps/web/src/main.tsx`
- `apps/web/index.html`

## Testing

- Keep all existing vitest suites green.
- `cache.test.ts`: idle→loading→ready transitions, stale-while-revalidate (returns cached
  data while refetching), error path, subscriber notifications.
- SSR smoke test: a test (or script) that imports `entry-server` `render('/')` and asserts the
  output contains the shell markup and a `<div id="root">`, and that it does **not** throw
  (no `window`/`document` access during server render).
- Manual: `npm run dev -w @bya/web` renders + hydrates without console hydration warnings;
  `/api` proxy reaches the backend; `npm run build -w @bya/web` produces `dist/client` and
  `dist/server`.

## Acceptance criteria

1. `apps/web` renders its shell via SSR (HTML arrives with shell markup, not an empty `<div>`),
   then hydrates with no hydration mismatch warnings.
2. No static `index.html`; the document is produced by `Document.tsx`.
3. `/api/*` still works end-to-end through the `apps/web` server proxy with the existing Bearer
   token; **`apps/backend` has zero changes**.
4. Home and Library read from the client cache: a warm revisit shows data immediately and
   refreshes in the background; no spinner-on-every-mount.
5. `npm run build -w @bya/web` and `npm test -w @bya/web` pass; existing tests unchanged in
   intent.

## Risks / notes

- **Hydration parity:** server must render the same initial state the client hydrates into.
  Because the cache is client-only and returns empty on the server, both render the
  loading/empty shell first — parity holds. Keep any `Date`/random/`window` usage out of the
  server render path (note: `Home.tsx` currently calls `new Date()` for the greeting — guard
  or compute post-hydration to avoid mismatch).
- **New dev dependency:** running `server.ts` in dev/prod likely needs `tsx` (or equivalent).
  That is a dependency decision — flag and confirm before `npm install`.
- This spec intentionally leaves the app visually as-is; reviewers should expect plumbing, not
  a new look.
