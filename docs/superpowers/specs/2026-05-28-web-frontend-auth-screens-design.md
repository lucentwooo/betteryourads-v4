# Web Frontend — Auth Screens Slice — Design

**Date:** 2026-05-28
**Branch:** `feature/web-frontend`
**Status:** Approved (autonomous build authorized); pending implementation plan
**Builds on:** Foundation slice

## Context

Foundation's `AuthGate` renders placeholder screens for `signed-out` and `awaiting-approval`,
and `AuthProvider` exposes the live Supabase `client` + derived `status`. This slice replaces
the `signed-out` placeholder with the real auth UI and adds the password-recovery flow —
porting the legacy `auth.js` capabilities (`legacy/auth.js`, `legacy/app.html` auth screen).
No backend or Plan 5 dependency: all auth runs client-side against Supabase with the anon key.

## Auth flows (Supabase, via `useAuth().supabase`)

| Mode | Supabase call | After success |
|---|---|---|
| Sign in | `auth.signInWithPassword({ email, password })` | `onAuthStateChange` fires → status recomputes (→ approved / awaiting-approval) |
| Sign up | `auth.signUp({ email, password, options: { emailRedirectTo: origin } })` | show "check your email to verify" |
| Magic link | `auth.signInWithOtp({ email, options: { emailRedirectTo: origin } })` | show "check your email for the link" |
| Forgot password | `auth.resetPasswordForEmail(email, { redirectTo: origin })` | show "check your email for a reset link" |
| Recovery (set new pw) | `auth.updateUser({ password })` | clears recovery → returns to app/sign-in |

`origin = window.location.origin`. Supabase persists the session (Foundation config), so a
successful sign-in needs no manual navigation — the gate re-renders from the status change.

## Recovery detection

When a user clicks a reset link, Supabase emits a `PASSWORD_RECOVERY` event via
`onAuthStateChange`. `AuthProvider` must capture it and surface a `recovery` status so the
gate shows the set-new-password form (not the signed-in app). This requires:

- `status.ts`: add `"recovery"` to the `AuthStatus` union.
- `AuthProvider.tsx`: track a `recovery` boolean set true on the `PASSWORD_RECOVERY` event;
  fold into the exposed status (`recovery` wins over the session-derived status). Cleared on
  successful `updateUser` (the RecoveryView calls a `clearRecovery` action) or on sign-out.
- `AuthGate.tsx`: `status === "recovery"` → `<RecoveryView/>`.

`deriveStatus` stays pure (session + profile); recovery is layered on top in the provider
because it is event-driven, not derivable from session state.

## Components & files (`apps/web/src/auth/`)

- `AuthLayout.tsx` — shared split layout (left: brand + value-prop copy ported from
  `legacy/app.html`; right: a `.stage` card slot). 3 call sites (login, recovery, awaiting)
  → justifies the component.
- `LoginView.tsx` (+ test) — mode state (`"sign-in" | "sign-up" | "magic-link" | "forgot"`),
  email/password fields, submit handlers per the table above, inline error + success message,
  links to switch modes.
- `RecoveryView.tsx` (+ test) — new-password field → `updateUser`; success/error messaging.
- Modify `status.ts` (add `recovery`), `AuthProvider.tsx` (recovery tracking + `clearRecovery`
  on the context value), `AuthGate.tsx` (render `LoginView`/`RecoveryView`; reuse `AuthLayout`
  for the awaiting-approval screen).

The `AuthValue` gains `recoveryActive`/`clearRecovery`? — No: keep the context lean. The
provider exposes `status` (now including `recovery`) and adds a single `clearRecovery: () =>
void` to `AuthValue` for RecoveryView to call after a successful password update.

## Error handling

Each form catches the Supabase `{ error }` result (these calls return `{ data, error }`, they
don't throw) and renders `error.message` inline. No global error layer. Loading state per
form disables the submit button while awaiting.

## Testing

- `LoginView`: for each mode, submitting calls the correct `supabase.auth.*` method with the
  entered email/(password); an error result renders its message; mode-switch links change the
  visible fields/heading. Mock `useAuth` to supply a fake `supabase` whose `auth.*` are `vi.fn()`.
- `RecoveryView`: submitting a new password calls `auth.updateUser({ password })` and, on
  success, calls `clearRecovery`.
- `AuthGate`: update the existing `signed-out` test to render `LoginView` (provide a mock
  `supabase` in the mocked `useAuth` value); add a `recovery` case rendering `RecoveryView`.
- `AuthProvider`: (light) the `PASSWORD_RECOVERY` event sets status to `recovery` — covered by
  the status-layering logic; if hard to test through the provider, assert the small pure piece.

## Out of scope (this slice)

- Home dashboard, library, saved-brand reuse (Slice D).
- Any backend change. Email templates / Supabase project config (owner-managed).
- Social/OAuth providers (legacy didn't have them).
