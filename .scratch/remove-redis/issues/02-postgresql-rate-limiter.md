# PostgreSQL existing limiter complete path

Parent spec: `.scratch/remove-redis/spec.md`

Status: resolved
Triage: ready-for-agent
Blocked by: none

## Scope

Replace only the existing login and password-reset request limiter storage with PostgreSQL. Preserve every current quota, refill rule, namespace boundary, email normalization rule, successful-login email-bucket reset, business-flow placement, error mapping, and cleanup behavior. Use short transactions and a fixed lock order so the global and per-email buckets are checked and consumed atomically without over-issuing tokens under concurrency.

Keep limiter identifiers free of unnecessary plaintext email data. Preserve bounded database-operation timeouts and distinguish quota exhaustion (existing 429 problem response) from database failure (existing 503 dependency response). Do not add IP/user dimensions, alter quotas, add Retry-After, or put password hashing/mail delivery in the limiter transaction.

## Acceptance

- [x] Login global bucket remains capacity 10 with one token refilled every 6 seconds.
- [x] Login per-email bucket remains capacity 5 with one token refilled every minute.
- [x] Password-reset global bucket remains capacity 10 with one token refilled every 6 seconds.
- [x] Password-reset per-email bucket remains capacity 3 with one token refilled every 20 minutes.
- [x] Login and password-reset namespaces remain independent; different emails share only their namespace global bucket.
- [x] A successful login resets only the normalized login email bucket as before.
- [x] A request consumes both buckets only when both allow it; denied requests do not partially consume a bucket.
- [x] First-use creation, refill, expiration/cleanup races, and concurrent requests are atomic and do not over-issue tokens.
- [x] Limiter database failures map to 503, quota exhaustion remains 429, and cleanup cannot prematurely restore quota.
- [x] Real-PostgreSQL tests cover quotas, refill, namespace isolation, success reset, dual-bucket atomicity, creation/cleanup races, and controlled concurrency or a small load validation.
- [x] No Redis limiter implementation remains in the active path after this ticket.

## Verification notes

Record exact test commands, PostgreSQL environment, concurrency/load settings, and any unavailable integration coverage in the comments when resolving.

## Comments

Resolved with PostgreSQL token-bucket rows, fixed global-then-email locking, transactional dual-bucket consumption, digest-only email identifiers, and bounded cleanup.

Verification on disposable PostgreSQL 18.6 (`postgres:18.6-trixie`, migrations 1 through 8):

- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./internal/auth/adapter/postgres -run 'TestStateIntegrationLimiterQuotasAtomicityRefillCleanupAndConcurrency' -count=10`: passed.
- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./... -count=1`: passed.
- `go vet ./...`: passed.
- `go test -race -p 1 ./internal/auth/adapter/postgres ./internal/auth/adapter/httpapi -run 'Integration$' -count=1`: passed.

The controlled limiter experiment used 20 concurrent requests and a five-token global bucket; exactly five requests were allowed with no errors. No unresolved ticket-specific limitation.

Continuation verification (fresh implementation invocation, 2026-09-09):

- Environment: macOS arm64, Go 1.26.5, Docker PostgreSQL `postgres:18.6-trixie`, migration image `migrate/migrate:v4.19.1`. The disposable database used `127.0.0.1:55433`, database/user `temvia`, and the non-production fixture password `temvia-test`; the container was removed after verification.
- Reproduction setup: `docker run -d --name temvia-continuation-postgres -e POSTGRES_DB=temvia -e POSTGRES_USER=temvia -e POSTGRES_PASSWORD=temvia-test -p 127.0.0.1:55433:5432 postgres:18.6-trixie`; wait for `docker exec temvia-continuation-postgres pg_isready -U temvia -d temvia`; then `docker run --rm --network host -v "$PWD/template/api/migrations:/migrations:ro" migrate/migrate:v4.19.1 -path=/migrations -database 'postgres://temvia:temvia-test@127.0.0.1:55433/temvia?sslmode=disable' up`.
- From `template/api`: `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55433/temvia?sslmode=disable' go test -p 1 ./... -count=1`, the same command with `go test -race -p 1 ./... -count=1`, and `go vet ./...` all passed. On the retained disposable review database at port `55432`, `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./internal/auth/adapter/postgres -run 'TestStateIntegrationTouch|TestStateIntegrationLimiterSerializes' -count=10` also passed.
- The deterministic limiter interleavings covered here are `TestStateIntegrationLimiterSerializesCreationWithResetAndCleanup`: the global row is held while `ResetEmail` or expired-bucket cleanup runs, and the waiting `Allow` completes without a spurious error and leaves one email bucket.

Review repair round 1 (R1, attempt 1): `ensureRateLimitBucket` now uses an intentional no-op `ON CONFLICT DO UPDATE ... RETURNING` so existing buckets are locked as part of creation/lookup. The limiter now acquires the global bucket before the email bucket and retains both locks through refill, decision, and update; reset and batched cleanup therefore serialize safely with consumption and can only delete before a later upsert or after the transaction commits. Added deterministic PostgreSQL interleavings that hold the global row, wait for `Allow`, then run `ResetEmail` or delete the unlocked expired email bucket before releasing the holder; both cases verify no spurious limiter error and a single recreated bucket.

Repair verification used disposable `postgres:18.6-trixie` in Docker (`temvia-review-postgres`, `127.0.0.1:55432`, database/user `temvia`, password `temvia-test`) with migrations 1 through 8 applied by `migrate/migrate:v4.19.1`. Reproduction setup:

- `docker run -d --name temvia-review-postgres -e POSTGRES_DB=temvia -e POSTGRES_USER=temvia -e POSTGRES_PASSWORD=temvia-test -p 127.0.0.1:55432:5432 postgres:18.6-trixie`
- `docker run --rm --network host -v "$PWD/template/api/migrations:/migrations:ro" migrate/migrate:v4.19.1 -path=/migrations -database 'postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' up`

Tests:

- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./internal/auth/adapter/postgres -run 'TestStateIntegrationTouch|TestStateIntegrationLimiterSerializes' -count=10`: passed.
- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -race -p 1 ./... -count=1`: passed.
- `TEST_POSTGRES_DSN='postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable' go test -p 1 ./... -count=1` and `go vet ./...`: passed.
- `pnpm check`, `pnpm test`, and `pnpm test:package`: passed.
