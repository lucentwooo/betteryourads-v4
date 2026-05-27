# API Auth Gate — Design (Spec ① of 3)

**Date:** 2026-05-28
**Branch:** `feature/jerey-refactor`
**Status:** Approved (design); pending implementation plan

> Part of a three-spec decomposition pulled out of a single request ("magic-link
> login + 10-generation cap + render-timeout fix"). The three pieces decompose by
> dependency: **① API auth (this doc)** is fully independent and buildable now;
> **② render reliability** is built into the new render pipeline; **③ generation
> quota** is the join point and depends on both ① and the render pipeline. Specs ②
> and ③ are written separately, in that order.

## Goal

Make the new TS backend's cost endpoints **un-bypassable**: every protected request
must carry a valid Supabase Auth token belonging to an **approved** user. There is no
login UI in this phase (per the master rebuild spec, the frontend comes later) — this
slice is the secure **backend half** of magic-link auth: it verifies tokens and enforces
approval on every protected call, and it exposes the public Supabase config so the
eventual frontend can wire up the login UX in one step.

This does **not** send magic-link emails or capture sessions — those belong to the
frontend phase. Obtaining a token for testing is done with a small Supabase-side step
(see Verification).

## Scope

**In:**
- A server-only Supabase **service-role admin client** with just the two functions this
  slice needs (`getUserFromToken`, `isApproved`).
- A `requireApprovedUser` Express middleware that gates protected routes.
- Typed `AuthError` (401) and `ForbiddenError` (403), mapped to HTTP by the existing
  `toHttpError`.
- Applying the middleware to the cost endpoints that **already exist**: `/api/extract`
  and `/api/brand`.
- Extending `GET /api/config` to expose `supabaseUrl` + `supabaseAnonKey` (browser-safe).

**Out (explicitly):**
- Sending magic-link emails / capturing sessions / any login UI (frontend phase).
- The 10-generation cap (Spec ③).
- Any change to the render pipeline (Spec ②).
- Schema changes — this slice consumes the existing `profiles.approved` (see Data model).

## Decisions (locked)

- **Auth source:** Supabase Auth, consistent with the legacy app and the master spec.
  `.env` already provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Approach A (verify-only gate + config hook).** The backend verifies the bearer JWT
  and enforces approval; it does not run the OTP send/redirect dance. Rejected
  alternatives: a server-initiated `signInWithOtp` send endpoint (deferred — needs a
  landing page to be useful), and a full backend-owned session relay with httpOnly
  cookies (over-engineered for a no-UI phase; fights Supabase's browser-first model).
- **Approval required**, not just authenticated: a request must present a valid token
  **and** the user's `profiles.approved` must be `true`. Approval is flipped in the
  Supabase dashboard (no in-app admin UI this phase).
- **Gate all cost endpoints.** The middleware is applied to every cost-incurring
  endpoint; only `/extract` and `/brand` exist today, so those are wired now, and
  `/ad-prompt` + `/render` adopt the same middleware when they are built.

## Architecture

New and edited files under `apps/backend/`:

```
src/services/supabase.ts                  NEW  service-role admin client (server-only)
src/middleware/require-approved-user.ts   NEW  the gate
src/lib/errors.ts                         EDIT add AuthError, ForbiddenError; Stage += 'auth'
src/config/index.ts                       EDIT add supabaseUrl + supabaseAnonKey to AppConfig
src/routes/config.ts                      (unchanged — already returns loadConfig())
src/routes/extract.ts                     EDIT apply requireApprovedUser
src/routes/brand.ts                       EDIT apply requireApprovedUser
tests/auth.middleware.test.ts             NEW  unit tests (supabase service mocked)
tests/routes.test.ts                      EDIT existing route tests get an approved-user stub
tests/config.test.ts                      EDIT assert supabase url/anon present
```

`config/index.ts` already returns a `loadConfig()` object that `routes/config.ts` serves
verbatim, so adding the two fields to `AppConfig` is enough — the route needs no change.

### `services/supabase.ts`

A lazily-created service-role client (`createClient(SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`),
server-only. It exposes exactly two functions for this slice:

- `getUserFromToken(token: string): Promise<{ id: string; email: string | null } | null>`
  — wraps `admin.auth.getUser(token)`; returns `null` on any invalid/expired token.
- `isApproved(userId: string): Promise<boolean>` — `select approved from profiles where
  id = userId`; returns `false` if no row or `approved` is not `true`.

This file is the first sliver of the Plan-5 Supabase persistence service. **Coordination
note:** Spec ①/this slice *creates* the file with these two functions; Plan 5
(persistence) *extends* the same file. Whichever runs first owns creation; the other
appends. Do not let both create it independently.

### `middleware/require-approved-user.ts`

```
read Authorization: Bearer <token>
 ├─ missing/malformed header                 → throw AuthError (401, AUTH_REQUIRED)
 ├─ getUserFromToken(token) → null           → throw AuthError (401, AUTH_REQUIRED)
 └─ user → isApproved(user.id)
       ├─ false                              → throw ForbiddenError (403, NOT_APPROVED)
       └─ true → req.user = { id, email }; next()
```

Errors are thrown (not sent directly) so they flow through each route's existing
`try/catch → toHttpError` path, keeping error shaping in one place. The middleware
augments Express's `Request` with an optional `user?: { id: string; email: string | null }`
via a local module augmentation (no shared `types.ts` for a single type, per house rules).

Because each existing route wraps its handler in `try/catch`, the middleware is invoked
inside that wrapper (or the route awaits it) so thrown `AuthError`/`ForbiddenError` reach
`toHttpError`. Implementation detail for the plan: either run the check at the top of the
handler's `try`, or use an Express error-handling middleware — the plan picks one; the
contract (401/403 bodies below) is what matters here.

### `lib/errors.ts` (additions)

- Extend `Stage` union with `'auth'`.
- `AuthError extends AppError` → `("...", "AUTH_REQUIRED", 401, "auth")`.
- `ForbiddenError extends AppError` → `("...", "NOT_APPROVED", 403, "auth")`.

`toHttpError` already maps any `AppError` to `{ status, body: { error: { code, message,
stage } } }`, so no change to `toHttpError` itself.

### `config/index.ts` (additions)

Add to `AppConfig` and `loadConfig`:
- `supabaseUrl: string` ← `env.SUPABASE_URL ?? ""`
- `supabaseAnonKey: string` ← `env.SUPABASE_ANON_KEY ?? ""`

Both are browser-safe (the anon key respects RLS). The **service-role key is never added
to config** and never leaves the backend.

## Request / response contract

| Condition | Status | Body |
|---|---|---|
| No / malformed `Authorization` header | 401 | `{ error: { code: "AUTH_REQUIRED", message, stage: "auth" } }` |
| Token invalid or expired | 401 | same as above |
| Valid token, `approved = false` or no profile | 403 | `{ error: { code: "NOT_APPROVED", message, stage: "auth" } }` |
| Valid token, `approved = true` | — | proceeds to the route handler |

`GET /api/config` response gains (existing fields unchanged):
```json
{ "supabaseUrl": "https://...supabase.co", "supabaseAnonKey": "eyJ..." }
```
The service-role key is never present in this response.

## Data model — no migration

The master rebuild spec lists `profiles` (with `approved`) as part of the **current,
populated** schema, and the earlier auth work created it with the auto-create trigger and
RLS. This slice **consumes** `profiles.approved` via the service-role client (which
bypasses RLS); it creates and alters nothing.

If verification reveals the `profiles.approved` column or the signup trigger is missing in
the live DB, that is a small follow-up migration handled under Plan 5's CLI-migrations
adoption — not part of this slice's code.

## Dependencies

- **New:** `@supabase/supabase-js` added to `apps/backend`. Required — there is no token
  verification without it. (Flagged per house rules: adding a dependency is a decision.)

## Error handling

- 401 and 403 are distinct and carry `stage: "auth"`; messages are generic and never
  contain token contents or Supabase internals.
- A bad/expired token resolves to `null` from `getUserFromToken` → 401 (we cannot prove
  identity); we do not surface the underlying Supabase error.
- An unexpected failure of the `profiles` lookup (e.g. network) propagates as a thrown
  error → the existing `toHttpError` default maps it to a generic 500 `INTERNAL` with no
  leaked internals. No bespoke retry/logging wrapper (per anti-over-engineering rules).

## Verification ("demonstrated", not assumed)

- **Unit — `tests/auth.middleware.test.ts`** (Supabase service mocked, mirroring the
  existing service-mocking pattern):
  - no `Authorization` header → 401 `AUTH_REQUIRED`, handler not reached.
  - invalid token (`getUserFromToken` → `null`) → 401, handler not reached.
  - valid token but `isApproved` → `false` → 403 `NOT_APPROVED`, handler not reached.
  - valid + approved → `next()` called and `req.user` set to `{ id, email }`.
- **Route tests — `tests/routes.test.ts` (edit):** `/extract` and `/brand` now require
  auth, so the existing happy-path tests get an approved-user stub (mock the Supabase
  service to return an approved user) and keep passing; add one case asserting a
  token-less request returns 401. *This breakage of the current token-less tests is
  expected and is part of this slice, not a regression.*
- **Config test — `tests/config.test.ts` (edit):** assert `supabaseUrl` and
  `supabaseAnonKey` are present in `loadConfig(...)` output and that the service-role key
  value is absent. (The existing routes test already asserts the `/config` body contains
  no `sk-` secrets; anon/service JWTs begin `eyJ`, so the explicit service-role-absence
  assertion lives in the config test.)
- **Gated real smoke (optional, `BYA_AUTH_E2E=1`):** with a real token for an approved
  test user, hit one protected endpoint and confirm it is *not* 401/403; skipped by
  default so normal runs incur no Supabase calls.

**Getting a token for the gated smoke / manual checks** (no UI exists): create or pick a
test user and approve it in the Supabase dashboard, then obtain a session token via a
one-off Supabase call (e.g. a throwaway `signInWithOtp` in a browser, or
`admin.generateLink` + `verifyOtp` in a short script). This is a test-time concern only;
no token-issuing code ships in this slice.

## Parallelization

This slice is **fully independent** of the in-flight master Plans 3–5 and can be built
alongside them. Its new files touch nothing those plans touch; its edits to `errors.ts`
and `config/index.ts` are additive (rebase, don't merge — per house rules). The single
coordination point is `services/supabase.ts` creation vs. Plan 5 extension (see
Architecture).

## Out of scope (this slice)

- Magic-link send / session capture / login UI — frontend phase.
- The 10-generation/day cap — Spec ③ (depends on this slice + the render pipeline).
- Render-timeout reliability — Spec ② (built into the new render pipeline).
- Per-user data scoping of reads/writes beyond the approval gate — frontend phase / Plan 5.
