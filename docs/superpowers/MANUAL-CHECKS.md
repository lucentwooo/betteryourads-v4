# Manual checks — SSR refactor (all specs)

The single owner-facing checklist for the whole `worktree/refactor/massive-refactor` program.
Everything the autonomous run could **not** do unattended (apply DB migrations, run a browser,
configure deploy env) is collected here. Per-spec detail lives in
`docs/superpowers/manual-checks/spec-0*.md`.

---

## 1. Database migrations (apply BY HAND in the Supabase SQL Editor)

> Per project policy, migrations are pasted into the dashboard, not pushed by CLI. Run in filename
> order. Only **one** new migration was introduced by this program:

**`supabase/migrations/20260530120000_brand_goal.sql`**
```sql
alter table public.brand_extractions add column if not exists goal text;
```
Verify:
```sql
select column_name from information_schema.columns
where table_name = 'brand_extractions' and column_name = 'goal';
```
Until applied: setting a brand goal (`PATCH /api/brand/:id/goal`, the onboarding goal step, and the
board goal picker) will error.

No other schema changes — the concept board reuses `ad_concept_sets`, the per-brand logo reuses
`brand_assets` (kind='logo'), ad scoping uses existing joins, and bulk reference-ads reuse the
already-nullable `reference_ads.label`.

---

## 2. Environment variables

**Web (`apps/web`, the Next.js server)**
- `BACKEND_ORIGIN` — origin of the Express API for the `/api` proxy rewrite. Defaults to
  `http://localhost:3000`. **Must be set in any non-local deployment** or `/api/*` 404s.

**Backend (`apps/backend`)**
- `STAGE3_MODEL` — model used to generate the concept board (confirm set).
- `GENERATION_TZ` — default `Australia/Sydney`. Daily quota resets at local midnight in this zone.
- `DAILY_GENERATION_LIMIT` — default `10`. Per-user daily creative cap (admin unlimited).
- Existing secrets unchanged: `OPENROUTER_API_KEY`, `STAGE1/STAGE2 models`, `KIE_*` /
  `OPENROUTER_IMAGE_*`, `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.

---

## 3. Deployment / ops notes

- **The web app is now a Next.js server** (`next start -p 3001`), not a static bundle — the host
  must run Node. Ports: web **3001**, backend **3000** (two processes).
- **`brand-assets` Storage bucket CORS** must allow the app origin — the workbench pre-fills a
  brand's saved logo by fetching its signed URL in the browser. If logo pre-fill silently fails,
  check the bucket CORS.
- **Admin account:** `admin@betteryourads.dev` must exist and be approved (admin dashboard + the
  rail admin links + backend `requireAdmin` are gated on it). The backend `create-admin` CLI
  bootstraps it.

---

## 4. Browser click-through smoke (not run by the autonomous build)

**Foundation / instant feel (Spec #1)**
- Load `/` — view-source shows the SSR shell (not an empty root); no hydration warnings in console.
- Sign in → Home & Library show data; revisit a page → renders instantly from cache while a
  background refresh fires (Network tab).

**Concept board (Spec #2)** *(needs the goal migration applied)*
- `/board/<brandId>` with no board → goal picker; pick a goal → 10–16 concepts grouped by awareness
  stage, focus stages expanded; select → Next; Regenerate redraws.

**Core UX (Spec #3)**
- Onboarding `/onboarding`: URL → analyzing → goal, with a working **Back** button retaining input.
- Cog (rail footer) → sign-out popover; closes on outside-click/Escape.
- "Make an ad" → start modal (pick brand → board, or add a new client → onboarding).
- Workbench `/create` (from a board selection): one asset card per concept (ref + logo required) →
  "Make my ads" → batch → "Your ads are ready" toast.

**Auth & accounts (Spec #4)**
- Sign-up requires a matching **Re-enter password**; mismatch blocks with an inline error.
- As admin: `/admin` table → approve/revoke (not your own row); type-to-confirm delete; refresh.

**Quotas & per-brand (Spec #5)**
- Generate to the cap → blocked; "X of Y creatives left today" shows; admin unlimited. (Confirm
  AEST reset, or temporarily set `DAILY_GENERATION_LIMIT=1`.)
- `/library?brandId=<id>` (or a rail brand) → only that brand's ads; `/library` → all, grouped by
  brand.
- Upload a logo on the board → it's the brand's logo; start an ad for that brand → workbench logo
  pre-filled.

**Reference ads (Spec #6)**
- `/admin/reference-ads`: drag in 8 files → all 8 upload to the active variant (no label step);
  delete works; tab switch loads the other variant.

---

## 5. Known limitations (acknowledged in code review)

- **Quota TOCTOU:** two simultaneous `POST /api/batch` requests can each pass the quota check
  before either finishes, marginally exceeding the daily cap. Low impact at current scale; closing
  it fully needs a DB-level counter.
- **`brand_assets.brand_id` FK** was authored against the pre-rename `brands` table; Postgres
  follows it by OID so it works at runtime — just don't re-run the baseline migration from scratch.
- **Visual fidelity:** the app uses the legacy token/class system and is structurally faithful, but
  a dedicated pixel-perfect legacy restyle pass was **not** done (Specs #3/#4). Flag if wanted.
- **Recovery** still uses a single password field (only sign-up gained the confirm, per request).

---

## 6. Cleanup summary (Spec #6)

Removed as part of the refactor: the Vite SPA entry (`index.html`, `main.tsx`, `App.tsx`,
`vite.config.ts`), the entire old concept path (`routes/concepts.ts`, `pipelines/concepts.ts`,
`prompts/ad-concepts.v1.ts`, `ConceptSet`/`AdIdea`), the `react-router-dom` dependency, and
orphaned helpers (`workbench/brandChip.ts`, `vite-env.d.ts`). `legacy/` is left intact as
reference (untracked) — delete it yourself if you want it gone.
