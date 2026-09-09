# Application graceful shutdown lifecycle

Parent spec: `.scratch/graceful-shutdown/spec.md`

Status: resolved
Triage: ready-for-agent
Blocked by: 01

## Scope

Implement the service lifecycle around the shared shutdown deadline: first-signal admission stop, parallel in-flight HTTP and claimed-mail draining, cancellable background cleanup with join, dependency close ordering, bounded exceptional-server cleanup, timeout cancellation and forced HTTP connection close, non-zero failure exits, and immediate second-signal termination. Correct mail-dispatch cancellation so the first signal does not abandon already claimed work while no new work is claimed.

## Acceptance

- [x] In-flight HTTP work can complete and new HTTP work is rejected after shutdown begins.
- [x] Claimed mail work drains in parallel under the common deadline; new mail claims stop; outbox results remain observable.
- [x] Background cleanup receives cancellation and is awaited; database and other dependencies stay available until work has ended.
- [x] Normal completion exits early; timeout or server/cleanup failure is bounded, logged with a reason, and exits non-zero.
- [x] A second termination signal exits immediately.

## Comments

Ticket 01 is resolved. Implemented the signal-driven lifecycle, common drain deadline, parallel HTTP/mail/cleanup joining, ordered database close, bounded abnormal-server cleanup, forced HTTP close on timeout, non-zero failure exits, and immediate second-signal termination. The dispatcher now stops claims without detaching active work from the common deadline.

Verification: `go test -race ./...`, `go vet ./...`, the real-HTTP lifecycle tests, and signal subprocess tests passed. A built API process backed by disposable PostgreSQL returned `/health` and exited 0 after SIGTERM with `SHUTDOWN_TIMEOUT=2s`; timeout and abnormal-server behavior are covered by tests.

Attempt 1 review fixes (R1/R2): tracked the one-shot join result and disable its channel after consumption, so a deadline error or late first-select result cannot be awaited again; forced shutdown now waits for both `server.Close` completion and the joined workers before dependency close, bounded by the total deadline. Added deterministic deadline-join and controlled blocked-`Close` ordering regressions.

Verification: `cd template/api && go test ./...`, `cd template/api && go test -race ./...`, and `cd template/api && go vet ./...` passed. The focused lifecycle and subprocess tests also passed repeatedly under race detection.
