# Forgot password flow implementation plan

Status: approved for implementation on 2026-09-01.

## Delivery strategy

Implement one end-to-end milestone in dependency order. Keep each checkpoint
green before moving outward from durable backend contracts to the admin UI and
finally the packed/generated application. Do not introduce a message broker,
generic event bus, ORM, migration-at-startup behavior, or a second deployable
worker.

## 1. Freeze contracts and migration

- [x] Re-read the curated backend/frontend/spec/research context and the final
  `prd.md`/`design.md`; stop and return to planning if implementation requires
  changing a user-owned decision.
- [x] Add matched `000002_password_recovery.up.sql` and `.down.sql` migrations:
  `auth_users.auth_version`, `auth_password_resets`,
  `auth_mail_outbox`, checks, indexes, foreign keys, and rollback order.
- [x] Advance `ExpectedMigrationVersion` to 2 and update the independent
  schema-version/migration-filename tests without rewriting `000001_auth`.
- [x] Add PostgreSQL integration coverage for migration up/down, exact version
  readiness, constraints, expiry, one-current-reset state, and preservation of
  existing setup/user data.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/adapter/postgres ./internal/config ./cmd/server
go vet ./...
```

## 2. Extend domain, configuration, and ports

- [x] Reuse the existing canonical Base64URL, email, password, random-source,
  dependency-error, and strict-validation rules; extract shared helpers only
  where setup/reset would otherwise duplicate non-trivial logic.
- [x] Add the supported mail locale and reset-token derivation/digest types
  without allowing raw credentials into printable structs or errors.
- [x] Extend account/session domain projections with `auth_version` while
  keeping the public user JSON unchanged.
- [x] Add narrow application ports for scheduling/preflighting/completing a
  reset, claiming/acking/retrying outbox work, sending typed recovery mail,
  reset rate limiting, and versioned session state.
- [x] Add and validate the complete reset, outbox-dispatch, and SMTP environment
  inventory. Enforce canonical 32-byte token-key encoding, paired credentials,
  bounded durations/capacities, supported TLS modes, and no plaintext SMTP in
  production.
- [x] Add table-driven configuration/domain tests including redaction and
  development-versus-production TLS behavior.

Checkpoint:

```sh
cd template/api
go test ./internal/config ./internal/auth/domain ./internal/auth/application
```

## 3. Implement password recovery transactions

- [x] Add the recovery-request use case: validate email/locale, evaluate both
  reset buckets, generate selector/verifier/digest material for every valid
  request, call a store operation that never reports account existence, and
  enforce the minimum response duration before generic success.
- [x] Implement the PostgreSQL request transaction so a known account gets one
  current reset row plus one matching outbox job atomically, while an unknown
  account produces no durable state and no public branch.
- [x] Add reset preflight before Argon2id work and a completion transaction that
  revalidates under lock, updates the hash, increments `auth_version`,
  consumes reset authority, removes obsolete reset-mail jobs, and inserts the
  localized password-changed notification atomically.
- [x] Cover replacement, expiry, replay, concurrent completion, unknown email,
  validation, dependency errors, hash-capacity failure, transaction rollback,
  change timestamp, and absence of raw credential/password data.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/application ./internal/auth/adapter/postgres
go test -race ./internal/auth/application
```

## 4. Generalize Redis limiting and version sessions

- [x] Refactor the existing two-bucket Lua implementation so login and password
  recovery share one tested mechanism with different key namespaces and
  policies; preserve login behavior byte-for-byte.
- [x] Add reset global/email buckets with hashed email keys, finite TTL, strict
  configuration, no success reset, and identical known/unknown behavior.
- [x] Store `auth_version` in new sessions and return it on resolve/touch.
  Update current-session authorization to compare it with PostgreSQL and reject
  stale versions; best-effort cleanup must not turn an authoritative mismatch
  into an availability error.
- [x] Update unit/integration tests for script atomicity, TTL, namespace
  separation, version mismatch, login compatibility, Redis restart, and the
  login/reset race boundary.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/adapter/redis ./internal/auth/application
go test -race ./internal/auth/adapter/redis ./internal/auth/application
```

## 5. Implement outbox dispatch and SMTP

- [x] Pin a reviewed `github.com/wneessen/go-mail` release at or above `v0.8.1`
  and update `go.sum`; do not use the frozen standard-library `net/smtp` API.
  Review the expected `x/crypto`/`x/text` module-selection upgrades explicitly
  and rerun Argon2id and Unicode normalization coverage after `go mod tidy`.
- [x] Implement PostgreSQL claim/lease/ack/retry/discard/cleanup operations with
  database time, bounded batches, `FOR UPDATE SKIP LOCKED`, and lease-token
  ownership. Keep raw SMTP text out of state, retain sent/canceled rows for 7
  days and dead rows for 30 days, and send outside database transactions.
- [x] Implement the dispatcher loop with one bounded active send, exponential
  full-jitter backoff, SMTP `4yz` retry versus typed `5yz` dead-letter handling,
  expiry, stale reset/digest rejection, context cancellation, and a graceful
  shutdown/drain path. Reuse the job ID as a deterministic Message-ID and
  explicitly tolerate at-least-once duplicates.
- [x] Implement structured SMTP delivery for plaintext/starttls/implicit-TLS,
  optional paired authentication, context deadline, fixed localized text+HTML
  templates, safe address APIs, and no SMTP protocol debug logging.
- [x] Ensure reset mail derives the verifier from selector/key and verifies the
  stored digest before constructing
  `${APP_PUBLIC_URL}/reset-password#token=v1.<selector>.<verifier>`.
  Ensure password-changed mail contains the database change time but no secret.
- [x] Add fake-store/fake-mailer dispatcher tests, SMTP adapter unit tests, and
  PostgreSQL multi-consumer/retry/lease-expiry integration tests.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/application ./internal/auth/adapter/postgres ./internal/auth/adapter/mail
go vet ./...
go test -race ./internal/auth/...
```

## 6. Add HTTP contracts and composition-root lifecycle

- [x] Add request/complete interfaces and routes, known-method entries, strict
  field allowlists, stable success bodies, no-store behavior, and Origin-first
  enforcement. Successful completion clears any presented session cookie and
  never creates a replacement session.
- [x] Add `ErrInvalidPasswordResetToken` and its stable `403` Problem Details
  mapping; preserve all existing error priorities and login/setup mappings.
- [x] Wire recovery, the versioned session store, SMTP adapter, outbox store,
  and dispatcher through explicit constructors in `cmd/server`.
- [x] Start dispatch only after schema readiness, keep SMTP outage non-fatal,
  and stop dispatch within the server shutdown budget without logging recipient
  addresses, selectors, verifiers, tokens, passwords, SMTP credentials, or
  message bodies.
- [x] Extend HTTP/composition tests for exact status/body/content type, known
  versus unknown equivalence, strict JSON/media/size handling, Origin
  precedence, invalid token, no cookie on completion, 404/405, and shutdown.

Checkpoint:

```sh
cd template/api
go test ./...
go vet ./...
go test -race ./...
```

## 7. Add admin recovery UI

- [x] Extend Zod contracts and the shared Fetch client for accepted-reset and
  reset-completion responses; UI components must not call `fetch` directly.
- [x] Extract one shared canonical fragment-token parser, preserve the setup
  authority lifecycle, and add password-reset authority capture before React
  mounts. Clear fragments immediately and keep authority in module memory only.
- [x] Add `/forgot-password` and `/reset-password` file routes plus feature-owned
  request/reset forms using existing `AuthPage`, field, alert, mutation,
  translation, focus, and accessibility patterns.
- [x] Add the login-page recovery link, generic accepted state, invalid/expired
  link state, password confirmation, reset success state, explicit login CTA,
  and no automatic QueryClient authentication.
- [x] Add English and Simplified Chinese UI/email-facing problem copy and pass
  the active locale to both API calls. Add `no-referrer` defense in depth.
- [x] Regenerate `routeTree.gen.ts` through the TanStack Router plugin rather
  than editing it manually.
- [x] Extend schema, API client, problem translation, authority-capture, form,
  route, i18n, and accessibility tests.

Checkpoint:

```sh
cd template/admin
pnpm lint
pnpm check
pnpm test
pnpm build
```

## 8. Synchronize deployment, docs, and template inventories

- [x] Add pinned `axllent/mailpit:v1.31.0` under a development Compose profile,
  loopback SMTP/UI port mappings, and no API startup dependency on SMTP.
- [x] Update `.env.example`, Compose API environment, Make targets, API/admin
  README files, and root generated README as one complete configuration and
  operator contract. Document token-key generation, TLS modes, Mailpit UI,
  retry/duplicate semantics, rotation behavior, and migration order.
- [x] Register every new template file in `src/generate.ts` required-file
  preflight and the independent `tests/react-ts-baseline.mjs` inventory. Search
  for every old migration-version and auth-route inventory before changing it.
- [x] Keep source, npm tarball, installed package, and generated output bytes in
  sync; keep generated projects free of local lockfiles, secrets, Mailpit data,
  and test artifacts.

Checkpoint:

```sh
pnpm test
pnpm build
```

## 9. Real-stack and generated-project verification

- [x] Locally run cheap root/API/admin checks and migration syntax/readiness
  checks first. Do not run the resource-intensive full stack locally without
  user permission.
- [x] Rsync the local repository one-way to Centaurus, then build/run PostgreSQL
  18, Redis 8, Mailpit, API, migration, admin, and Caddy there. Forward API,
  admin, and Mailpit UI ports to the local machine for validation.
- [x] Exercise migration up/down on disposable state and verify API exact-schema
  startup behavior for version 1, dirty, version 2, and ahead states.
- [x] Pack the actual CLI, install without dev dependencies, generate with a
  non-seed Go module path, compare every template byte, and run Go/admin checks
  in that generated project.
- [x] Run Playwright Chromium against the forwarded Caddy origin and Mailpit API:
  setup, login, request reset, inspect localized reset email, prove the fragment
  is cleared and not persisted, reset the password, prove the old session and
  password fail, sign in with the new password, inspect the change notice, and
  run axe/responsive smoke checks.
- [x] Simulate SMTP outage/recovery and API interruption after SMTP acceptance;
  prove durable retry, lease recovery, safe duplicate content, expiry cleanup,
  and absence of credentials in PostgreSQL/Redis/log output.

Full gates:

```sh
pnpm test
pnpm build
cd template/api && go test ./... && go vet ./... && go test -race ./...
cd ../admin && pnpm lint && pnpm check && pnpm test && pnpm build && pnpm test:e2e
```

Container and generated-project commands must follow the existing Centaurus
workflow and exact forwarded origins rather than inventing a second local
runtime path.

## 10. Specification and completion work

- [x] Update backend authentication, database, error, logging, quality, and
  scaffolding contracts with verified endpoints, tables, ports, environment,
  reset/outbox/session invariants, failure matrix, and test obligations.
- [x] Update frontend directory/hook/type/quality/component contracts only where
  the implementation establishes stable reusable behavior.
- [x] Run the Trellis quality check, resolve every verified finding, and rerun
  the last-iteration full-scope gates.
- [x] Review `git diff` for unrelated changes and secret/token leakage.
- [x] Commit locally with Conventional Commits after the user-visible behavior,
  specifications, task artifacts, and journal are ready.

## Risk and rollback checkpoints

| Area | Main risk | Verification / rollback point |
| --- | --- | --- |
| Migration 2 | Ahead/behind schema or lossy down order | Disposable up/down plus exact-version startup before later layers |
| Enumeration resistance | Known account takes a different public path | Port shape, byte-equal response tests, minimum-duration tests, no request-path SMTP |
| Reset authority | Raw/derivable verifier leaks or replay works | Database/log scans, selector/digest separation, expiry/replay/concurrency tests |
| Outbox | Lost job, stuck lease, unbounded table, duplicates | Atomicity, lease expiry, retry/cleanup and interruption tests |
| SMTP | Plaintext production transport or header injection | Config rejection, structured address APIs, TLS integration tests |
| Session invalidation | Old session remains authorized | Password-version unit/integration/browser flow |
| Frontend authority | Fragment enters browser storage/history | Pre-render capture tests and Playwright storage/history evidence |
| Template packaging | Source works but generated project omits files | Dual inventory plus actual pack/install/generate byte checks |

If implementation reveals a need for a message broker, separate worker
deployment, raw-token persistence, auto-login, email verification, or general
user management, stop and return to planning instead of widening the task.

## Pre-start review gate

- `prd.md`, `design.md`, and this checklist contain no unresolved product
  decision or contradictory acceptance behavior.
- `implement.jsonl` and `check.jsonl` contain real curated spec/research entries.
- `task.py validate` succeeds.
- The user reviews the final planning summary and explicitly approves
  implementation in a subsequent message before `task.py start` is run.
