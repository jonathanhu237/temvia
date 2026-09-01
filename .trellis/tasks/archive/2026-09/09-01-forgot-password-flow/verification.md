# Forgot password flow verification

Verified on 2026-09-01 against both the template source and an actual packed,
installed, generated application. The generated stack ran on Centaurus with
PostgreSQL 18, Redis 8, Mailpit, the Go API, the admin UI, and Caddy. API,
admin, and Mailpit ports were forwarded to the local machine for validation.

## Quality gates

- `git diff --check`: passed.
- Template API: `go test ./...` and `go vet ./...`: passed.
- Template API race/integration coverage, including real PostgreSQL and Redis:
  passed.
- Template admin: `pnpm lint`, `pnpm check`, `pnpm test`, and `pnpm build`:
  passed (47 unit/component tests).
- Root generator/package checks: `pnpm check`, `pnpm build`, CLI/Git tests, and
  actual tarball package tests: passed. The final Centaurus package run passed
  2/2 tests after the last SQL and E2E changes.
- Actual package install/generate verification used a non-seed Go module path;
  generated API and admin checks passed.

## Database and runtime gates

- Migration 2 applied successfully; rolling down one migration removed the
  recovery tables and made the API reject schema version 1. Reapplying restored
  version 2 and API health.
- The API rejected both a dirty version-2 schema and an ahead version-3 schema,
  then recovered successfully after restoring clean version 2.
- Real PostgreSQL/Redis adapter tests passed under the race detector.
- Plaintext reset tokens and the old/new test passwords were absent from
  PostgreSQL data, authenticated Redis values, and API/admin logs.

## Browser and delivery gates

- Playwright Chromium passed 5/5 serial scenarios: normal pre-setup login,
  rejected setup authority, setup/login/session/locale/logout, complete password
  recovery, and unauthenticated redirect.
- The recovery scenario proved the reset fragment is captured before React,
  removed from the URL, never persisted or sent in later browser requests, and
  that reset success clears the presented session cookie.
- Two live sessions were created before reset. After completion, the second
  session and the old password failed, while the new password succeeded.
- Mailpit received the localized reset message and the password-changed notice;
  the notice contained the database change time and no password or reset token.
- The redesigned Chinese reset message was delivered through the rebuilt
  generated API and rendered in real Chromium. The 600px table layout, inline
  styling, CTA, expiry block, fallback URL, security warning, and footer were
  all visually intact without external resources.
- With SMTP stopped, the request still returned `202` in approximately 0.5s
  and the outbox row remained `queued`. After SMTP recovered, the same row was
  acknowledged as sent and a matching reset email appeared.
- The post-SMTP/pre-ack crash state was reproduced by leaving an already
  accepted job unacknowledged with an expired lease, then restarting the API.
  The worker reclaimed it, sent the deterministic duplicate, and acknowledged
  it; the two message bodies were byte-identical. This confirms the documented
  at-least-once boundary rather than claiming exactly-once email delivery.

## Completion state

The feature implementation and verification are complete. The user approved
the local Conventional Commit batch; no changes were pushed to a remote.
