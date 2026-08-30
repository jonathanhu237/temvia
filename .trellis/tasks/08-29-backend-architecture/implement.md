# Backend setup and login implementation plan

Status: implemented and verified on 2026-08-30; awaiting user review and the normal commit decision. See `verification.md` for exact local and Centaurus evidence.

## Activation record

- [x] The user reviewed the design decisions throughout the planning conversation and explicitly said “开始实现”.
- [x] `implement.jsonl` and `check.jsonl` contain real validated spec/research paths rather than seed entries.
- [x] `python3 .trellis/scripts/task.py validate .trellis/tasks/08-29-backend-architecture` succeeds.
- [x] The working tree was checked and unrelated/admin work was preserved.
- [x] `task.py start` and `trellis-before-dev` were completed before product edits.

This is one integrated backend milestone. PostgreSQL setup state, Redis authentication behavior, HTTP contracts, container delivery, and generated-template verification must be reviewed together. The deferred React work should be a later task, not a child implementation hidden inside this one.

## Implementation principles

- Keep `template/` as the source of generated application files; do not patch only temporary generated output.
- Keep `template/admin` byte-for-byte unchanged.
- Preserve `GET /health` and the current generator safety contracts.
- Write SQL directly through `database/sql`; do not introduce an ORM, sqlc, native pgx pool, or migration code in the API.
- Keep application ports business-shaped and adapter-specific errors inside adapters.
- Add shared helpers only after actual repetition; do not build a local framework.
- Treat every accepted HTTP response, cookie attribute, Redis key, migration version, and `.env.example` value as a versioned contract with tests.
- Stop and return to planning if implementation requires a user-visible contract or technology change. Small internal corrections that preserve the design may be recorded in `design.md` and explained at review.

## Ordered work

### 1. Preserve generator contracts and establish template inventory

Files likely affected:

- `src/generate.ts`
- `tests/react-ts-baseline.mjs`
- `tests/cli.test.mjs`
- `tests/package.test.mjs`
- `tests/helpers.mjs`
- `template/.npmignore`
- `template/_gitignore`

Work:

1. Extend the explicit required-template inventory for the new root deployment files, API source, migrations, and Dockerfiles.
2. Change source-copy and npm-pack filters to admit exactly `.env.example` while continuing to exclude `.env`, `.env.local`, and other secret-bearing variants.
3. Extend contamination tests so real `.env` files, database files, container state, build output, and dependency directories never enter packed/generated projects.
4. Keep the independent admin baseline oracle unchanged and continue exact-byte verification of all admin files.
5. Update expected generated root inventory without creating a root JavaScript workspace or runtime dependency on Temvia.

Gate:

- TypeScript check/build and generator tests pass before backend behavior is added.
- A deliberately missing `.env.example`, migration, or API source file fails preflight before generation writes anything.

### 2. Add configuration as a fail-fast boundary

Files likely added/affected:

- `template/.env.example`
- `template/api/internal/config/config.go`
- `template/api/internal/config/config_test.go`
- `template/api/cmd/server/main.go`

Work:

1. Define typed configuration for the complete inventory in `design.md`; parse only process environment.
2. Validate `APP_ENV`, canonical `APP_PUBLIC_URL`, duration/integer relationships, PostgreSQL pool bounds, session expiry ordering, Redis memory-limit ordering, and required secrets.
3. Derive production/development cookie properties and exact allowed Origin from validated configuration.
4. Keep fixed protocol/security invariants such as the 64 KiB body limit and Argon2 parameters out of `.env`.
5. Return field-named startup errors without printing secret values or resolved connection strings.
6. Add table-driven tests for default, development, production, missing secret, malformed duration/URL, and cross-field invalid cases.

Gate:

- No database/network client is opened until configuration is valid.
- Empty PostgreSQL or Redis passwords fail startup configuration.
- Production rejects a non-HTTPS public URL; development does not disable authentication or Origin checks.

### 3. Create external migrations and PostgreSQL adapter

Files likely added/affected:

- `template/api/migrations/000001_auth.up.sql`
- `template/api/migrations/000001_auth.down.sql`
- `template/api/internal/auth/domain/*`
- `template/api/internal/auth/application/ports.go`
- `template/api/internal/auth/adapter/postgres/*`
- `template/api/go.mod`
- generated `template/api/go.sum`

Work:

1. Add the `auth_setup` singleton and `auth_users` schema, constraints, canonical-email uniqueness, and reversible down migration.
2. Implement pure Name, Email, and Password normalization/validation first, with boundary-heavy unit tests.
3. Open PostgreSQL through `database/sql` with `pgx/v5/stdlib`; configure only the accepted pool values.
4. Implement a read-only schema check against `schema_migrations`, including missing, dirty, behind, and ahead states. Test the compiled expected version against the migration filenames.
5. Implement coarse setup status and atomic startup token replacement using PostgreSQL time and singleton-row locking.
6. Implement cheap token preflight and one transaction-shaped setup completion operation. Keep hashing outside the transaction and revalidate inside it.
7. Implement account lookup by canonical email and public user lookup by ID with parameterized direct SQL.
8. Map expected PostgreSQL conditions to application errors; wrap unexpected causes for safe server logs without leaking them to HTTP.

Gate:

- PostgreSQL 18 integration tests migrate an empty database up and down.
- Concurrent setup completion creates one administrator only.
- API schema check performs no DDL and refuses every non-exact/dirty schema state.
- SQL statements and transaction paths pass `go test`, `go vet`, and race-relevant concurrency tests where practical.

Rollback boundary:

- If the first migration has not shipped, edit/recreate it while retaining tests.
- Once released, never rewrite the migration; add a forward migration. Do not use an automatic destructive down migration to recover production data.

### 4. Implement the Argon2id adapter and resource guard

Files likely added/affected:

- `template/api/internal/auth/adapter/password/*`
- `template/api/internal/auth/application/setup.go`
- associated tests and `go.mod`/`go.sum`

Work:

1. Implement PHC encode/decode around `golang.org/x/crypto/argon2` with exact algorithm/version/parameter/salt/tag validation before allocation.
2. Use `crypto/rand` for every salt and constant-time tag comparison for verification.
3. Apply one shared immediate-acquisition semaphore to setup hashing and known-account login verification.
4. Keep Unicode/password normalization in the domain/application boundary and pass normalized bytes to the adapter.
5. Test correct/wrong passwords, independent salts, malformed/oversized PHC input, unsupported versions/parameters, semaphore saturation, and cancellation behavior.
6. Add a documented benchmark command for the accepted deployment; do not silently change parameters based on one development machine.

Gate:

- No malformed stored PHC string can request attacker-controlled Argon2 memory/time/parallelism.
- Saturation performs no Argon2 allocation and queues no unbounded work.

### 5. Implement ephemeral Redis sessions and login limiting

Files likely added/affected:

- `template/api/internal/auth/adapter/redis/*`
- `template/api/internal/auth/application/authentication.go`
- associated tests and `go.mod`/`go.sum`

Work:

1. Configure go-redis with required password, operation deadline, and at most one safe retry inside the same deadline.
2. Implement 32-byte session credential generation, strict unpadded Base64URL decoding, and SHA-256-only Redis keys.
3. Implement Redis-time session creation and atomic resolve/touch scripts with idle/absolute expiry and no key resurrection.
4. Implement idempotent deletion that distinguishes acknowledged absence/deletion from uncertain outcomes without exposing existence over HTTP.
5. Implement the atomic dual token bucket with hashed canonical-email key, finite state TTL, generic denial, and success-only email-bucket reset.
6. Test scripts against real Redis 8 for concurrency, TTL, absolute expiry, deletion/touch races, limiter refill, hashed keys, command timeout, and reconnect after outage.
7. Restart Redis with persistence disabled and prove all sessions disappear while PostgreSQL setup/account state remains.

Gate:

- Every created Redis key has finite TTL.
- Redis restart or eviction can only remove authority; it never grants access or reopens setup.
- An unavailable Redis keeps the API process alive, makes auth routes fail closed, and permits PostgreSQL-only setup operations.

### 6. Implement HTTP adapters and exact protocol contracts

Files likely added/affected:

- `template/api/internal/auth/adapter/httpapi/*`
- `template/api/cmd/server/main.go`
- `template/api/cmd/server/main_test.go`

Work:

1. Add method-qualified `http.ServeMux` routes and manual composition without a third-party router or DI container.
2. Implement the bounded strict-object decoder with duplicate/unknown-key rejection and the accepted 400/413/415/422 precedence.
3. Implement centralized Problem Details encoding and the fixed registry from `design.md`.
4. Enforce exact Origin on every unsafe route before state-changing work.
5. Implement setup status/completion, login, current-session, and logout mappings with endpoint-specific success JSON and no universal envelope.
6. Implement environment-sensitive cookie names/attributes, new session per login, idempotent logout, and no-store cache headers.
7. Ensure 401 responses omit Basic/Bearer challenges, rate limiting omits precise reset data, and all sensitive values remain absent from responses/logs.
8. Preserve health response/status/content type/routing behavior and graceful server lifecycle.
9. Add HTTP tests using `httptest`, application fakes, JSON golden structures, cookie assertions, and negative security cases.

Gate:

- Every route matches the accepted status/body/header matrix.
- Unknown email and wrong password have identical response status, content type, fields, and values; tests do not claim timing equality.
- Setup success creates no session; login is required before `/api/auth/me` succeeds.
- Logout never clears a valid-looking cookie after uncertain Redis deletion.

### 7. Add container and operator workflow

Files likely added/affected:

- `template/compose.yaml`
- `template/Makefile`
- `template/api/Dockerfile`
- `template/api/migrations/Dockerfile`
- `template/README.md`
- optional narrow container entrypoint/config files if required by safe argument handling

Work:

1. Build the API with a multi-stage image and a non-root runtime user where compatible with the final image.
2. Build a migration image from `migrate/migrate:v4.19.1` containing the target release's external SQL files only.
3. Define PostgreSQL 18.6 with a named volume at `/var/lib/postgresql` and a readiness condition usable by explicit operator commands.
4. Define Redis 8.10.1 with `requirepass`, no persistence, no data volume, finite-memory settings, `volatile-lru`, and loopback-only port publication.
5. Keep API, PostgreSQL, Redis, and migrate in one Compose project. The migrate service is an explicit one-shot command/profile and is never an API-start dependency that mutates schema.
6. Pass PostgreSQL credentials through standard `PG*` environment variables so the migration command does not interpolate a password into a URL. Never print resolved secrets in Make targets or documentation.
7. Publish API, PostgreSQL, and Redis host ports on loopback only; service-to-service traffic stays on the private Compose network.
8. Add thin Make targets and document their underlying `docker compose`, Go, and migration commands.
9. Document fresh install, setup-link curl flow, login/cookie-jar flow, safe upgrade, migration failure, Redis restart semantics, and volume-preserving shutdown.

Gate:

- `docker compose config` succeeds with a filled test `.env` and keeps secrets out of captured normal logs.
- API startup before migration fails read-only; `migrate-up` succeeds; API then starts.
- Migration failure prevents new API startup in the documented workflow.
- `docker compose down` preserves PostgreSQL data; no normal target includes `-v`.

### 8. End-to-end generated-project verification

Work:

1. Run root `pnpm check`, `pnpm build`, CLI tests, Git tests locally, and the actual package test against a real `.tgz`.
2. Generate a new project from that tarball with a non-seed Go module path.
3. Verify exact generated inventory, module substitution, `.env.example` presence, secret exclusion, and byte-for-byte unchanged admin source.
4. Following repository policy, rsync local source/output one way to an isolated Centaurus path; exclude `.git`, `.env`, credentials, volumes, dependencies, and build output.
5. On Centaurus, run generated Go formatting check, `go vet ./...`, `go test ./...`, `go test -race ./...` where runtime permits, and `go build`.
6. On Centaurus, build/start Compose dependencies and execute integration/smoke tests. Forward API port to local loopback for curl verification.
7. Exercise fresh migration, startup-link extraction, setup, setup replay rejection, login, `/me`, logout, API-only restart, Redis restart, PostgreSQL persistence, Redis outage/recovery, and API/schema mismatch.
8. Run unchanged admin `pnpm install`, lint, check, and build only to prove preservation; do not add frontend integration or browser auth tests.
9. Record exact commands, versions, outputs, known skips, and residual risks in `verification.md`.

If Centaurus is unavailable, report it immediately and pause resource-intensive container/build validation rather than silently moving it local.

### 9. Quality review, spec capture, and handoff

1. Run the Trellis check workflow against PRD acceptance criteria, architecture boundaries, data flow, code reuse, lint/type checks, tests, packed output, and generated output.
2. Fix all in-scope findings and rerun the smallest affected check plus the final full gate.
3. Use `trellis-update-spec` to replace relevant backend placeholder guidance with stable conventions learned from the implementation, especially module boundaries, direct SQL, Problem Details, configuration, and template verification.
4. Review the final diff for accidental admin changes, secrets, generated artifacts, new dependencies, migration safety, and scope creep.
5. Present verification and residual risks to the user. Follow the normal commit approval/workflow and use a Conventional Commit message; do not push or publish unless separately requested.
6. After accepted completion, use `trellis-finish-work` to archive and journal the task.

## Required verification matrix

| Area | Required evidence |
| --- | --- |
| Generator | source, packed tarball, and generated file inventories agree; `.env.example` included; secrets excluded |
| Architecture | domain/application compile without HTTP/PostgreSQL/Redis imports; adapters depend inward; composition stays in `cmd/server` |
| PostgreSQL | migration up/down, exact schema check, singleton/token locking, concurrent completion, persistence across API/PostgreSQL container replacement |
| Password | accepted Argon2id PHC, bounded parser, constant-time tag compare, semaphore cap, benchmark record |
| Redis | hashed keys, finite TTL, atomic idle touch, absolute cutoff, non-resurrection, limiter concurrency, outage/reconnect, restart-wide logout |
| HTTP | route/status/body/content type, Problem Details, body limit, strict JSON, Origin, cookie attributes, no-store, 404/405 behavior |
| Auth flow | setup required -> setup complete -> explicit login -> `/me` -> logout -> old cookie rejected |
| Failure flow | invalid/replayed setup token, wrong/unknown credentials, limiter denial, Argon saturation, dirty/missing schema, PostgreSQL/Redis outage |
| Scope | no JWT, ORM/sqlc, frontend auth code, auto-migration, Redis persistence, health-system expansion, or deferred security feature |

## Review and rollback boundaries

- Planning review is required before any product change.
- Migration application is a deployment boundary: back up PostgreSQL and stop API before upgrading.
- A failed migration stops the rollout; diagnose or restore from a tested backup rather than automatically forcing/downgrading migration state.
- Redis is disposable by design. Recovery is restart/reconnect plus user re-login, never restoration from a hidden persistence artifact.
- Application and adapter changes can be reverted before release together with the unshipped migration. After release, preserve migration history and use forward corrections.
- Any change to response JSON, status, cookies, credential rules, session lifetimes, setup authority, database engine, persistence model, or frontend scope returns to user discussion.
