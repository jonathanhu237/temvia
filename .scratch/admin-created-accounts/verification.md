# Verification

Status: implementation and self-tests complete; user accepted and authorized commit/push.

## Go (template/api), on Centaurus with an isolated PostgreSQL 18 and all 13 migrations

- Migration 13 applies, rolls back and reapplies cleanly.
- `go vet ./...` clean; `go test -p 1 ./...` with `TEST_POSTGRES_DSN`, `TEMVIA_REQUIRED_INTEGRATION=1`, `E2E_EMAIL_TASKS=1`: 183 passed, 0 failed, 0 skipped.
- New: `TestStoreIntegrationAdminCreatedAccounts` (creation with roles and flag, email taken by an account or a pending invitation, scope for non-Super-Admin actors, users.write required, password change clears the flag), `TestAuthenticationHoldsAnAccountThatMustChangeItsPassword`, `TestCreateUserChecksTheActorAndThePassword`, `TestCreateUserOverHTTP` (201, password never echoed, default requirement, shared account, weak password 422, reader 403, missing origin 403, `Allow: GET, POST`), `TestAccountOnItsInitialPasswordOnlyReachesTheChange` (me and session-status allowed, other APIs 403 `password_change_required`, logout allowed).
- `TestOperationLogRecordingStatusLifecycleAndSafeDiagnostics` failed once locally and passed on three reruns: a pre-existing timing flake.

## Admin (template/admin)

- `vite build`, `tsc -b`: clean. Vitest: 147 passed. Lint: 0 errors; the 6 warnings are in files this change does not touch.
- New `admin-created-accounts.test.tsx`: generated passwords always meet the rules; the dialog creates an account with a generated password, shows it once and requires the change by default; the users list marks accounts still on the initial password; the forced change form checks the confirmation and submits.

## Browser (Bind Plane sandbox, the same code ported)

- Found and fixed: `/_authenticated` checked the session in its loader, but page loaders run in parallel with it, so the home page's own requests met `password_change_required` first and the session error page showed. The check now runs in `beforeLoad`; the loader returns the user from context.
- Walked through in Chrome: the admin created an Operator account (generated password, change required, shown once); the list marked it 待改密码; signing in as it and opening any page led to 设置自己的密码, while the API refused other requests with 403; changing the password returned to sign-in; the new password signed in to the home page; the mark was gone; the account was deleted. The operation history recorded each step and neither password.

## Template package

- `pnpm test` (CLI, acceptance helpers): 40 passed after adding the new files to `tests/react-ts-baseline.mjs`.
