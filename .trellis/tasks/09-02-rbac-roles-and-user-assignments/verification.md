# RBAC roles and user assignments verification

Verified on 2026-09-02 against branch `feat/rbac-roles`.

## Result

PASS. The implementation satisfies AC01–AC07. No critical or warning findings
remain after two implementation/review cycles and a final full quality gate.

## Local quality gate

- `template/api`: `gofmt -d .`, `go test ./...`, `go vet ./...`, and
  `go test -race ./...` passed.
- `template/admin`: `pnpm lint`, `pnpm check`, `pnpm test`, and `pnpm build`
  passed; Vitest reported 11 files and 58 tests.
- root: `pnpm check`, `pnpm build`, `pnpm test`, `pnpm test:git`, and
  `pnpm test:package` passed; the CLI suite reported 12 tests, Git suite 5,
  and packed-artifact suite 2.
- `bash -n research/centaurus-rbac-smoke.sh` and `git diff --check` passed.

## Generated project and Centaurus

- Packed the actual npm artifact, installed it without development
  dependencies, and generated a disposable project using the non-seed module
  `example.com/rbac/verified/api`.
- One-way synchronized the local source/generated project to Centaurus.
- On Centaurus, the root package, generated Go API, and generated admin passed
  their checks. The Go API also passed `go test -race ./...` against real
  PostgreSQL 18 and Redis services.
- Migration 3 applied, rolled back to version 2, and reapplied. The version-2
  schema was rejected by the version-3 API. API, admin, and migration container
  images built successfully.
- Caddy, API, and Mailpit were forwarded to local ports and answered through
  `http://127.0.0.1:55173`, `http://127.0.0.1:58080`, and
  `http://127.0.0.1:58025` during validation.
- The existing real Chromium authentication suite passed 4 scenarios with 1
  conditionally skipped scenario, covering setup, login/session restoration,
  locale, logout, password recovery, and Mailpit delivery.

## RBAC real-stack acceptance

The repeatable `research/centaurus-rbac-smoke.sh` flow passed against the live
container stack and two distinct activated users. It proved:

1. Super Admin can create a custom role with `users.read` and `roles.read`.
2. Invitation mail is delivered through Mailpit, its one-time fragment token
   activates a user, and activation creates no implicit session.
3. The invited user can use both read routes but receives `403` for mutation.
4. Removing `roles.read` increments the affected user's auth version; the old
   session receives `401`, and a new session can read users but receives `403`
   for roles.
5. Deleting the assigned custom role returns `409` without detaching users.
6. Removing the sole Super Admin returns `409`.
7. After assigning Super Admin to the second activated user, removing it from
   the original setup user succeeds and the new holder resolves with
   `superAdmin: true`.

The temporary Centaurus containers, network, PostgreSQL test volume, generated
project, credentials, and validation directories were removed after evidence
was collected; they are intentionally not recoverable.

## Review fixes incorporated

- Effective authority is derived only from persisted role permissions; a
  principal response cannot inject permissions.
- Stale role/user conflict recovery reloads server state before retrying.
- PostgreSQL query iteration checks `rows.Err()` and Super Admin mutations use
  a consistent lock order.
- Invitation UI requires explicit role selection and never defaults a new
  account to Super Admin.
- Strict routing, Origin precedence, pagination, Problem Details, localized
  permission labels, generator inventories, and packaged-template bytes are
  covered by the final checks.
