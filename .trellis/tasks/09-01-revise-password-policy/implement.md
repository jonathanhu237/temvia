# Implementation plan

## 1. Separate backend creation and login validation

- Add one shared NFC/input-boundary helper in the auth domain.
- Keep `NewPassword` as the new-password constructor and enforce 8-128 code
  points plus all four explicit ASCII classes.
- Add `NewLoginPassword` for non-empty, at-most-128 legacy-compatible login
  input and return `invalid_login_password` on failure.
- Switch only `Authentication.Login` to the login constructor; keep setup on
  the creation constructor.
- Extend domain and application tests for 7/8/128/129 boundaries, every missing
  class, Unicode non-substitution, normalization, and legacy login.

## 2. Mirror the contract in the admin

- Split the current shared frontend password validator into creation and login
  validators while keeping one normalization helper.
- Implement the same explicit ASCII code-point ranges as Go.
- Keep setup confirmation comparison after NFC normalization.
- Add `invalid_login_password` to the shared field-code mapping and typed
  English/Simplified Chinese resources; update setup policy copy.
- Extend schema, problem mapping, and rendered form tests, including assertions
  that raw codes never appear and ARIA associations remain intact.

## 3. Preserve cross-layer contracts

- Update the backend authentication/error specs and frontend component contract
  with the creation-versus-login distinction and exact class ranges.
- Check all occurrences of the old 15-128 copy and boundary fixtures so the
  template, tests, and independent generator inventory do not drift.
- Do not alter Argon2id, the database schema, sessions, rate limiting, request
  shapes, or `.env.example`.

## 4. Verification

- API: `go test ./...`, `go vet ./...`, and `go test -race ./...` in the
  generated module.
- Admin: `pnpm lint`, `pnpm check`, `pnpm test`, and `pnpm build`.
- Root: `pnpm check`, `pnpm test`, `pnpm test:git`, and `pnpm test:package`.
- Pack the actual CLI, generate a disposable project, sync it one-way to
  Centaurus, build the images, migrate a fresh PostgreSQL database, and exercise
  setup/login over real HTTP.
- Runtime cases: accept a valid eight-character four-class setup password;
  reject each missing class and boundary violation with localized field errors;
  prove a legacy lowercase passphrase reaches successful Argon2id login.

## Review and rollback points

- Review the Go/TypeScript class tables side by side before tests.
- Review login separately from setup to catch accidental policy reuse.
- A rollback must preserve the new legacy-compatible login constructor even if
  the creation policy is reverted.
