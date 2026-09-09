# Graceful shutdown review

Baseline: b5be7324e78c5cda3b073cbc926c0f133e598ec0
Spec: spec.md (fixed across both rounds)
Scope: cumulative uncommitted implementation, including new files.

## Round 1

### Standards

No actionable documented-standard violations found. Reviewed project instructions, local issue conventions and relevant code-smell heuristics; no unrelated domain glossary or rate-limit changes.

### Spec

- R1: Consuming the one-shot join result before entering the timeout branch could lead to waiting for it again, exhausting the total budget and skipping dependency cleanup.
- R2: The forced-close branch could start dependency closure before the HTTP Close operation completed.
- R3: The second-signal subprocess test only checked nonzero status, so waiting until the ordinary deadline could incorrectly pass. It also lacked bounded waiting and a single-signal timeout subprocess case.

All three returned to a fresh Luna implementation session for fix attempt 1.

## Round 2

### Standards

Pass: no remaining actionable findings.

### Spec

Pass: R1 now retains consumed join state; R2 waits for forced close and worker join within the remaining total deadline; R3 uses first-signal event synchronization, bounded subprocess waiting, expected exit codes and elapsed-time checks, including a single-signal timeout case. No remaining actionable findings in the cumulative implementation.

Fix counts: R1=1, R2=1, R3=1. No direct repair needed.

## Verification

Implementation agent reported passing Go race tests and vet, pnpm check/test/test:git/test:package and Compose override validation after repairs. First implementation also reported PostgreSQL 18.6 integration tests passing with package serialization (-p 1), necessary for tests sharing a database, and a real API health/SIGTERM smoke test.

Parent independently ran git diff --check and go test -race ./cmd/server ./internal/auth/application ./internal/config successfully after repairs (Go results cached).

No commit created. Ready for user acceptance.
