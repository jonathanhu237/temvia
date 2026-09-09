# PostgreSQL session and online-user complete path

Parent spec: `.scratch/remove-redis/spec.md`

Status: resolved
Triage: ready-for-agent
Blocked by: none

## Scope

Replace the existing session and online-user state path with PostgreSQL while preserving the existing external authentication contract and exact session semantics. Cover schema and migrations, dependency wiring, login, ordinary request touch, no-touch/background checks, logout, authentication-version revocation, password-reset invalidation, online-user reads, batched cleanup, and the required API/storage concurrency behavior.

Do not change cookie or token contracts, timeout defaults, renewal precision, authorization behavior, pagination, or unrelated business workflows. Database errors must remain distinguishable from unauthenticated requests: return the existing 503 dependency failure, preserve the login cookie, and never authorize a protected operation on an indeterminate session.

## Acceptance

- [x] Session records persist token digests, user association, authentication version, activity timestamp, idle expiry, and absolute expiry with suitable indexes.
- [x] Login creates a usable session; normal requests touch it with the existing renewal rules; background/session-status checks do not touch it.
- [x] Idle and absolute expiry are checked during authentication, including records not yet reclaimed by cleanup.
- [x] Logout, force sign out, and password reset invalidate sessions according to the existing authentication-version semantics; concurrent logout and renewal cannot revive a session.
- [x] Online-user results include only users with at least one unexpired, authentication-version-valid session, retain existing deduplication/activity/authorization/pagination behavior, and do not renew sessions.
- [x] Valid sessions survive application/database restart; cleanup is batched, cancellable, and cannot affect validity decisions or extend sessions.
- [x] Temporary database failures map to 503 without clearing the browser credential or treating the session as a confirmed 401.
- [x] HTTP/API and real-PostgreSQL tests cover the complete path, expiry boundaries, no-touch behavior, revocation, restart reconstruction, online users, cleanup, and session concurrency.
- [x] No Redis session/online-user implementation remains in the active path after this ticket.

## Verification notes

Record exact test commands, PostgreSQL environment, and any unavailable integration coverage in the comments when resolving.

## Comments

Resolved after migrating the session/online-user path to PostgreSQL, wiring the API and password reset flows to the shared PostgreSQL store, and adding request-time validity plus batched cleanup.

Verification on disposable PostgreSQL 18.6 (`postgres:18.6-trixie`, migrations 1 through 8):

- `docker run ... postgres:18.6-trixie` and the migration image `up`: passed.
- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./... -count=1`: passed.
- The PostgreSQL and HTTP integration packages ran with the same DSN and passed, including no-touch, force sign-out, logout, restart reconstruction, expiry, cleanup, and concurrent stale-session coverage.
- `go vet ./...`: passed.
- `go test -race -p 1 ./internal/auth/adapter/postgres ./internal/auth/adapter/httpapi -run 'Integration$' -count=1`: passed.

No unresolved ticket-specific limitation; browser/UI end-to-end testing remains outside this ticket's backend boundary.

Continuation verification (fresh implementation invocation, 2026-09-09):

- Environment: macOS arm64, Go 1.26.5, Docker PostgreSQL `postgres:18.6-trixie`, migration image `migrate/migrate:v4.19.1`. The disposable database used `127.0.0.1:55433`, database/user `temvia`, and the non-production fixture password `temvia-test`; the container was removed after verification.
- Reproduction setup: `docker run -d --name temvia-continuation-postgres -e POSTGRES_DB=temvia -e POSTGRES_USER=temvia -e POSTGRES_PASSWORD=temvia-test -p 127.0.0.1:55433:5432 postgres:18.6-trixie`; wait for `docker exec temvia-continuation-postgres pg_isready -U temvia -d temvia`; then `docker run --rm --network host -v "$PWD/template/api/migrations:/migrations:ro" migrate/migrate:v4.19.1 -path=/migrations -database 'postgres://temvia:temvia-test@127.0.0.1:55433/temvia?sslmode=disable' up`.
- From `template/api`: `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55433/temvia?sslmode=disable' go test -p 1 ./... -count=1`, the same command with `go test -race -p 1 ./... -count=1`, and `go vet ./...` all passed. On the retained disposable review database at port `55432`, `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./internal/auth/adapter/postgres -run 'TestStateIntegrationTouch|TestStateIntegrationLimiterSerializes' -count=10` also passed.

Review repair round 1 (R2, attempt 1): `ResolveAndTouchVersioned` now starts a bounded transaction, locks the session row before sampling `clock_timestamp()`, validates both deadlines against that post-lock time, and renews with the exact millisecond timeout while preserving monotonic activity timestamps. Added deterministic PostgreSQL integration coverage that holds the row lock across idle and absolute deadlines, plus a queued-update case that would regress `last_seen_at` with a pre-lock clock sample.

Repair verification used disposable `postgres:18.6-trixie` in Docker (`temvia-review-postgres`, `127.0.0.1:55432`, database/user `temvia`, password `temvia-test`) with migrations 1 through 8 applied by `migrate/migrate:v4.19.1`. Reproduction setup:

- `docker run -d --name temvia-review-postgres -e POSTGRES_DB=temvia -e POSTGRES_USER=temvia -e POSTGRES_PASSWORD=temvia-test -p 127.0.0.1:55432:5432 postgres:18.6-trixie`
- `docker run --rm --network host -v "$PWD/template/api/migrations:/migrations:ro" migrate/migrate:v4.19.1 -path=/migrations -database 'postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' up`

Tests:

- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./internal/auth/adapter/postgres -run 'TestStateIntegrationTouch|TestStateIntegrationLimiterSerializes' -count=10`: passed.
- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -race -p 1 ./... -count=1`: passed.
- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./... -count=1` and `go vet ./...`: passed.
