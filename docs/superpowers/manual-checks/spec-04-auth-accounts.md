# Manual checks — Spec #4 (Auth & Accounts)

## Schema / migrations
- None.

## Environment / accounts
- **`admin@betteryourads.dev` must exist and be approved** — the admin dashboard (rail link + the
  `/admin` page + backend `requireAdmin`) is gated on this exact email. Create + approve it if it
  doesn't exist (the backend `create-admin` CLI bootstraps an admin).

## Click-through smoke (verify manually)
- **Sign-up** now has a "Re-enter password" field: mismatched passwords block submit with an inline
  error; matching passwords create the account. Sign-in and forgot-password are unchanged (no
  confirm field).
- **Admin `/admin`**: as `admin@betteryourads.dev`, the account table loads; Approve/Revoke toggles
  a user's access (can't change your own row); type-to-confirm delete removes an account; Refresh
  refetches. As a non-admin (or before auth resolves) the page shows "Not authorized".

## Not done in this spec (noted)
- Recovery still uses a single password field (only sign-up gained the confirm, per request).
- A dedicated pixel-perfect legacy restyle of the auth screens wasn't done — they're functional and
  use the legacy class system. Flag if you want a visual pass.
