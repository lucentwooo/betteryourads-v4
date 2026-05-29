# Manual checks — Spec #1 (SSR Foundation)

## Schema / migrations
- None. Spec #1 makes no database changes.

## Environment variables
- **`BACKEND_ORIGIN`** (apps/web, Next server): origin of the Express API for the `/api`
  rewrite. Defaults to `http://localhost:3000`. **In any non-local deployment this MUST be set**
  to the backend's real URL, or `/api/*` calls 404.
- Backend keeps its existing env (`OPENROUTER_API_KEY`, `SUPABASE_*`, etc.) — unchanged.

## Ports / processes
- Web (Next) runs on **3001**; backend on **3000**. If the backend runs on another port, set
  `BACKEND_ORIGIN` accordingly. Two processes must run (no combined script added this spec).

## Deployment notes
- The web app is now a Next.js server (`next start -p 3001`), not a static bundle — the host
  must run Node, not just serve static files.
- `public/` assets are served at `/`.

## Click-through smoke (not run by the autonomous build — verify manually)
- Load `/`: SSR shell present in view-source (shell markup, not an empty root); no hydration
  warnings in the console.
- Sign in → Home and Library show data; revisit is instant (cache) with a background refresh
  (a second `/api/ads` request fires in the Network tab while the cached list stays on screen).
