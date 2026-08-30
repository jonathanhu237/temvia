# Database Options for the First Authentication Flow

Researched: 2026-08-29. The user subsequently accepted PostgreSQL as the first-version database, directly authored SQL, database/sql, pgx/v5/stdlib, golang-migrate v4, and a separate migration command with read-only API startup checks, and clarified personal-use scope with no MySQL compatibility requirement; see R12-R18 in `../prd.md`. Later decisions select external SQL, a dedicated migration container, Docker Compose, and PostgreSQL in that Compose project with persistent-volume storage under R22-R25. Exact storage configuration, releases, and remaining deployment details are undecided. There is no implementation approval.

## Needs Established by the Planned Flow

- Administrator and setup-completion state must persist across restarts.
- Successful setup must create the administrator and close initialization together, with a design for concurrent submissions.
- Browser/public-network access does not by itself determine database choice: clients call the API, not the database.
- Session storage, restart behavior, primary AOF persistence, and everysec synchronization follow R32/R33/R34/R35; concrete recovery handling remains a separate decision.
- After discussing necessity, possible future high concurrency, and operational cost, the user accepted Redis session storage from the first milestone under R32, routine-restart continuity with conservative fault recovery under R33, primary AOF persistence under R34, everysec synchronization under R35, WAITAOF logout confirmation under R36, and go-redis v9 under R37. This does not replace PostgreSQL for account data or reopen MySQL compatibility. PostgreSQL sessions were the unselected alternative; concrete logout/recovery handling and exact client release remain unresolved. See `bootstrap-auth.md` and `redis-client-options.md`.

## Primary-Source Comparison

| Candidate | Relevant properties | Trade-off for this starter |
| --- | --- | --- |
| SQLite | Embedded local storage; supports concurrent readers with one writer at a time per database file. The official guide considers it suitable for many websites and cautions about multi-computer direct access and write-heavy/multi-server workloads. | Lowest initial service setup burden. A strong candidate if one API instance and modest write concurrency are the intended default; requires deliberate file persistence and backup handling. |
| PostgreSQL | Client/server database; clients may run on separate machines, and the database server accepts concurrent client connections. | A natural candidate for a backend whose API instances share a database service. Requires provisioning and operating that service or using a managed one. |
| MySQL with InnoDB | Transactional storage with commit/rollback/crash recovery, row-level locking, and foreign keys. | Also meets the planned flow's relational needs. The user's subsequent personal-use and PostgreSQL preference clarification excludes it from this milestone, rather than any functional inadequacy. |

Sources:

- [SQLite appropriate uses](https://www.sqlite.org/whentouse.html)
- [PostgreSQL architectural fundamentals](https://www.postgresql.org/docs/current/tutorial-arch.html)
- [MySQL InnoDB introduction](https://dev.mysql.com/doc/refman/8.4/en/innodb-introduction.html)

## Decision and Remaining Scope

The login flow alone does not require a particular engine. After the assistant recommended PostgreSQL for a general application backend, accepting a database-service dependency in exchange for a straightforward shared-database deployment path, the user explicitly accepted that engine. SQLite and MySQL remain comparison evidence, not additional implementation targets.

Do not implement all three automatically or infer driver selection from the engine decision. The later, separately accepted direct-SQL, database/sql, and pgx/v5/stdlib choices are recorded in `data-access-options.md`; the accepted migration and container decisions are detailed in `migration-options.md`. Additional engines are now outside this milestone under R14; any future expansion requires explicit discussion. R25 selects Compose-managed PostgreSQL with persistent storage; exact storage configuration, releases, and remaining deployment details are undecided. Supporting multiple engines would add migration and behavioral testing obligations; an interface boundary alone does not provide portable database semantics.

## PostgreSQL Hosting Decision

R24 selected Docker Compose for the application deployment without implicitly selecting PostgreSQL hosting. The user then explicitly accepted a PostgreSQL service in the same Compose project with persistent-volume storage under R25 on 2026-08-29. This avoids separately provisioning a database installation for this project, but leaves database operation, backup, and upgrades with the user. Connecting to an existing or managed PostgreSQL service was the alternative, not the selected deployment target.

Docker documents volumes as persistent storage outside an individual container's lifecycle; this permits keeping database files when replacing a container, provided the correct storage is retained and reused. Persistence is not a backup, and no volume-deletion or database-version upgrade safety guarantee is implied. Exact volume configuration, version-specific data paths, backup procedures, and database-port exposure remain undecided. Routine application upgrade commands must preserve the selected database storage; PostgreSQL major-version upgrades require a separate procedure, not an assumption that retaining the volume makes them safe. [Docker volume lifecycle](https://docs.docker.com/engine/storage/volumes/#a-volumes-lifecycle)

## PostgreSQL Container Release: Accepted under R52

As of 2026-08-29, PostgreSQL 18.6 is the current minor release of major 18, first released in September 2025 and supported until November 2030. PostgreSQL 17.11 is also supported, until November 2029. The official-image manifest publishes `18.6-trixie`, `18.6-bookworm`, and Alpine variants. See [PostgreSQL versioning policy and supported releases](https://www.postgresql.org/support/versioning/) and the [official PostgreSQL image tags](https://github.com/docker-library/official-images/blob/master/library/postgres).

The user accepted `postgres:18.6-trixie` under R52 for this greenfield PostgreSQL-only application. Pinning the full PostgreSQL version and distribution variant makes major/minor intent visible and avoids `latest` or a floating `18` tag changing the selected database release implicitly. Debian Trixie is the official image's default glibc-based variant and is larger than Alpine, but avoids Alpine/musl-specific extension and debugging differences. The project must still review and explicitly bump the tag for later PostgreSQL security/bug-fix releases; the tag alone is not an immutable digest or an upgrade procedure.

The official image changed its storage layout for PostgreSQL 18 and above: `PGDATA` is version-specific and the declared volume target is `/var/lib/postgresql`. The Compose named volume should therefore mount at `/var/lib/postgresql`, not the `/var/lib/postgresql/data` target documented for version 17 and below. This preserves the image's major-version-aware directory structure and future `pg_upgrade --link` capability but does not automate a major upgrade. See the [official PostgreSQL image PGDATA guidance](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).

R52 is planning acceptance, not implementation approval. Exact digest pinning, database name/user/password delivery, network/port exposure, initialization flags, health check, backups, and major-upgrade procedure remain separate decisions.

## MySQL Compatibility Discussion

Resolved on 2026-08-29: after asking whether MySQL compatibility was necessary, the user clarified that this is a personal-use project, there is no MySQL-only deployment requirement, and PostgreSQL is preferred. The first milestone supports PostgreSQL only. Access API and driver were subsequently accepted separately under R15 and R16.

The comparison considered MySQL's value for consumers with existing MySQL infrastructure. That is not an established need for this user's project, so it does not justify extra first-milestone infrastructure. Keeping database dependencies in persistence adapters remains the proposed architecture; a universal SQL abstraction and a multi-database selection feature are unnecessary for the accepted scope.

The engineering costs are broader than installing another driver:

- Maintain and verify each engine's schema migrations and query variants where necessary. Not every query needs duplication, but handwritten SQL is not automatically portable.
- Verify equivalent application behavior against both databases: unique credentials, atomic first-admin creation and setup closure, concurrent submissions, rollback, and restart persistence.
- Maintain generated-project configuration, deployment instructions, and integration checks for each supported engine.

Go's standard `database/sql` API does not normalize SQL syntax. The official Go guide explicitly notes that placeholders depend on the database and driver, giving PostgreSQL `$1` versus `?` as an example. PostgreSQL documents `RETURNING` and `ON CONFLICT DO UPDATE`; MySQL 8.4 documents `ON DUPLICATE KEY UPDATE`. These are examples of adapter-level differences to review, not proposed queries for this feature. [Go prepared statements](https://go.dev/doc/database/prepared-statements), [PostgreSQL returning modified rows](https://www.postgresql.org/docs/current/dml-returning.html), [MySQL 8.4 INSERT](https://dev.mysql.com/doc/refman/8.4/en/insert.html)

A consumer-owned repository contract can isolate business logic from those details. A future MySQL adapter would still need implementation, migrations, wiring, and tests; switching a connection string is not sufficient. The later database/sql selection in R15 reflects the user's preference for standard-library API stability, not a requirement for additional engines or a guarantee of portable SQL. No universal SQL abstraction or empty MySQL implementation is proposed for the current milestone.
