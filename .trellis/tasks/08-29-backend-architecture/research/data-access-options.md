# Go Data Access Options

Researched: 2026-08-29 and updated 2026-08-30. PostgreSQL, directly authored SQL, the standard database/sql access API, pgx/v5/stdlib as its driver adapter, golang-migrate v4, and a separate migration command with read-only API startup checks are accepted; see R12-R18 in `../prd.md`. The pgx release is pinned under R55. Pool settings, command packaging, and remaining deployment details are undecided.

## Candidates

- Direct SQL through a driver: write SQL and its Go invocation/result mapping. This avoids a query-generation tool but leaves more query-to-Go synchronization to the developer. pgx has row-to-struct helpers, so do not imply every column must always be scanned manually. [pgx API documentation](https://pkg.go.dev/github.com/jackc/pgx/v5)
- sqlc: write SQL statements and provide the schema; generate typed Go query functions, parameter structs, and result types. SQL remains explicit, with an additional generation and freshness-check workflow. Generated typing is not a substitute for testing constraints, transactions, permissions, or behavior against PostgreSQL. [sqlc overview](https://sqlc.dev/), [PostgreSQL tutorial](https://docs.sqlc.dev/en/latest/tutorials/getting-started-postgresql.html)
- GORM: express operations through Go models and ORM APIs, with associations, hooks, transactions, and raw SQL support. It can reduce routine CRUD work, while requiring knowledge of mapping conventions and generated SQL. Current documentation includes a generics API; do not describe it as having no typed API. [GORM documentation](https://gorm.io/docs/)

## Driver Versus Query Tool

pgx is a PostgreSQL driver/toolkit. sqlc is a development-time code generator, not a runtime database driver. sqlc officially supports pgx/v5 output; this confirms one possible combination, not approval to select either tool. [sqlc with pgx](https://docs.sqlc.dev/en/latest/guides/using-go-and-pgx.html)

## Decision

After comparing direct SQL, sqlc, and GORM, the user explicitly selected direct SQL. The earlier sqlc recommendation is not selected. The implementation must not introduce query code generation or an ORM for this flow. Query-to-Go mapping and SQL/schema compatibility will need direct maintenance and appropriate tests.

All approaches can implement a repository boundary. The proposed application core should not import ORM types, generated database row structs, or driver-specific transaction types. Persistence adapters would translate them into application-owned types; transaction semantics still need deliberate design.

The separately accepted driver is recorded below, and the accepted golang-migrate v4 and separate-command choices are detailed in `migration-options.md`. Its release pin follows R55; command packaging, permissions, and remaining deployment details require further planning. No dependency has been installed and no implementation has started.

## Access API and Driver Decisions

The user selected database/sql after comparing it with native pgx, prioritizing long-term standard-library API stability. The earlier native pgx/pgxpool recommendation is not selected. Use the standard query and transaction APIs and sql.DB's connection pool; there is no current need for a separate pgxpool pool or native-query escape hatch. The proposed business core should still depend on application-owned contracts, not sql.DB or sql.Tx.

The user explicitly accepted pgx/v5/stdlib as the underlying PostgreSQL driver adapter on 2026-08-29 and its v5.10.0 release pin under R55 on 2026-08-30. This retains the selected database/sql API while using pgx for PostgreSQL communication. The decision does not install a dependency. Parameter binding, context cancellation, transaction boundaries, row cleanup, pool settings, and error mapping must still be designed and tested; an access API does not provide those application guarantees automatically.

## pgx Release: Accepted under R55

The current stable pgx/v5 tag is v5.10.0, released on 2026-06-03. It requires Go 1.25+, which is compatible with the template's declared Go 1.27. The release adds bounds and authentication/protocol hardening, TLS protection for cancellation when the primary connection uses TLS, and fixes across connection and row handling. See the [pgx v5.10.0 changelog](https://github.com/jackc/pgx/blob/v5.10.0/CHANGELOG.md#5100-june-3-2026) and [v5.10.0 module declaration](https://github.com/jackc/pgx/blob/v5.10.0/go.mod).

The user accepted pinning `github.com/jackc/pgx/v5 v5.10.0` under R55 and importing its `stdlib` adapter under R16. Do not use a floating branch or infer pool behavior from the version selection. The recent release and its broader API changes require tests, but the application consumes the stable `database/sql` boundary and benefits from the hardening. DSN security, TLS, prepared-query behavior, and pool settings remain separate decisions.

Primary reference: [pgx project documentation](https://github.com/jackc/pgx), which documents the native API, pgxpool, and database/sql compatibility adapter.

## database/sql Pool Defaults: Accepted under R56

`sql.DB` already manages a concurrent connection pool. Go's documented default keeps two idle connections, permits an unlimited number of open connections, imposes no maximum idle duration, and imposes no maximum connection age. Limiting open connections acts like a semaphore: operations beyond the limit wait, and incorrect nested connection use can deadlock. `DB.Stats` exposes open/in-use/idle counts plus wait and closure counters for later tuning. See [Go's connection-management guide](https://go.dev/doc/database/manage-connections) and the [`database/sql` API](https://pkg.go.dev/database/sql#DB.SetMaxOpenConns).

For the accepted first single-API Compose deployment, the user accepted these configurable defaults under R56:

- maximum open connections: 10;
- maximum idle connections: 5;
- maximum idle time: 5 minutes;
- maximum lifetime: 0, meaning no forced recycling based only on age.

This is a conservative initial connection budget for an unmeasured personal workload. Five warm idle connections reduce reconnection after a small burst, and the idle-time limit releases them after quiet periods. The direct Compose topology has no selected database proxy, load balancer, or documented upstream connection-age limit, so an arbitrary 30-minute or one-hour lifetime would add churn without an established benefit; a future proxy or network lifetime can justify a nonzero value shorter than that infrastructure limit. Configuration must reject a maximum-open value below one, an idle count outside zero through maximum-open, and negative durations. Each API process has its own pool, so horizontal scaling multiplies the possible PostgreSQL connection count. The limit can cause requests to wait and can make leaked rows, connections, or badly nested transactions surface as stalls; request/query deadlines and correct resource release remain necessary. R56 accepts these defaults but does not establish a throughput claim or authorize implementation.

## Native pgx Versus database/sql

The user requested a direct comparison and then selected database/sql for its standard-library API stability, followed by explicit acceptance of pgx/v5/stdlib as its underlying driver. The table preserves the comparison and the selected combination.

These are two possible ways to use the same PostgreSQL driver, not necessarily two different drivers:

| Concern | Native option, not selected | Selected standard API and pgx driver |
| --- | --- | --- |
| Application-facing database API | pgx native API | database/sql through pgx/v5/stdlib |
| PostgreSQL driver | pgx | pgx |
| Connection pool in the straightforward setup | pgxpool.Pool | sql.DB's built-in pool |
| Ordinary parameterized queries and transactions | Supported | Supported |
| Main fit | PostgreSQL-focused application without a standard-API integration constraint | Code or libraries that expect the standard database/sql API |

The Go standard library does not include a PostgreSQL driver. Choosing database/sql therefore does not remove the third-party driver dependency. Its sql.DB is already a concurrent connection pool; the standard setup does not require adding pgxpool as a second pool. [database/sql documentation](https://pkg.go.dev/database/sql#DB), [pgxpool documentation](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool)

The pgx stdlib adapter explicitly provides database/sql compatibility. PostgreSQL-specific operations can still be reached through sql.Conn.Raw, and pgtype supplies adapters for PostgreSQL-specific values. Do not claim that choosing the standard API makes those capabilities impossible; native access exposes them more directly. [pgx stdlib documentation](https://pkg.go.dev/github.com/jackc/pgx/v5/stdlib)

The earlier native recommendation followed pgx's guidance for PostgreSQL-only applications without libraries requiring database/sql. The user's subsequent priority of a stable standard-library API supports selecting database/sql instead. Both can sit behind application-owned repository contracts, and neither choice is inherently more compliant with Clean Architecture. Driver and SQL transaction types should not leak into the proposed business core.

Both alternatives provide the database capabilities needed by the current setup/login flow. PostgreSQL-specific features such as COPY and LISTEN/NOTIFY are not current feature requirements. No project benchmark has been run, and a performance difference must not be represented as a measured benefit or the deciding argument. Later library choices may introduce an integration constraint and should be assessed explicitly. [pgx interface selection guidance](https://github.com/jackc/pgx#choosing-between-the-pgx-and-databasesql-interfaces)

## Compatibility Rationale

The Go 1 compatibility policy covers the language and standard-library APIs at the source level. This gives the user's stability preference a concrete basis. The policy permits exceptions including security fixes and correction of bugs or unspecified behavior; it is not an absolute promise of unchanged behavior or performance. It does not extend that same guarantee to a third-party database driver, database server, or SQL dialect. Do not infer that pgx is unstable merely because it is third-party. [Go 1 compatibility policy](https://go.dev/doc/go1compat)
