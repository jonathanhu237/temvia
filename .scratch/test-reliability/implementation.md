# Implementation evidence

Parent verification is now complete: see `verification.md` for two actual fresh full-gate passes and `review-3.md` for resolved findings. The implementation-session checks below are retained as historical evidence, not the final acceptance result.

Baseline fixed at `a71eb8ce5157be5cbbbfdcfef3929b69a9a7c28e`. The risk matrix is
in `coverage-matrix.md`; this file records implementation and validation without
claiming that a local DSN-less run proves database or browser acceptance.

## Implemented

- Added `scripts/critical-acceptance.mjs`, a canonical fixed-manifest runner that
  consumes the exact tested tarball, creates an isolated generated project and
  Compose project, runs selected PostgreSQL/HTTP integration tests with a real
  DSN (`-race`, `-count=2`, serial package execution), then runs only the stable
  first-run, password-recovery, personal-settings, and Mailpit email-task browser
  flows. The Go tests run before the API/worker starts so fixture cleanup cannot
  race a live dispatcher.
- Extended `scripts/first-run-acceptance.mjs` with strict machine-readable
  Playwright result validation, explicit credentials/ports in the in-memory
  context, optional pre-service/post-first-run hooks, stronger environment
  isolation and diagnostic redaction, timeout/missing-command classification, and
  visible/aggregated Compose and temporary-directory cleanup failures.
- Added negative runner tests in `tests/critical-acceptance.test.mjs` for zero,
  missing, skipped, failed, malformed, timeout, unavailable-dependency, and
  sensitive-diagnostic cases. Existing optional integration skips remain
  available for ordinary local Go tests; `TEMVIA_REQUIRED_INTEGRATION=1` turns a
  missing DSN or required mail toggle into a test failure for the mandatory path.
- Changed every generated PostgreSQL/HTTP integration DSN gate to honor that
  mandatory mode, preserving opt-in skips only for normal self-contained tests.
- Fixed the frontend session-expiry, logout, and account-transition cleanup to
  remove all private `settings` query entries (including static email settings
  and submitted-task status); the query-client regression seeds those entries
  and verifies they cannot survive an unauthenticated response.
- Added `.github/workflows/quality.yml` as a non-publishing PR/source workflow
  and made the release verification use the same critical entry point after the
  existing exact-tarball package test. Existing exact package inventory and
  source/tarball byte protections were not weakened.
- Documented dependencies, scope, isolation, fail-fast conditions, commands,
  and evidence boundaries in the root English/Chinese README and release docs.

## Checks actually run in this implementation session

- `node --check scripts/first-run-acceptance.mjs`
- `node --check scripts/critical-acceptance.mjs`
- `pnpm check` (generator TypeScript)
- TDD regression: temporarily removing the settings-cache eviction made the
  query-client test fail on stale email settings; restoring it made
  `cd template/admin && pnpm exec vitest run src/app/query-client.test.ts` pass (1 passed).
- `gofmt -w` on all modified generated Go test files
- `git diff --check`
- `pnpm test`: 28 passed, 0 failed, 0 skipped (includes the runner negative
  tests and existing CLI/acceptance environment tests).
- `node scripts/critical-acceptance.mjs --help` and
  `node scripts/first-run-acceptance.mjs --help`.
- Missing-tarball smoke: `node scripts/critical-acceptance.mjs /tmp/temvia-no-such-tarball`
  returned status 1 and a redacted, actionable failure.

These are lightweight source/runner checks only. No local Docker, PostgreSQL,
Mailpit, browser installation, Go integration suite, remote synchronization, or
resource-intensive build was run.

## Canonical parent-run command

From the repository root, in a fresh environment with Docker Compose v2, Make,
Node 24, pnpm 11.24.0, Go 1.27, and network access for generated dependencies
and Chromium:

```sh
set -euo pipefail
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm build
pnpm test
pnpm test:git
mkdir -p .release
export TEMVIA_TEST_TARBALL="$PWD/.release/create-temvia-quality.tgz"
pnpm test:package
node scripts/critical-acceptance.mjs "$TEMVIA_TEST_TARBALL"
```

The final command itself owns its `mkdtemp` root, generated consumer/project,
Compose project name, loopback ports, PostgreSQL volume, Mailpit, accounts, and
browser fixtures. It must be run at least twice by the parent with a fresh
owned environment/resource set. It must report actual Go top-level pass events
for all manifest names twice, zero skipped tests, and actual Playwright JSON
pass events for all selected titles. Missing commands/dependencies, invalid
configuration, failed child processes, timeouts, missing/zero/skipped tests, or
cleanup failure must leave a nonzero result. Parent validation must preserve the
full generated error output only after checking it contains no credentials,
security token/link, verification code, or mail body.

## Remaining explicit blind spots

- The mandatory browser set intentionally does not aggregate the opt-in online
  users, system identity, all user-lifecycle browser permutations, or every
  historical auth smoke. Their existing suites remain available and are listed
  as P2/non-gate coverage in the matrix.
- The selected Go worker tests use the existing controlled SMTP/worker adapters;
  the browser path uses real Mailpit. A process-kill exactly between SMTP
  acknowledgement and durable completion is still an at-least-once delivery
  blind spot and is not claimed as covered.
- Parent must provide actual fresh PostgreSQL/Compose/ports and run the heavy
  command; these source-level checks do not establish DB/browser acceptance.
