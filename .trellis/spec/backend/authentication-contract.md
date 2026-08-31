# Setup and Authentication Contract

## 1. Scope / Trigger

Use this contract when changing the generated Go API's initial-administrator setup, email/password login, current-session lookup, logout, PostgreSQL schema, Redis session/limiter state, or their deployment configuration. The React admin is a separate consumer and is not part of this backend contract.

The implementation is a feature-oriented modular monolith. Business rules live in `internal/auth/domain` and `internal/auth/application`; HTTP, PostgreSQL, Redis, and Argon2id are adapters. Runtime calls flow inward and back out through application ports, while source dependencies point inward.

## 2. Signatures

### HTTP

| Method and path | Success | Purpose |
| --- | --- | --- |
| `GET /health` | `200 {"status":"ok"}` | Existing process health contract |
| `GET /api/setup/status` | `200 {"status":"required|complete"}` | Coarse setup state only |
| `POST /api/setup` | `201 {"status":"complete"}` | Consume setup authority and create the first user; no session |
| `POST /api/auth/login` | `200 {"user":{"id","name","email"}}` | Create an independent opaque session |
| `GET /api/auth/me` | `200 {"user":{"id","name","email"}}` | Resolve and touch the current session |
| `POST /api/auth/logout` | `204` | Revoke the presented session and expire its cookie |

All `/api/setup` and `/api/auth` responses use `Cache-Control: no-store`. Unsafe routes require an exact canonical `Origin` match before request decoding or state access.

### Application ports

```go
type SetupStore interface {
    Status(context.Context) (bool, error)
    ReplaceCurrentToken(context.Context, []byte, time.Duration) (bool, error)
    PreflightToken(context.Context, []byte) error
    Complete(context.Context, []byte, domain.Name, domain.Email, string) (domain.User, error)
}

type SessionStore interface {
    Create(context.Context, string, string) error
    ResolveAndTouch(context.Context, string) (string, error)
    Delete(context.Context, string) error
}
```

Adapters may implement multiple narrow application ports. Do not introduce generic `Repository` or `Service` buckets solely to share a name.

### Database

- Migration version `000001_auth` creates `auth_setup` and `auth_users`.
- `auth_setup` contains exactly one `singleton=true` row.
- `auth_users.id` is PostgreSQL 18 `uuidv7()` and is serialized as canonical UUID text.
- `email_canonical` is unique and lowercase; `email` preserves the validated display value.

## 3. Contracts

### Request and identity fields

- Setup JSON: `token`, `name`, `email`, `password`, all strings and no extra or duplicate keys.
- Login JSON: `email`, `password`, both strings and no extra or duplicate keys.
- Name: trim Unicode surrounding whitespace, normalize NFC, reject control characters, allow 1-100 runes.
- Email: trimmed ASCII mailbox syntax, at most 254 bytes, one `@`, DNS-style host labels; canonical identity is the lowercase full value.
- Password creation: normalize NFC, do not trim, require 8-128 Unicode code
  points plus at least one ASCII uppercase letter (`A-Z`), lowercase letter
  (`a-z`), digit (`0-9`), and printable ASCII punctuation character
  (`U+0021-U+002F`, `U+003A-U+0040`, `U+005B-U+0060`, or `U+007B-U+007E`).
  Spaces and other Unicode code points are allowed but do not satisfy a class.
  Login normalizes the same way and only requires a non-empty value of at most
  128 code points so credentials created under an earlier policy remain usable.
- Setup/session credentials: 32 random bytes encoded as canonical unpadded Base64URL (43 characters).

Setup links are logged as `${APP_PUBLIC_URL}/setup#token=<credential>`. Only the SHA-256 digest and PostgreSQL-time expiry are stored. API restart replaces an uncompleted token; completed setup never issues another token.

Passwords use Argon2id PHC strings with `m=65536 KiB`, `t=3`, `p=4`, a 16-byte random salt, and a 32-byte tag. The project parser accepts only that exact bounded profile before invoking Argon2. One shared immediate-acquisition semaphore bounds hash and verify work.

Sessions are server-side Redis hashes keyed by SHA-256 of the decoded credential. They have a 30-minute idle deadline and 12-hour absolute deadline by default. Resolve/touch is atomic and cannot recreate a deleted key. Every explicit login creates a separate session.

The login limiter atomically evaluates one global bucket and one SHA-256 canonical-email bucket using Redis server time. Defaults are global capacity 10/refill 6 seconds and email capacity 5/refill 1 minute. Every limiter/session key has a finite TTL.

### Cookie

- HTTPS public URL: `__Host-temvia_session; Path=/; Secure; HttpOnly; SameSite=Lax`.
- HTTP development URL: `temvia_session; Path=/; HttpOnly; SameSite=Lax`.
- The cookie is a browser session cookie; Redis owns authentication expiry.

### Environment

`.env.example` is the complete supported inventory. Compose loads `.env`; Go reads process environment only. Required secrets are `POSTGRES_PASSWORD` and `REDIS_PASSWORD` and have no example value. Non-sensitive defaults cover:

- mode/public/listener: `APP_ENV`, `APP_PUBLIC_URL`, `HTTP_ADDR`, `API_PORT`, `SETUP_LINK_TTL`;
- build networking: `GOPROXY`;
- PostgreSQL connection/pool: `POSTGRES_*`, `DB_*`;
- Redis endpoint/memory/deadline: `REDIS_*`;
- auth resources: `SESSION_*`, `PASSWORD_HASH_MAX_CONCURRENCY`, `LOGIN_RATE_LIMIT_*`.

Production requires an HTTPS public URL. Development HTTP keeps Origin enforcement and authentication; non-loopback HTTP emits an operator warning. Redis is intentionally ephemeral: no AOF, RDB, or Redis data volume. PostgreSQL uses a named persistent volume.

## 4. Validation & Error Matrix

Errors use `application/problem+json` and RFC 9457 fields. `type`, `title`, and `status` are stable protocol fields; clients localize by `type`, top-level `code`, and `errors[].code`, never by comparing English `title` or `detail`.

| Condition | Result |
| --- | --- |
| Missing/malformed/mismatched Origin on unsafe route | `403 /problems/forbidden` |
| Setup token absent, malformed, expired, or replaced while open | `403 /problems/invalid-setup-token` |
| Setup already complete | `409 /problems/setup-complete` |
| Unknown email or wrong password | identical `401 /problems/invalid-credentials` body |
| Missing, expired, revoked, or malformed session | `401 /problems/unauthenticated` |
| Domain field failure | `422 /problems/validation-failed` with JSON-pointer field codes |
| Unsupported request media type | `415 /problems/unsupported-media-type` |
| Body exceeds 64 KiB | `413 /problems/content-too-large` |
| Invalid, duplicate-key, unknown-key, non-object, or trailing JSON | `400 /problems/invalid-request` |
| Login buckets deny | `429 /problems/rate-limited`, no reset disclosure |
| PostgreSQL, Redis, random source, or Argon capacity uncertainty | `503 /problems/service-unavailable` |
| Unknown API path / wrong known-path method | `404` / `405` Problem Details; `Allow` on `405` |

Password creation failures use `errors[].code = "invalid_password"`; login input
boundary failures use `errors[].code = "invalid_login_password"`. These codes
are stable identifiers for frontend localization and are never rendered as
user-facing text.

No `401` response advertises Basic or Bearer authentication. A valid-looking logout credential is cleared only after Redis acknowledges deletion; uncertain deletion returns `503` and preserves the cookie for retry.

## 5. Good / Base / Bad Cases

- Good: migrate an empty database, start the API, open the logged fragment link, submit valid setup, explicitly log in, call `/me`, then log out. Setup remains complete across API and PostgreSQL container replacement.
- Base: Redis restarts. The API process and setup status remain available, existing sessions disappear, and users log in again after Redis recovers.
- Bad: start the API before migration or against a dirty/ahead/behind schema. Startup must fail after a read-only exact-version check; it must never create or repair schema state.
- Bad: accept a public-URL suffix, request `Host`, sibling subdomain, missing Origin, plaintext Redis email/session ID, or arbitrary Argon2 parameters as authority.

## 6. Tests Required

- Domain unit tests cover Unicode trimming/NFC, bounds, invalid email labels, and password length without logging values.
- Application tests cover startup-token replacement/completion, replay, explicit login, unknown-email behavior, session decoding, limiter denial, and dependency error mapping.
- Password tests cover independent salts, correct/wrong values, malformed/oversized PHC strings, exact parameters, cancellation, and immediate semaphore saturation.
- PostgreSQL integration tests run on PostgreSQL 18 after migrations and assert schema version, setup lifecycle, one-winner concurrent completion, UUID version 7, and persistence.
- Redis 8 integration tests assert finite TTL, hashed keys, idle/absolute expiry, non-resurrection, limiter denial/refill, restart-wide logout, and recovery.
- HTTP tests assert status, Problem Details fields, content type, no-store, Origin precedence, strict JSON/body limits, cookie attributes, 404/405, and identical wrong/unknown login bodies.
- Generated-project verification must install an actual npm tarball, use a non-seed Go module path, run `go test`, `go vet`, `go test -race`, build the API image, and exercise the real HTTP flow with PostgreSQL and Redis.

## 7. Wrong vs Correct

Wrong: make API startup call migration code or make API Compose startup depend on a mutating migration service.

Correct: run the versioned migration container explicitly, then let API startup perform only an exact read-only schema check.

Wrong: return one universal `{data,error}` envelope or localized prose as a machine contract.

Correct: return endpoint-specific success JSON and Problem Details with stable codes suitable for client-side i18n.

Wrong: store raw setup/session credentials or canonical email in Redis keys.

Correct: store only setup-token SHA-256 in PostgreSQL and use SHA-256-derived Redis keys with finite TTL.
