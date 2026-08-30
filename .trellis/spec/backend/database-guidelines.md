# Database Guidelines

## Overview

The generated API targets PostgreSQL only. Application code uses Go's `database/sql` API with `github.com/jackc/pgx/v5/stdlib`; SQL is handwritten. Do not add an ORM, sqlc, native `pgxpool`, or a database-neutral repository layer without a separately approved requirement.

## Query Patterns

- Keep SQL beside the concrete PostgreSQL store and use `$1` parameters for every value.
- Return domain/application types, not pgx or row types, across the adapter boundary.
- Map expected `sql.ErrNoRows` and PostgreSQL SQLSTATE conditions to application errors; propagate unexpected causes for boundary mapping.
- Use `BeginTx`, defer a best-effort rollback, hold locks only for the atomic state change, and commit explicitly.
- Perform expensive Argon2 work before the setup transaction, then revalidate the token under `FOR UPDATE` inside the transaction.
- Use PostgreSQL time (`clock_timestamp()`) for setup expiry and completion timestamps.

Reference transaction:

```go
tx, err := db.BeginTx(ctx, nil)
if err != nil { return err }
defer func() { _ = tx.Rollback() }()
// SELECT ... FOR UPDATE, validate, write
return tx.Commit()
```

## Migrations

- Migrations live in `template/api/migrations` as matched `NNNNNN_name.up.sql` and `.down.sql` files.
- `golang-migrate` runs in its own one-shot container. The API binary never imports migration code and never applies DDL.
- API startup reads `schema_migrations` and requires the exact clean version compiled as `ExpectedMigrationVersion`.
- Keep the constant synchronized with bundled migration filenames and test that relationship.
- Before release, an unshipped migration may be corrected. After release, preserve history and add a forward migration.
- Routine `docker compose down` and Make targets must preserve the PostgreSQL volume. Destructive `down` or `-v` is an explicit operator action, never upgrade recovery automation.

## Schema and Naming

- Use lowercase snake_case table, column, constraint, and migration names.
- Prefer explicit constraints for singleton state, paired nullable fields, canonical values, and business bounds.
- User IDs use PostgreSQL 18 `uuidv7()` and cross the Go/JSON boundary as opaque canonical strings.
- Store display email and unique lowercase `email_canonical` separately.

## Validation Matrix

| State | API startup |
| --- | --- |
| PostgreSQL unreachable | fail before listening |
| `schema_migrations` missing | fail read-only |
| dirty version | fail read-only |
| version behind or ahead | fail read-only |
| exact expected clean version | continue |

## Common Mistakes

- Wrong: run migrations from `main()` because it is convenient. Correct: make migration a deployment step and keep startup read-only.
- Wrong: keep a transaction open while hashing a password. Correct: preflight, hash outside the transaction, then lock and revalidate.
- Wrong: construct SQL or migration URLs by interpolating secrets. Correct: parameterize SQL and pass migration credentials through `PG*` environment variables.

## Tests Required

Run unit tests for schema-version/file synchronization and error mapping. Run PostgreSQL 18 integration tests after migration for exact schema readiness, setup lifecycle, concurrent one-winner completion, UUIDv7, and persistence. Exercise both migration up and down on a disposable database.
