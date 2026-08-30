# Runtime Configuration Options

Researched: 2026-08-30. The user prefers placing values intended for configuration in `.env` wherever practical, accepted the complete `.env.example` inventory contract under R57, and accepted Compose-owned loading with process-environment-only Go configuration under R58. Remaining boundaries are still proposals; no implementation is authorized merely by this research.

## Existing Repository Behavior

- The repository `.gitignore` and generated-project `template/_gitignore` ignore `.env` and `.env.*` while allowing `.env.example`.
- `src/generate.ts` excludes `.env`-named files while copying templates, so a committed `.env.example` requires deliberate generator handling and tests rather than relying on unrestricted directory copying.
- The current Go API reads `HTTP_ADDR` directly from the process environment with the standard library. It does not parse a dotenv file and has no dotenv dependency.
- No Compose file or `.env.example` exists yet.

## Compose Semantics

Docker Compose uses a project-root `.env` as a default interpolation source, but variables do not enter a container merely because they exist in that file. The Compose service must explicitly map them through `environment` or `env_file`. Interpolation also has precedence rules, so resolved configuration should be inspectable with `docker compose config` and missing required variables should use Compose's required-value syntax where suitable. See [Docker Compose interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) and [container environment configuration](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Docker recommends secrets rather than environment variables for sensitive values. A file-backed Compose secret improves how a credential is presented inside a container, but a personal single-host deployment must still store the source secret somewhere securely on the host. Choosing an ignored plaintext `.env` is simpler and can be acceptable for this milestone only with an explicit acknowledgement that host users, backups, process/container inspection, or accidental disclosure can expose it. It is not equivalent to a secret manager.

## `.env.example` Contract: Accepted under R57

The generated root `.env.example` is the complete inventory of supported operator-facing runtime configuration. Every key has a short explanation. Non-sensitive settings contain safe initial values suitable for copying into `.env`; sensitive settings are present but empty. Do not provide usable-looking placeholder passwords such as `changeme`, because they can survive unchanged into a public deployment. Required empty secrets fail clearly rather than gaining an implicit fallback. The real `.env` remains ignored, and tests or a validation mechanism must keep the committed example synchronized with the supported Compose/application contract.

This inventory requirement applies to actual configuration inputs. It does not turn every internal constant, security invariant, schema version, dependency release, or architecture decision into an environment switch. Exact classification remains part of detailed design.

## Runtime Loading: Accepted under R58

The user accepted using one root `.env` as the operator-edited source for the Compose deployment and having Compose explicitly pass the required subset to each service. The Go process consumes normal environment variables through a project-owned validated configuration package and does not depend on a dotenv parser; direct non-Compose execution must export the same variables or use an operator wrapper. This prevents the application and Compose from implementing different dotenv search-path and precedence behavior, and keeps the binary independent of how a future process manager supplies its environment. The accepted trade-off is reduced convenience for a bare `go run` command.

## Development and Production Modes: Accepted under R60

The user accepted two explicit modes in `.env` rather than deriving every requirement from whether the configured host looks local. `APP_ENV` is a required enum with exactly `development` and `production`; missing, empty, or unknown values fail startup. `.env.example` uses `APP_ENV=development` and `APP_PUBLIC_URL=http://localhost:5173` for the generated local workflow. A production operator must explicitly select `APP_ENV=production`.

In both modes, `APP_PUBLIC_URL` remains one canonical absolute origin with no user information, query, fragment, or application subpath beyond `/`, matching R41's root deployment. Mode changes only transport and diagnostics that genuinely differ by environment:

| Behavior | Development | Production |
| --- | --- | --- |
| Public URL transport | HTTP or HTTPS; HTTP may expose credentials on a non-loopback development network and must warn clearly | HTTPS required |
| Session cookie transport | `Secure` follows HTTPS; local HTTP therefore uses a non-Secure cookie | Secure `__Host-` cookie required |
| Error/diagnostic detail | Developer-oriented diagnostics may be enabled without logging secrets | Internal details suppressed from client responses; development-only debug settings rejected |

Authentication, session validation, CSRF/origin enforcement, one-time setup authorization, secret requirements, password policy, Argon2id parameters, database schema readiness, and secret redaction remain enforced in both modes. Development is not an authentication bypass. This explicit switch makes intentional LAN testing possible but creates a deployment footgun if an operator exposes development mode publicly; documentation, startup warnings, and production validation reduce but cannot erase that operational risk. R60 accepts this mode contract; exact diagnostic detail, warning presentation, and remaining cookie/CSRF mechanics stay in design.

## First-Milestone Secret Delivery: Accepted under R61

The `.env.example` contract intentionally leaves database and Redis credentials empty. The user accepted that the operator fills those values in the ignored root `.env` for the first personal single-host milestone and restricts that file to its owner, accepting that this is plaintext configuration rather than a secret manager. Compose injects each secret only into the services that require it, and configuration errors name the missing key without printing its value. Application logs, command output, test snapshots, support bundles, and documentation must not copy resolved secrets.

Docker's current guidance says not to use environment variables for sensitive information and recommends secrets instead. File-backed Compose secrets improve container delivery, but on a single host the source secret still needs protected storage and Redis/migration credential wiring becomes more involved. The proposed `.env` choice optimizes the user's current simplicity preference and assumes host/Docker access is trusted; it does not claim equal protection. `docker compose config`, container inspection, host backups, and accidental file sharing can reveal environment-delivered values. See [Docker Compose environment guidance](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

A future file-backed Compose-secret or external-secret implementation can still present values to a process-oriented configuration boundary, possibly with separately reviewed file-input support. Exact rotation and secret-platform integration are outside this milestone. R61 accepts plaintext `.env` delivery only for the scoped first milestone; it does not claim equivalence to a secret manager.

Values proposed for `.env` include:

- trusted public application URL and service bind/port settings;
- PostgreSQL and Redis endpoints, database names, usernames, and credentials;
- the R56 database pool limits;
- log level;
- bounded setup-link and authenticated-session lifetimes, with the accepted 30-minute setup-link proposal and R38's 30-minute idle/12-hour absolute values serving as defaults if their configurability is accepted.

The following remain versioned invariants or release artifacts rather than environment switches:

- password normalization/length rules and Argon2id algorithm/profile;
- setup/session token entropy, digest/encoding rules, one-time completion, and authorization behavior;
- secure cookie, origin, CSRF, and secret-logging invariants, even where local development requires an explicitly designed transport exception;
- database schema migrations and the pinned PostgreSQL, Redis, migrate, pgx, and go-redis releases;
- Clean Architecture boundaries and feature behavior.

This distinction keeps operator-specific configuration outside code without creating an unbounded matrix of security modes. Required secrets and the production public URL have no insecure fallback. Parsed integers and durations must be bounded and cross-validated, such as idle connections not exceeding maximum open connections and the session absolute lifetime exceeding its idle lifetime. Invalid configuration fails before the HTTP server starts, without logging secret values.

## Trade-offs and Unresolved Details

The proposed first milestone accepts plaintext secrets in the ignored root `.env` for simplicity. Docker Compose secrets, external secret stores, encrypted configuration, credential rotation, backup exclusions, exact filesystem-permission commands, variable names, test overrides, and direct-host development ergonomics remain separate details. Frontend Vite variables must be handled separately because client-exposed values are compiled into browser assets; backend credentials must never use a frontend-exposed prefix or be copied into the admin package.

R57 accepts the complete `.env.example` inventory, safe non-secret initial values, empty required secrets, and synchronization requirement. R58 accepts Compose-owned loading, process-environment-only Go configuration, and no dotenv library. R60 accepts explicit development/production modes, and R61 accepts scoped plaintext `.env` secret delivery. The exact configurable inventory, direct-host wrappers, credential generation/rotation, and later secret hardening remain to be completed in design.
