# Verification

Verified on 2026-09-01.

## Review

- Independent Trellis check reported no unresolved findings.
- Go and TypeScript use the same four explicit ASCII code-point ranges.
- Setup uses the new-password constructor/schema; login uses the separate
  legacy-compatible constructor/schema.
- Creation and login input failures use distinct stable field codes and typed
  English/Simplified Chinese resources.
- No Argon2id, database, session, rate-limit, request-shape, or environment
  contract changed.

## Automated checks

All checks passed.

- Local API: `go test ./...`, `go vet ./...`, and auth race tests.
- Local admin: lint, type-check, 36 Vitest tests, and production build.
- Local root generator: type-check, 12 CLI tests, 5 Git tests, and 2 package
  tests using an actual npm tarball.
- Generated API on Centaurus using `golang:1.27-trixie`: `go test ./...`,
  `go vet ./...`, and `go test -race ./...`.
- Generated admin on Centaurus using Node 24.20.0 and pnpm 11.24.0: install,
  lint, type-check, 36 Vitest tests, and production build.
- Both API and admin container images built successfully.
- Trellis context validation and `git diff --check` passed.

## Runtime upgrade compatibility

The old API created an administrator with the legacy password
`correct horse battery`. The API image was then rebuilt from the new packed
template without replacing PostgreSQL. The same legacy credential logged in
successfully through the upgraded API, proving that the creation policy is not
incorrectly applied during login.

## Runtime new-policy behavior

Against a fresh migrated database, the real HTTP API rejected all of these
with `422` and `/password: invalid_password`:

- seven code points;
- missing ASCII uppercase, lowercase, digit, or punctuation;
- non-ASCII letter, digit, or punctuation used as a substitute for a required
  ASCII class.

An empty login password returned `422` with
`/password: invalid_login_password`. Playwright then created the first
administrator with `Admin1!x`, signed in, restored the session after reload,
changed locale, passed axe checks, and logged out.

The targeted Chinese browser check confirmed the localized policy message,
the `aria-describedby` relationship, and the absence of raw validation codes.

Evidence: [password-policy-chinese.png](evidence/password-policy-chinese.png)
