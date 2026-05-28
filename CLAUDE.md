# Project context

BetterYourAds turns a website URL into on-brand ad creative through a 3-stage pipeline:

1. **Extract / Brand (Stage 1)** — headless Chromium (Playwright) reads exact colors, fonts, and text off the live page; an OpenRouter LLM turns that measured data into structured brand "DNA".
2. **Ad prompt (Stage 2)** — a vision model turns the brand DNA (+ optional user direction / product asset) into a structured image-generation prompt.
3. **Render (Stage 3)** — the prompt goes to an image backend (KIE GPT-Image, or an OpenRouter image model) and the result is persisted to Supabase Storage.

**Monorepo** (npm workspaces, Node ≥20):

- `apps/backend` (`@bya/backend`) — Express + TypeScript API; the current rebuild. Routes: `/api/extract`, `/api/brand`, `/api/ad-prompt`, `/api/render`, `/api/config` — all gated by `requireApprovedUser`.
- `apps/web` (`@bya/web`) — React + Vite + react-router frontend.
- `packages/shared` (`@bya/shared`) — zod schemas shared by both (`brand-extraction`, `ad-prompt`, `render`, `measured-site-data`).
- `legacy/` — the original single-file Express prototype (what `main` and the root `README.md` still describe). Don't build on it.

**Branches are independent lines — never merge them together.** `main` = legacy prototype; `feature/jerey-refactor` = TS backend rebuild; `feature/web-frontend` = React frontend.

**Secrets** live in a root `.env` (copy from `.env.example`): `OPENROUTER_API_KEY`, `STAGE1_MODEL` / `STAGE2_MODEL`, `IMAGE_BACKEND` + `KIE_*` / `OPENROUTER_IMAGE_*`, and `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (service-role key is server-only and bypasses RLS).

**Feature list:** `docs/FEATURES.md` is the human-readable catalog of everything the project does. Keep it in sync with the code: when you implement a large feature (a new route, page, pipeline stage, or integration), add a one-line entry to the matching section. When a feature is removed from the code, delete its line — don't leave it listed. Small, internal changes (refactors, bug fixes, helper tweaks) don't belong there.

# Common commands

Run from the repo root; target a workspace with `-w`.

- **Install:** `npm install`, then `npx playwright install chromium` (the backend needs the browser).
- **Backend dev server:** `npm run dev -w @bya/backend`
- **Backend tests:** `npm test -w @bya/backend` (vitest; gated e2e tests skip without keys)
- **Pipeline scripts (run one stage from the CLI):** `npm run run:extract -w @bya/backend` — also `run:brand`, `run:ad-prompt`, `run:render`
- **Web dev server:** `npm run dev -w @bya/web`
- **Web build / typecheck:** `npm run build -w @bya/web`
- **Web tests:** `npm test -w @bya/web`

# Coding rules

These override defaults. The generic "write clean code" stuff is assumed — only the deltas live here.

## Scope discipline

- **Do exactly what was asked. Nothing adjacent.** If the task is "fix the date bug in `formatDate`", change `formatDate` and stop. Do not reformat the file, rename variables you find ugly, or "while I'm here" refactor neighboring functions.
- **Touch the fewest files possible.** Before editing a second file, ask: is this edit _required_ for the task to work, or am I improving things uphill? If the latter, stop and surface it as a suggestion in chat instead.
- **No drive-by changes.** Unrelated lint fixes, import reordering, removing "unused" code you don't fully understand, swapping `let` to `const` in untouched blocks — all out of scope unless asked.
- **Don't create new files unless necessary.** Prefer editing an existing file. New file requires a real reason (it's a new module the task needs, the existing file would become unwieldy, etc.) — say the reason in your response.
- **Don't add new dependencies without flagging it first.** An `npm install <pkg> -w <workspace>` is a decision, not an implementation detail.

## Anti-over-engineering

- **Solve the problem in front of you, not the imagined future one.** No "extensible" interfaces, plugin systems, strategy patterns, or factories unless the task explicitly needs more than one implementation _today_.
- **Inline beats abstracted until there are 3+ callers.** Don't extract a helper for one use site. Don't extract a type alias used once. Don't make a config object for two parameters.
- **No new layers.** Don't introduce a service/repository/adapter wrapping something that already works. Don't wrap a library "for flexibility."
- **No premature configuration.** Don't add env vars, feature flags, or options objects for values that aren't actually going to vary. Hardcode it; it can be lifted later when a second case appears.
- **One way to do a thing.** Don't add an alternate code path "for backward compatibility" or "in case." Pick one.
- **No speculative error handling.** Catch errors you can actually do something about. Don't wrap every call in try/catch to log and rethrow — that adds noise without changing behavior. Let it throw.
- **Defaults to skip:** barrel `index.ts` re-exports, `types.ts` files for one type, custom hooks wrapping one library call, `useMemo`/`useCallback` without a measured reason.

## TypeScript specifics

- Prefer `type` over `interface` unless declaration merging is actually needed.
- No `any`. If you genuinely can't type something, `unknown` + narrow.
- Don't add `as` casts to silence the compiler. If TS complains, the type is probably wrong — fix the type, not the error.
- Avoid `enum`; use string literal unions (`type Status = 'idle' | 'loading' | 'done'`).
- Don't `export` something that isn't imported elsewhere. Internal stays internal.

## When unsure, ask — don't guess

- If the task is ambiguous in a way that affects which files you'll touch or which approach you'll take, ask one short question before writing code. A 10-second clarification beats a 200-line revert.
- If you discovered something mid-task that changes scope (the bug is actually elsewhere, the requested approach won't work, there's a simpler way), stop and surface it. Don't quietly do a different task.

## Git

- When integrating changes from another branch, **rebase, don't merge.** No merge commits in the history.
- When pushing rebased branches, use `git push --force-with-lease` (never plain `--force`). If the lease check fails, stop and surface it — someone else pushed and I need to know.

### Branch-lifecycle tags (because rebase erases topology)

Rebasing flattens history into one line, so the graph can't show when a branch forked or merged. We record that with **one annotated tag per branch, written only at merge time** — the fork point lives inside the tag's message, not as a separate tag. While a branch is still alive its ref plus `git merge-base <branch> <base>` already tell you where it forked, so an in-flight branch needs no tag; the fork point only becomes unrecoverable once the branch is deleted, which is exactly when this tag gets written. Result: one tag per completed branch instead of two-or-three, and the graph stays uncluttered.

- **On merge/integration** — after the fast-forward, capture the fork base first, then tag the merged tip:
  `git merge-base <branch> <target-branch>` → `<base-sha>`
  `git tag -a merged/<branch> -m "merged <branch> into <target-branch> (YYYY-MM-DD); forked from <base-branch>@<base-short-sha>"`
  Then push the tag so it's shared: `git push origin merged/<branch>`.
- **Don't tag forks or rebases.** No `fork/*` or `rebased/*` tags — that history is derivable while the branch lives and is folded into the `merged/*` message once it doesn't.
- **Before deleting a merged branch**, make sure its `merged/<branch>` tag exists and is pushed — the tag is the durable record once the branch ref is gone.
- **Naming:** always `-a` (annotated, so it carries author/date/message); lowercase, `merged/` prefix, dates as `YYYY-MM-DD`. Never retag a pushed tag to a different commit (delete + recreate with a new name instead).
- **To read the history:** `git tag -n9 --sort=-creatordate "merged/*"` reads back as a dated ledger, or `git log --oneline --decorate --simplify-by-decoration` to see tags inline on the linear graph.

## Database migrations (Supabase)

- **Migrations are applied by hand, not by the CLI.** The owner has no Supabase CLI installed and doesn't want one. When a migration needs applying, give the owner the SQL to paste into the Supabase dashboard → SQL Editor → Run. Don't tell them to run `supabase db push`, `supabase login`, or `supabase link`.
- **Never run or recommend `supabase db push` on this project.** The existing migrations were applied manually, so the `supabase_migrations.schema_migrations` history is empty. A `db push` would try to re-run all of them, and the `rename` migration is not idempotent — it would error on the already-renamed tables.
- **New migration files still go in `supabase/migrations/` with a timestamp prefix** (the prefix is the apply order). After authoring one, hand the owner its SQL to paste, and remind them to run files in filename order if there's more than one. Keep migrations idempotent where possible (`create ... if not exists`, `drop policy if exists` then `create`).
- **To verify a migration landed**, give the owner a `select ... from information_schema.tables` query for the dashboard — that's the confirmation step, not anything CLI-based.

## Response style

- Don't restate the task back to me before answering.
- Don't append a summary of what you just did when the diff already shows it. A one-line "done — `X` now handles `Y`" is enough; a bulleted recap of every change isn't.
- If a change has a non-obvious consequence (touches a public API, changes a default, needs a migration), call that out. Otherwise skip the postamble.
