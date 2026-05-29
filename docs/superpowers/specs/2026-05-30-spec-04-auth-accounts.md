# Spec #4 — Auth & Accounts

**Date:** 2026-05-30
**Branch:** `worktree/refactor/massive-refactor`
**Part of:** [SSR Refactor Program Roadmap](./2026-05-30-ssr-refactor-roadmap.md)
**Depends on:** Spec #1 (SSR), Spec #3 (core UX/styling). **Status:** Design.

## Goal

Finish the authentication surface and the admin accounts dashboard in the legacy style: add a
**re-enter password** confirmation to sign-up, keep recovery + pending-approval screens, and port
the existing **admin accounts dashboard** (approve / revoke / delete) into the Next app, restyled
to legacy. Admin identity stays `admin@betteryourads.dev`.

## Scope

### Sign-up: re-enter password

- In `apps/web/src/auth/LoginView.tsx`, the **sign-up** mode gets a second password field
  ("Re-enter password"). Submit is blocked (with an inline message) unless the two match and meet
  the existing minimum. Sign-in and forgot-password modes are unchanged.
- No backend change (Supabase `signUp` already takes one password; confirmation is client-side).

### Auth screens (legacy styling)

- Restyle `LoginView`, `RecoveryView`, `AuthLayout`, and the **awaiting-approval** + **error**
  states (currently inline in `AuthGate`) to the legacy auth look (two-column / centered card per
  legacy `app.html` auth screens). Behavior unchanged except the sign-up confirm field.
- Recovery stays a single password field (only sign-up gained confirm, per request) — note in
  manual checks in case parity with sign-up is later wanted.

### Admin accounts dashboard

- Replace the Spec #1 `/admin` stub with the real dashboard, porting `AdminDashboard.tsx`:
  - Table of users: email, status (Approved/Pending + Admin badge), joined, last sign-in.
  - **Approve / Revoke** → `api.setUserApproval(id, approved)` (PATCH); can't toggle self.
  - **Delete** → type-to-confirm modal → `api.deleteAdminUser(id)`.
  - Refresh button → `api.getAdminUsers()`.
- Migrate it off `react-router-dom` (done in Spec #3 generally; confirm here) and restyle to the
  legacy admin table look using `app.css` classes.
- Admin gating stays: visible only to `admin@betteryourads.dev` (rail + backend `requireAdmin`).

## Non-goals

- Reference-ads admin (Spec #6).
- Quota display (Spec #5).
- Cookie/server sessions — auth remains client-side (per program decision).
- No change to backend auth/approval logic (already implemented and kept).

## Architecture notes

- All client-side; reuses existing `AuthProvider` + `api.*` admin calls (unchanged backend).
- Password-confirm is local form state + validation in `LoginView`.

## Testing

- LoginView sign-up: mismatched passwords blocks submit + shows message; matching passwords calls
  `supabase.auth.signUp` once; sign-in/forgot unaffected.
- AdminDashboard: renders rows; Approve/Revoke calls the API and updates the row; self-row can't be
  toggled; delete requires exact type-to-confirm then calls delete; refresh refetches. (Mock `api`.)

## Acceptance criteria

1. Sign-up requires matching password + confirm before submitting; other auth modes unchanged.
2. Auth screens and the awaiting-approval/error states match the legacy styling.
3. The admin accounts dashboard works (approve/revoke/delete/refresh), legacy-styled, admin-only.
4. `npm test -w @bya/web` passes.

## Manual checks (for final MANUAL-CHECKS.md)

- **Ensure `admin@betteryourads.dev` exists and is approved** (create + approve if missing) — admin
  features are gated on it.
- Click-through: create account with mismatched then matching passwords; sign in as admin → approve
  a pending user → that user can enter; revoke → they're gated again; delete a user.
- No schema/env changes in this spec.
