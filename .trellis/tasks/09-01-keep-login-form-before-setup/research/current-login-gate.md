# Current login gate evidence

Reviewed 2026-09-01.

- `template/admin/src/routes/login.tsx` loads `setupStatusOptions` and replaces
  `LoginForm` with `RecoveryState` when setup status is `required`.
- The same loader also replaces the form with a setup dependency error when
  the status request fails. Neither branch is necessary to authenticate.
- `template/api/internal/auth/application/authentication.go` performs email and
  password boundary validation, rate limiting, and account lookup without a
  setup-status prerequisite. A missing account maps to `ErrInvalidCredentials`.
- `/setup` owns the setup-status and one-time authority behavior independently,
  so removing the login gate does not weaken the setup route.
- The existing serial Chromium flow initializes through the setup link and
  later validates login/session behavior. It can additionally visit `/login`
  before setup to assert the normal form and generic invalid-credentials error.
