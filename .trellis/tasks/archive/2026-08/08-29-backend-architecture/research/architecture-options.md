# Go Backend Architecture Options

Date: 2026-08-30. This note records the earlier Clean Architecture proposal for the generated Go API. The user later accepted the revised combined principles in R63: modular monolith, DDD-informed HSR, and Hexagonal external boundaries, then selected one initial `auth` business module under R64. The earlier `identity` name and illustrated directory tree remain superseded/unselected; the exact internal `auth` package layout is still under discussion. R63/R64 are authoritative and do not authorize implementation.

## Constraints from the Current Feature

- Temvia generates the project and has no runtime role under R62.
- The first vertical slice spans initial-administrator setup, account persistence, password hashing, login, Redis-backed sessions, authentication middleware, and logout.
- PostgreSQL and Redis are implementation choices at the boundary. The business rules must not expose `database/sql`, pgx, go-redis, HTTP request types, cookies, or SQL rows as core types.
- Initial-administrator creation and durable setup closure form one PostgreSQL atomic operation. Splitting setup and accounts into unrelated modules now would force a cross-module transaction abstraction before the product has a real need for one.
- The generated API is a modular monolith, not a microservice system. The React admin remains an independent application and communicates only through HTTP.

## Options

### A. Top-Level Layer Folders

Example: `internal/domain`, `internal/application`, `internal/adapter`, and `internal/infrastructure`.

This resembles many Clean Architecture diagrams and makes the rings visible. As more features arrive, however, each feature is scattered across every top-level folder. Generic `domain`, `service`, and `repository` packages often become unrelated collections, and changing one feature requires navigating the whole tree. It is valid, but it optimizes the directory layout for the architecture diagram rather than for business ownership.

### B. Feature-Oriented Modular Monolith with Inward Dependencies

Keep one cohesive `identity` core for this first slice. Put domain concepts, use cases, and the narrow interfaces those use cases consume in that core package; place HTTP, PostgreSQL, Redis, and password-hashing implementations outside it. Future business capabilities become sibling core modules rather than more files in one global service layer.

This applies the Clean Architecture dependency rule without creating a directory for every conceptual ring. The core can be split into more packages later if its size or independently changing concepts justify it.

### C. Handler-Service-Repository without an Enforced Core Boundary

This has the fewest files initially. It can be appropriate for a tiny CRUD service, but the current flow already combines two stores, password hashing, one-time setup state, cookie/session behavior, and atomic invariants. Without an explicit inward boundary, transport and storage concerns can easily enter the service contract. Refactoring remains possible, but Temvia would teach generated projects an architecture that the first real feature already strains.

## Recommended Package Shape

```text
api/
├── cmd/server/
│   └── main.go                 # composition root and process lifecycle
└── internal/
    ├── config/                 # process-environment parsing and validation
    ├── identity/               # business core: stdlib-facing types and rules
    │   ├── account.go          # Account and email/name concepts
    │   ├── setup.go            # issue link and complete initial setup use cases
    │   ├── login.go            # credential verification and session creation
    │   ├── authenticate.go     # resolve the current session/account
    │   ├── logout.go           # session revocation contract
    │   ├── ports.go            # narrow interfaces required by these use cases
    │   ├── postgres/           # PostgreSQL implementation of account/setup ports
    │   ├── redis/              # Redis implementation of the session port
    │   └── password/           # Argon2id implementation of the hashing port
    ├── httpapi/                # routes, JSON, cookies, origin/CSRF, middleware
    └── platform/               # SQL/Redis client construction and lifecycle
```

This is a logical shape, not a commitment to every filename. Go package boundaries matter more than reproducing this tree literally. In particular, files such as `setup.go` and `login.go` may remain in one `identity` package while the code is small; creating `domain`, `usecase`, and `ports` subpackages immediately would add imports and mappings without adding an independent boundary.

## Dependency and Runtime Flow

The source dependencies point inward:

```text
identity/postgres ─┐
identity/redis ────┼──> identity
identity/password ─┤
httpapi ───────────┘

cmd/server --> config + platform + all adapters + identity + httpapi
```

The runtime request travels in the opposite practical direction:

```text
HTTP request -> httpapi -> identity use case -> required port -> PostgreSQL/Redis
```

`cmd/server` is allowed to know every concrete package because it is the composition root. It opens clients, constructs adapter values, injects them into use cases, builds the HTTP handler, performs startup orchestration, and owns shutdown. No dependency-injection framework is needed; ordinary Go constructors make the graph explicit.

R62's startup link follows the same boundary: the composition root invokes the identity setup use case after schema readiness, receives the link as a result, and writes the one allowed log entry. The identity core does not own a logger and does not decide where deployment logs go.

## Interface Rules

- Define interfaces where they are consumed, normally in `identity`, rather than publishing storage-shaped abstractions from adapters.
- Model business operations rather than generic CRUD. For example, the setup persistence port should express atomic initial-administrator creation and setup closure instead of exposing a generic transaction or `Save(any)` API.
- It is reasonable for the PostgreSQL adapter to implement more than one narrow identity port. Do not introduce a generic Unit of Work solely to split one required transaction across artificial repositories.
- Use interfaces for volatile side effects and useful deterministic seams: account/setup persistence, session storage, password hashing, token generation, and time where expiration tests need control. Do not create an interface for every struct or standard-library helper.
- Keep adapter-specific errors and types at the boundary. Translate them into stable identity outcomes before the HTTP layer maps those outcomes to status codes and safe response bodies.

## Module Boundary Recommendation

Use `identity` rather than separate `user`, `setup`, and `session` modules for the first milestone:

- `user` is too vague and encourages a generic CRUD model that does not represent the requested flow.
- `auth` often means only credential/session mechanics and would leave account ownership and one-time setup awkwardly outside it.
- `identity` can own accounts, setup, authentication, and sessions while authorization/roles remain a future separate concern.

If later requirements introduce public registration, multiple account types, invitations, or complex permissions, split them based on actual invariants and change cadence. The initial package boundary does not promise that all future identity-related behavior remains in one package forever.

## Deliberate Omissions

- No microservices, event bus, CQRS framework, dependency-injection framework, generic base repository, or ORM.
- No shared `utils`, `common`, or `models` dumping-ground package.
- No separate domain DTO and application DTO for every value unless a real boundary requires different representations.
- No alternate PostgreSQL/Redis implementation merely to prove that the ports exist. Fakes used by focused tests are not production adapters.

## Recommendation and Trade-Off

R63 subsequently selects the inward-dependency and business-module principles behind option B, revised to use DDD-informed HSR terminology and Hexagonal ports/adapters only at external boundaries. R64 selects one initial `auth` module rather than the earlier `identity` proposal. Neither requirement selects the illustrated tree. The remaining trade-off is the same: a small amount of constructor wiring and boundary mapping protects business rules, while module growth must be controlled through later evidence-based splits.
