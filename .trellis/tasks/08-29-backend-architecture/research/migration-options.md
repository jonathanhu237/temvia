# Schema Migration Options

Researched: 2026-08-29. The accepted database stack is PostgreSQL, handwritten SQL, database/sql, and pgx/v5/stdlib. The user accepted golang-migrate v4 under R17, a separate migration command with read-only API startup checks under R18, planned brief upgrade downtime under R19, Makefile shortcuts under R21, external SQL without embedding under R22, a dedicated migration container under R23, Docker Compose under R24, and PostgreSQL in the same Compose project with persistent-volume storage under R25 in `../prd.md`. R23 supersedes the earlier application-owned subcommand in R20. Exact images/releases, SQL delivery and paths, command details, permissions, and recovery remain undecided. No implementation or deployment has started.

## Repository Evidence and Need

The template has no migration runner or migration files. `.trellis/spec/backend/database-guidelines.md` is an unfilled guideline, not an existing migration contract. The setup/login feature will need initial tables and a reproducible way to apply later schema changes without resetting persistent administrator or setup state.

Schema migration means versioned changes to database structure, not switching database engines. Business queries and schema changes can both remain handwritten SQL. A migration runner adds ordering and version bookkeeping; it does not require an ORM or query generation.

## Candidates

| Candidate | Relevant behavior | Trade-off |
| --- | --- | --- |
| Manual SQL execution | An operator executes schema scripts directly. | No additional migration package, but script order, applied-version bookkeeping, and recovery procedures must be maintained separately. |
| golang-migrate v4 | CLI and Go library; separate `.up.sql` and `.down.sql` migration files. Its README states that the v4 API is stable and frozen. | Fits a SQL-only workflow and the user's API stability preference. Adds a tool dependency and explicit failure/recovery procedures; its API policy is not the Go standard library's compatibility guarantee. |
| Goose v3 | CLI and Go library; SQL files use an Up annotation and an optional Down section in the same file. Go migrations are also supported. | SQL changes can be kept together; its SQL annotations and additional migration features need to be understood. Go migrations are available but are not required by this feature. |

Sources: [golang-migrate project documentation](https://github.com/golang-migrate/migrate), [Goose project documentation](https://github.com/pressly/goose#sql-migrations).

## Decision and Rationale

The initial recommendation was golang-migrate v4 with handwritten SQL files, primarily because of its documented stable v4 API. The user then asked why Goose was not preferred. API freezing alone is not evidence that golang-migrate is more reliable than Goose, and a preference for Go standard-library APIs does not rank these two third-party tools.

After closer comparison, the assistant retained only a modest preference for golang-migrate's separate plain-SQL files and explicit failure-state recovery. The user subsequently accepted golang-migrate v4 on 2026-08-29. Goose was a viable alternative with convenient default transactions and a single-file convention, not an incompatible or unstable option. Neither tool's ability to run down scripts guarantees recovery of deleted data.

## Closer Comparison Requested by the User

### SQL Authoring

golang-migrate identifies migration direction from `.up.sql` and `.down.sql` filenames, without an additional in-file migration markup language. Its FAQ explicitly identifies this as a design choice for compatibility with existing database tools. Goose uses SQL comments for its required Up and optional Down sections; compound SQL with internal semicolons needs StatementBegin/StatementEnd annotations. Both remain handwritten SQL. Preferring fewer annotations is an authoring preference, not evidence of better correctness. [migrate file format](https://github.com/golang-migrate/migrate/blob/master/MIGRATIONS.md), [migrate FAQ](https://github.com/golang-migrate/migrate/blob/master/FAQ.md), [Goose SQL annotations](https://github.com/pressly/goose#sql-migrations)

### Transactions and Failed Migrations

Goose defaults to transactional SQL migrations and allows an explicit NO TRANSACTION opt-out. The inspected SQL migration implementation executes statements and version bookkeeping in the same transaction and rolls back on statement or version-write failure. For non-transactional operations, partial effects still require inspection and a recovery procedure; do not promise unconditional rollback or blind safe retries. [Goose SQL execution source](https://github.com/pressly/goose/blob/main/migration_sql.go)

golang-migrate's FAQ documents a dirty flag set before migration execution. A failure leaves that state in place and blocks further migrations until an operator inspects and repairs the situation and reconciles the version. This is a conservative recovery boundary, but adds operational work even when the database has rolled back the SQL. Its generic runner delegates raw migration contents to database drivers; transaction boundaries must be understood for the selected PostgreSQL adapter and script, not described as either universally automatic or unsupported. [migrate failure-state FAQ](https://github.com/golang-migrate/migrate/blob/master/FAQ.md), [migrate content format](https://github.com/golang-migrate/migrate/blob/master/MIGRATIONS.md)

### Integration and Concurrency

Goose's current NewProvider API directly accepts sql.DB and fs.FS; its source documents pgx as a compatible driver choice. Supporting Go migrations does not require this project to use them. The same source shows that Provider.Close closes the supplied database handle, so connection ownership needs deliberate design for Goose as well as golang-migrate. [Goose provider source](https://github.com/pressly/goose/blob/main/provider.go)

The inspected Goose provider exposes optional WithSessionLocker/WithLocker configuration; database migration locking is disabled unless configured. The inspected golang-migrate pgx/v5 adapter supplies PostgreSQL advisory locking. This is an integration detail to configure and test, not a reason to claim Goose cannot support concurrent deployment safety. A provider's in-process mutex is not a cross-process migration lock. These observations come from current source, not a pinned-release deployment test. [Goose provider options](https://github.com/pressly/goose/blob/main/provider_options.go), [migrate pgx v5 adapter](https://github.com/golang-migrate/migrate/blob/master/database/pgx/v5/pgx.go)

## Compatibility Evidence and Later Design Checks

The library-adapter observations below are retained from the earlier R20 evaluation. The selected R23 container boundary does not require adding golang-migrate or its adapter to the API's Go module. The API's database/sql and pgx/v5/stdlib choices remain unchanged; the migration image's supported drivers and configuration must be checked independently when selecting its release.

The inspected golang-migrate `database/pgx/v5` adapter imports pgx/v5/stdlib, uses sql.DB/sql.Conn, and exposes `WithInstance(*sql.DB, ...)`. It can therefore fit the selected standard access API without changing the application to native pgx. The inspected master source is evidence of an available integration, not validation of a selected release or an end-to-end test. [pgx v5 migration adapter source](https://github.com/golang-migrate/migrate/blob/master/database/pgx/v5/pgx.go)

That adapter retains the supplied sql.DB and closes it when the migration adapter closes. Explicitly design connection ownership instead of accidentally closing an API server's shared pool. Its PostgreSQL lock and timeout behavior, migration transaction boundaries, and failure-state handling must also be reviewed for the exact selected release.

Goose also documents integration with sql.DB and embedded SQL files. Its SQL migrations use transactions by default, with an explicit opt-out for statements that cannot run inside a transaction. These were comparison benefits, not reasons to assume that every schema operation is transactional. [Goose SQL and embedded migration documentation](https://github.com/pressly/goose#embedded-sql-migrations)

Tool selection did not implicitly select invocation: the user subsequently accepted a separate deployment command under R18 and later clarified a dedicated migration container under R23, superseding R20. External SQL is selected under R22. Remaining decisions include file paths and delivery, connection/DDL permissions, version pinning, concurrent invocation, the exact schema compatibility policy, and safe recovery. No automatic destructive rollback or database reset is proposed.

## Invocation Decision

The user accepted an explicit migration command as a deployment step before starting the API on 2026-08-29. The API must check schema readiness without applying migrations and clearly refuse startup when the required schema is unavailable or incompatible. The exact version compatibility and error contracts remain to be designed; this acceptance does not authorize implementation.

| Approach | Benefit | Cost |
| --- | --- | --- |
| Separate migration command, selected | Schema changes have an explicit deployment step; migration failures can be diagnosed before starting the new API. It permits separate DDL credentials without requiring ordinary API processes to own schema changes. | Adds a step to first deployment and upgrades. The dedicated migration container and its invocation must be documented. |
| Automatic migration during API startup, not selected | A fresh deployment can prepare its schema as part of one application start. | New migrations may extend or fail startup, and each starting process needs an appropriately coordinated migration path and sufficient schema-changing permissions. |

A separate step can later be automated in a deployment script; the decision does not require a human to type every command forever. Conversely, automatic startup would not mean reapplying already-recorded migrations on every restart. Both approaches require correct locking, error handling, and tested scripts. The selected tool offers both a CLI and a Go library; the user's latest R23 decision uses a dedicated migration container instead of the earlier API-owned library wrapper. [migrate CLI documentation](https://github.com/golang-migrate/migrate/blob/master/cmd/migrate/README.md), [migrate Docker usage](https://github.com/golang-migrate/migrate#docker-usage)

For the accepted read-only API startup check, do not construct a migration adapter that creates a missing version table as a side effect. A missing schema must produce a migration-needed result rather than modifying the database. Runtime/migration connection ownership, credential separation, exact commands, and script automation remain pending; no invocation has been run or added to the product.

## Why Startup Migration Can Be Risky

The user recalled an article discouraging application-start migration but did not identify it. The following explains the general concerns from primary sources; it is not identification or reconstruction of that article.

- Concurrent startup requires database-level migration coordination. The selected tool's PostgreSQL adapter uses advisory locking, so it would be inaccurate to claim that two instances inevitably apply the same migration concurrently. Locks can instead delay startup, and a migration lock does not ensure old running application versions understand the new schema. [migrate concurrency FAQ](https://github.com/golang-migrate/migrate/blob/master/FAQ.md)
- Schema changes can acquire strong locks or perform lengthy work. PostgreSQL documents ACCESS EXCLUSIVE as the default ALTER TABLE lock level unless a subform says otherwise. Putting such work on a startup path couples deployment readiness to database work; actual duration depends on the statement and data. [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- A supervisor may restart a process that keeps failing startup. Kubernetes documents repeated failure/backoff and failed startup or liveness probes as examples. This is a general operational illustration, not a proposal to add Kubernetes. Restarting cannot itself repair golang-migrate's persistent dirty state. [Kubernetes restart behavior](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#how-pods-handle-problems-with-containers), [migrate dirty-state FAQ](https://github.com/golang-migrate/migrate/blob/master/FAQ.md)
- Runtime schema-changing credentials increase the permissions available to the long-running application process. A separate deployment identity permits a narrower ordinary application identity. Microsoft documents this principle and the risks of migrating while other application instances access the database. Its examples are EF Core, not this Go implementation; applying the permission and rollout principles here is an engineering inference. Current EF Core documentation also acknowledges that migration locking can make startup migration acceptable where its trade-offs are understood. Do not repeat older blanket claims as current universal limitations. [Microsoft migration deployment guidance](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying#apply-migrations-at-runtime)

An illustrative incompatible change is dropping a column still read by the old API during a rolling upgrade. A migration lock cannot fix that compatibility problem, and reverting only the application binary does not restore the dropped data. Running migration as a separate command also does not automatically provide a safe rolling upgrade.

The user accepted planned brief API downtime under R19 on 2026-08-29: stop the old API, keep PostgreSQL running, execute the target release's migrations, and start the new API only after migration succeeds and its read-only schema check passes. First installation has no old API to stop. Failure stops the upgrade for diagnosis; it must not trigger an automatic destructive downgrade or pretend that an old binary is always compatible. Exact downtime depends on the migration and data. Uninterrupted and rolling upgrades are outside this milestone; a future requirement would need compatible staged schema changes and explicit application-version overlap.

## Command Packaging Decision

The existing `template/api/cmd/server/main.go` only starts an HTTP server; no migration command or command-dispatch interface exists. An independent migration invocation can use either an application-owned subcommand backed by the golang-migrate Go library or the separately distributed migrate CLI. Both are supported integration forms in the tool's documentation. [migrate library and CLI documentation](https://github.com/golang-migrate/migrate#use-in-your-go-project)

The user previously accepted the application-owned subcommand under R20 on 2026-08-29 to avoid requiring a separate migrate executable and to keep the migration entry point with the application release. That historical choice is superseded by R23: the user clarified that the application will be containerized and migrate will appear as its own container. The selected direction no longer needs an API migration subcommand, an API-side migration runner dependency, or SQL embedding. External SQL remains selected under R22. Exact container commands, credentials, and deployment automation remain separate choices; no commands have been implemented or run.

The container clarification resolves the earlier ambiguity about independent execution versus a separate runner. The assistant had assumed binary-oriented delivery when recommending a bundled subcommand; container delivery removes the need for that application wrapper because the migration tool can be supplied independently as a container image. The tool/image still needs version management and release-matched SQL. A separate container alone does not enforce readiness, execution order, or failure gating; those need explicit deployment configuration.

## Makefile Shortcuts

The user requested Makefile command simplification while accepting R20. Repository inspection found no existing Makefile. `template/README.md` currently documents direct `go run`, `go test`, `go vet`, and `go build` commands inside the generated API; the admin has its own pnpm commands. `.mise.toml` manages the generator repository's Go, Node, and pnpm tool versions and does not provide a Makefile command convention.

The assistant proposes a Makefile as a thin convenience layer, with illustrative targets such as `make run`, `make build`, `make test`, `make migrate-up`, and `make migrate-version`. These names and placement are proposals. Under R23, a migration target invokes the separate migration container rather than an API subcommand. Migration logic belongs in the migrate tool, not shell recipes; `run` must not depend on a migration target. Make should be optional, with direct application/container-tool commands documented. Do not silently add destructive reset/down/force shortcuts or a full upgrade orchestrator. No Makefile has been created.

## SQL Distribution Decision: External Files

The assistant originally proposed Go's standard `embed` package to include the handwritten `.sql` files in the compiled executable, then supply that filesystem to the migration source adapter. The standard library documents compile-time file embedding and the `fs.FS` interface; migrate documents both filesystem and io/fs sources. This was a supported integration candidate, not a tested implementation. [Go embed documentation](https://pkg.go.dev/embed), [migrate sources](https://github.com/golang-migrate/migrate#migration-sources)

Embedding keeps migrations with the application build and avoids a separate SQL-directory deployment step; adding migrations requires rebuilding the executable. External SQL files avoid that rebuild for file changes but require separate distribution and release matching. Source SQL remains separately authored and version-controlled with either approach.

The user first asked for an explanation, then paused to consider the choice because they had previously used external SQL. On 2026-08-29 they selected external SQL and said embedding was unnecessary. R22 records this choice. The assistant's earlier embedding recommendation is not the selected design. Migration SQL remains in separately distributed files; exact paths and release packaging remain pending.

Keep three decisions distinct: when migration executes (R18), which deployment component runs it (the dedicated container in R23), and where SQL is stored (R22). Embedding alone neither executes SQL nor determines Clean Architecture dependency boundaries. External SQL does not remove the compatibility relationship between schema and application version. Supplying SQL by a read-only mount or copying SQL files into a dedicated migration image are both compatible with no Go embedding, but neither delivery mechanism has been selected.

## Container Deployment Direction

Repository inspection found no Dockerfile, Compose file, or existing container deployment convention. The user intends eventual containerization with a separate migrate container, accepted Docker Compose under R24, and selected PostgreSQL in the same Compose project with persistent-volume storage under R25. Exact deployment configuration and timing of deployment-artifact implementation remain unresolved.

The migrate README documents running the `migrate/migrate` image with a migration-directory mount and a migration command. This supports the proposed standalone tool container; the documented example is not an accepted image tag, network setup, credential mechanism, or tested Temvia deployment. [migrate Docker usage](https://github.com/golang-migrate/migrate#docker-usage)

Plan the migration container as a deployment task that exits after execution, not a continuously running API service. During an upgrade, keep PostgreSQL available, stop the old API, run the target release's migration task, and only start the new API after success. A failed task must stop the upgrade rather than restart indefinitely or force migration state. This does not mean migrations only run once over the application's lifetime: later releases may require another task invocation.

The user accepted Docker Compose for the discussed simple single-host deployment on 2026-08-29. Docker documents Compose as a way to define/manage multi-container applications and `docker compose run` for one-off service commands. This does not establish a multi-host orchestration design. Exact startup/readiness/exit-code gating still needs design and validation; accepting Compose does not make a bare startup dependency sufficient for safe upgrades. [Docker Compose overview](https://docs.docker.com/compose/), [Compose run documentation](https://docs.docker.com/reference/cli/docker/compose/run/)

## Migrate Container Release and SQL Delivery: Accepted under R54

The current stable golang-migrate release is v4.19.1. Its release updated the Docker build and dependencies, and the published `migrate/migrate:v4.19.1` tag provides linux/amd64 and linux/arm64 images. The upstream Docker example mounts a migration directory and runs the CLI against it. See [golang-migrate v4.19.1 release](https://github.com/golang-migrate/migrate/releases/tag/v4.19.1), [Docker Hub image tag](https://hub.docker.com/r/migrate/migrate/tags), and [upstream Docker usage](https://github.com/golang-migrate/migrate#docker-usage).

Two SQL-delivery shapes preserve R22's decision not to embed migrations in the Go executable:

- Bind-mount external SQL from the host into the official migrate container. This is simple during development, but a production host must retain exactly the target release's files and path; container and SQL versions can drift independently.
- Build a thin project migration image `FROM migrate/migrate:v4.19.1` and `COPY` the release's external SQL into `/migrations`. This adds an image build but creates one versioned deployment artifact whose CLI and SQL travel together. SQL remains external to the Go executable and independently inspectable.

The user accepted the derived project image under R54 for both the Compose milestone and production release path. Development rebuilds it when SQL changes rather than introducing a second runtime delivery contract. Do not use floating `latest` or `v4` tags. Exact project image name/tag, Dockerfile location, Compose command, database URL/credential delivery, image digest, Makefile wrappers, schema compatibility gate, and failure recovery remain unresolved. R54 is planning acceptance; no image has been built or pulled.
