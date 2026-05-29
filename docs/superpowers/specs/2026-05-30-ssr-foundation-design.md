# Spec #1 — SSR Foundation (Next.js)

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Status:** Design approved (framework switched to Next.js); ready for implementation plan.

## Goal

Rebuild `apps/web` as a **Next.js (App Router)** app that server-renders the app shell and
hydrates on the client, and introduce a **client-side stale-while-revalidate data cache** so
pages render instantly from cache (the legacy "instant my ads" feel) instead of showing a
spinner on every mount.

This spec is the foundation the rest of the program builds on. It changes as little product
behavior as possible — it is the Next.js scaffold + the data cache, with Home + Library as the
proof.

## Non-goals (handled by later specs)

- No visual restyle to the legacy look (Spec #3).
- No concept-board changes (Spec #2).
- No auth/signup/admin changes (Spec #4).
- No quotas / per-brand filtering / per-brand logo (Spec #5).
- No reference-ads or file cleanup (Spec #6).
- **No backend changes at all.** Auth stays Bearer-token; Next never reads the Supabase session
  on the server.

## Architecture

### Topology

```
                 ┌──────────────────────────────────────────────┐
  browser  ─────▶│ apps/web  (Next.js, App Router)               │
                 │   • RootLayout + page chrome → SSR shell       │
                 │   • client components → auth + cached data     │
                 │   • /api/* → next.config rewrite ────────┐     │
                 └──────────────────────────────────────────┼─────┘
                                                             ▼
                                              apps/backend (unchanged Express API)
  browser  ─── /api/* (Bearer token, from client) ────────▶ apps/backend
```

- Next renders **only the shell** server-side (it has no session), so it renders the
  logged-out/loading chrome. The browser hydrates, Supabase auth resolves client-side, and the
  client cache loads data.
- `/api/*` is proxied to the backend via a **`next.config` rewrite** so the browser uses a
  single origin; the request still carries the Supabase Bearer token exactly as today. Backend
  untouched.

### App Router structure

Because auth is client-side, the interactive app is a **client subtree** under a server
RootLayout:

- `app/layout.tsx` — **RootLayout (server)**: owns `<html><head>…</head><body>`, fonts, global
  CSS import, renders `<Providers>{children}</Providers>`.
- `app/providers.tsx` — **`"use client"`**: wraps children in `AuthProvider` + `CacheProvider`
  + the existing `AppShell` (rail/topbar). This is where today's `App.tsx`/`AuthGate`/
  `AppShell` responsibilities land.
- `app/page.tsx` — Home (client component for now; reads the cache).
- `app/library/page.tsx` — Library (client; reads the cache).
- Routes for `/create`, `/admin`, `/admin/reference-ads` are **stubbed** in this spec (a
  minimal page that renders the existing component shell) and fully rebuilt in later specs.
  Spec #1 only needs Home + Library functional as the cache smoke test.

### Routing migration (this spec's slice)

`react-router-dom` is removed. For the files touched in Spec #1 (AppShell nav, Home, Library):
- `<Link to>` / `<NavLink>` → `next/link` (`<Link href>`), active state via
  `usePathname()` from `next/navigation`.
- `useNavigate()` / `useSearchParams()` → `next/navigation` equivalents.
- Remaining pages still reference react-router until rebuilt in Spec #3; to keep the build green
  in the interim, those routes are the stubs above (which don't import react-router). The
  dependency is fully dropped once no file imports it (verified at the end of Spec #3; if any
  remains at end of Spec #1 it's only in not-yet-migrated components rendered by stubs — none
  should be on the Home/Library/shell path).

### Client data cache (stale-while-revalidate)

A small hand-rolled module — **no new dependency** — exposed as a client context. Mirrors how
legacy boots data once and serves from memory while refreshing.

- `src/data/cache.tsx` (new, `"use client"`): a `CacheProvider` holding an in-memory store
  keyed by resource (`brands`, `ads`, `usage`), each `{ data, status, error }` with subscribers.
- Public surface (kept small — only what Home/Library need this spec):
  - `useResource<T>(key)` → `{ data, status, error, refresh }`. First use (status `idle`) kicks
    off a fetch; subsequent mounts return cached `data` immediately and trigger a background
    `refresh` (stale-while-revalidate).
  - `primeAfterAuth()` — called once when auth becomes `approved`; eagerly fetches `brands` +
    `ads` so first navigation is instant (the legacy boot-load).
  - `invalidate(key)` — mark stale / drop; used after mutations in later specs.
- Calls the existing `api.*` in `src/api/client.ts` (unchanged). Client-only: during SSR the
  provider renders with empty/`idle` state so the server shell is deterministic (no hydration
  mismatch).

### Home & Library (smoke test for the cache)

Rewire Home and Library to read via `useResource('ads')` / `useResource('brands')` instead of
local `useState`+`useEffect`+spinner. Behavior change: a warm revisit renders instantly and
refreshes in the background; first-ever load still shows the existing loading state. **No
markup/style changes** beyond swapping the data source and the router imports — visual restyle
is Spec #3.

## Files

**Added**
- `apps/web/next.config.js` (or `.mjs`) — App Router config + `/api` rewrite to the backend.
- `apps/web/app/layout.tsx`, `apps/web/app/providers.tsx`
- `apps/web/app/page.tsx`, `apps/web/app/library/page.tsx`
- Stub pages for `app/create/page.tsx`, `app/admin/page.tsx`,
  `app/admin/reference-ads/page.tsx`
- `apps/web/src/data/cache.tsx` (+ `cache.test.tsx`)
- `apps/web/next-env.d.ts` (generated)

**Changed**
- `apps/web/package.json` — scripts → `next dev` / `next build` / `next start`; deps add
  `next` (pre-authorized); remove Vite + `react-router-dom` from the dependency set once unused.
- `apps/web/tsconfig.json` — Next's TS settings (plugin, `moduleResolution`, JSX).
- `apps/web/src/shell/AppShell.tsx` — migrate nav to `next/link` + `usePathname`.
- `apps/web/src/home/Home.tsx`, `apps/web/src/library/Library.tsx` — use cache + Next routing.
- `apps/web/src/auth/*` — `AuthProvider` mounts inside `providers.tsx`; minimal changes to
  drop react-router coupling if any (no auth-flow change — that's Spec #4).

**Removed**
- `apps/web/index.html`
- `apps/web/src/main.tsx`, `apps/web/src/App.tsx` (responsibilities move to
  `app/layout.tsx` + `app/providers.tsx`)
- `apps/web/vite.config.ts`
- (react-router-dom dependency — removed when no file imports it)

## Testing

- Keep existing vitest suites green where components are unchanged; update tests for AppShell/
  Home/Library to the new routing + cache (mock `next/navigation`).
- `cache.test.tsx`: idle→loading→ready transitions, stale-while-revalidate (cached data while
  refetching), error path, subscriber notifications.
- SSR smoke: `next build` succeeds; a check that the rendered Home HTML contains the shell
  markup (not an empty root) and that the server render does not touch `window`/`document`.
- Manual (recorded for the final MANUAL-CHECKS.md): `npm run dev -w @bya/web` renders +
  hydrates with no hydration warnings; `/api` rewrite reaches the backend with the Bearer
  token; `npm run build -w @bya/web` succeeds.

## Acceptance criteria

1. `apps/web` runs as a Next.js App Router app; the shell is server-rendered (HTML arrives with
   shell markup) and hydrates with no hydration-mismatch warnings.
2. No static `index.html`; the document is produced by `app/layout.tsx`.
3. `/api/*` works end-to-end through the Next rewrite with the existing Bearer token;
   **`apps/backend` has zero changes**.
4. Home and Library read from the client cache: a warm revisit shows data immediately and
   refreshes in the background; no spinner-on-every-mount.
5. `npm run build -w @bya/web` and `npm test -w @bya/web` pass.

## Risks / notes

- **Bigger migration than Vite SSR.** Adopting Next means new build tooling, the `app/`
  structure, and migrating off `react-router-dom`. Spec #1 contains the blast radius to the
  shell + Home + Library by stubbing the other routes; full route migration completes in Spec #3.
- **Monorepo integration.** Next runs inside the npm workspace `@bya/web`; confirm it resolves
  the `@bya/shared` workspace package (transpile/`transpilePackages` if needed).
- **Client-only auth in Next.** We deliberately keep auth/data on the client; we are not using
  server components for data or cookie sessions (a future option, out of scope, noted in the
  roadmap).
- **Hydration parity.** Cache returns empty on the server, so server and client both render the
  loading/empty shell first. Keep `Date`/random/`window` out of the server render path
  (`Home.tsx`'s `new Date()` greeting must be computed after hydration or guarded).
- **Dependency cleanup.** Removing Vite/react-router from `package.json` happens only once
  nothing imports them; until then the build may carry both. Final removal verified in Spec #3.
- This spec leaves the app visually as-is; reviewers should expect scaffold + plumbing, not a
  new look.
