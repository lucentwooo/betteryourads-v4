# Coding rules

These override defaults. The generic "write clean code" stuff is assumed — only the deltas live here.

## Scope discipline

- **Do exactly what was asked. Nothing adjacent.** If the task is "fix the date bug in `formatDate`", change `formatDate` and stop. Do not reformat the file, rename variables you find ugly, or "while I'm here" refactor neighboring functions.
- **Touch the fewest files possible.** Before editing a second file, ask: is this edit _required_ for the task to work, or am I improving things uphill? If the latter, stop and surface it as a suggestion in chat instead.
- **No drive-by changes.** Unrelated lint fixes, import reordering, removing "unused" code you don't fully understand, swapping `let` to `const` in untouched blocks — all out of scope unless asked.
- **Don't create new files unless necessary.** Prefer editing an existing file. New file requires a real reason (it's a new module the task needs, the existing file would become unwieldy, etc.) — say the reason in your response.
- **Don't add new dependencies without flagging it first.** A `pnpm add` is a decision, not an implementation detail.

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

## Response style

- Don't restate the task back to me before answering.
- Don't append a summary of what you just did when the diff already shows it. A one-line "done — `X` now handles `Y`" is enough; a bulleted recap of every change isn't.
- If a change has a non-obvious consequence (touches a public API, changes a default, needs a migration), call that out. Otherwise skip the postamble.
