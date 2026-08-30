# Backend Directory Structure

## Overview

The generated API is a modular monolith. Organize code by business capability first and use Clean/Hexagonal dependency boundaries inside a capability. Package names describe responsibilities (`domain`, `application`, `adapter`) instead of generic HSR buckets.

Source dependencies point inward:

```text
cmd/server -> adapters -> application -> domain
                    config -> standard library
```

Runtime calls may travel from HTTP through application ports to PostgreSQL, Redis, or password adapters; that outward runtime call does not reverse source dependencies.

## Directory Layout

```text
template/api/
├── cmd/server/                     # composition root and process lifecycle
├── internal/config/                # process-env parsing and cross-field validation
├── internal/auth/
│   ├── domain/                     # identity values and transport-free validation
│   ├── application/                # setup/auth use cases, ports, public errors
│   └── adapter/
│       ├── httpapi/                # net/http routes, JSON, Problem Details, cookies
│       ├── password/               # Argon2id PHC adapter
│       ├── postgres/               # database/sql direct-SQL adapter
│       └── redis/                  # sessions and limiter Lua scripts
└── migrations/                     # external golang-migrate SQL and image
```

Root deployment artifacts (`compose.yaml`, `.env.example`, `Makefile`) belong to the generated application rather than to the Go module.

## Module Organization

- Add a new business capability as `internal/<feature>/domain`, `application`, and only the adapters it actually needs.
- Keep entities/value objects free of HTTP, SQL, Redis, and configuration imports.
- Define narrow business-shaped ports at the application boundary. Concrete adapters may satisfy several ports.
- Put manual wiring in `cmd/server`; do not add a DI framework for the current scale.
- Add shared packages only after stable cross-feature duplication exists. Do not move feature rules into `internal/common` preemptively.

## Naming Conventions

- Use nouns for domain types and capability packages.
- Use use-case names such as `Setup` and `Authentication` in application code.
- Adapter package names identify technology (`postgres`, `redis`, `httpapi`, `password`).
- Do not create generic `handler`, `service`, or `repository` package buckets. HTTP handler structs and store structs may still use those role words locally when they state the concrete responsibility.

## Example and Checks

`internal/auth` is the reference implementation. Review imports with:

```sh
go list -deps ./internal/auth/domain ./internal/auth/application
```

Domain/application packages must not import `net/http`, pgx, go-redis, or adapter packages. `go test ./...` and `go vet ./...` must pass after boundary changes.
