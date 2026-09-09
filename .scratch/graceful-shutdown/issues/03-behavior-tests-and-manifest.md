# Graceful shutdown behavior coverage and generated-project synchronization

Parent spec: `.scratch/graceful-shutdown/spec.md`

Status: resolved
Triage: ready-for-agent
Blocked by: 01, 02

## Scope

Add behavior-oriented coverage at the service/process, real HTTP, mail dispatcher, configuration, and generator boundaries. Synchronize any generated-file inventory and current generated-project documentation required by the implementation.

## Acceptance

- [x] Tests cover real HTTP admission/drain, common budget and reserve behavior, signal exit codes, second-signal termination, mail cancellation/claim boundaries, background cancellation/join, and dependency availability/close ordering.
- [x] Existing mail/config/generator tests are reused or extended without private call-count assertions.
- [x] Generated files and documentation are complete and package/generator regression tests pass.
- [x] Exact verification commands and any environment limits are recorded when resolving.

## Comments

Tickets 01 and 02 are resolved. Added real HTTP lifecycle tests, signal subprocess tests, timeout/abnormal-server coverage, shared reserve/config assertions, mail deadline coverage, and generator/Compose regression assertions. Added `api/cmd/server/shutdown.go` and `shutdown_test.go` to both generator inventories.

Verification: `pnpm check`, `pnpm test`, `pnpm test:git`, `pnpm test:package`, `go test -p 1 ./...`, and `go vet ./...` passed. PostgreSQL-backed integration coverage ran with `TEST_POSTGRES_DSN=postgres://temvia:temvia-test@127.0.0.1:55432/temvia?sslmode=disable` against disposable PostgreSQL 18.6 and passed serially (`-p 1`).

Attempt 1 review fix (R3): synchronized subprocess signals on an explicit first-shutdown event, replaced the fixed sleep and unbounded `cmd.Wait` with bounded waits and cleanup, asserted the exact second-SIGTERM exit status and prompt termination under a long budget, and added a single-signal timeout subprocess case.

Verification: `pnpm check`, `pnpm test`, `pnpm test:git`, `pnpm test:package`, `cd template/api && go test ./...`, `cd template/api && go test -race ./...`, `cd template/api && go vet ./...`, and Compose interpolation with required placeholder secrets plus `SHUTDOWN_TIMEOUT=7s` all passed.
