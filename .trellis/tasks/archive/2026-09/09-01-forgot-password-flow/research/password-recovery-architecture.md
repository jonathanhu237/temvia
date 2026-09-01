# Research: Password recovery architecture

- Query: Independently validate a secure email-based forgot-password design for Temvia using PostgreSQL transactional outbox (no MQ), provider-neutral SMTP with local Mailpit, enumeration-resistant request behavior, digest-only/reconstructable reset credentials, bounded delivery retries and cleanup, password-change notification, and safe invalidation of every Redis session.
- Scope: mixed
- Date: 2026-09-01

## Findings

### Recommendation summary

Use the existing `internal/auth` capability and its hexagonal boundaries. Add a PostgreSQL password-reset record and a typed email outbox, a small in-process dispatcher, an SMTP adapter, and two public UI routes. Do not add a broker, a generic event bus, an ORM, or a separate service.

The two security-critical design choices are:

1. Make PostgreSQL `auth_users.auth_version` the authoritative session-revocation generation. Every Redis session stores the version observed at login, and every authenticated lookup compares it with the version returned by PostgreSQL. A password reset increments the version in the same transaction that changes the password. Redis deletion is then cleanup rather than the security boundary.
2. Use a selector/verifier reset credential whose verifier is deterministically derived with HMAC. PostgreSQL stores only the public selector and a one-way verifier digest; the outbox stores only a reset-record reference. A dispatcher that has the application secret can reconstruct the verifier for email delivery without persisting a usable raw credential.

The target flow is:

```text
POST recovery request
  -> validate Origin/strict JSON/email/locale
  -> rate-limit every canonical email identically
  -> generate selector and derived verifier
  -> one PostgreSQL transaction:
       conditionally replace reset state for a matching user
       insert reset-email outbox row
  -> wait until an account-independent response target
  -> 202 {"status":"accepted"}

in-process dispatcher
  -> lease due rows in PostgreSQL
  -> commit lease (do not hold a DB transaction over SMTP)
  -> reconstruct reset verifier, render localized mail, send through SMTP
  -> mark sent, retry, cancel, or dead-letter conditionally on lease ownership

POST reset completion
  -> validate Origin/strict JSON/token/new password/locale
  -> cheap reset-token preflight
  -> Argon2id hash outside transaction
  -> one PostgreSQL transaction under a user/reset lock:
       revalidate unused and unexpired token
       replace password_hash
       increment auth_version
       consume reset token
       insert password-changed email outbox row
  -> clear the presented browser session cookie
  -> 204; no automatic login

later authenticated request
  -> Redis returns user_id + session auth_version
  -> PostgreSQL returns user + current auth_version
  -> mismatch => unauthenticated (best-effort delete stale Redis hash)
```

### Existing code patterns that constrain the design

- Reset password input must reuse `domain.NewPassword`, not the permissive login validator; the policy and NFC behavior are at `template/api/internal/auth/domain/credentials.go:112` and `template/api/internal/auth/domain/credentials.go:125`.
- Setup already proves the preferred credential shape: 32-byte entropy, canonical unpadded Base64URL, SHA-256 storage, and PostgreSQL revalidation (`template/api/internal/auth/application/setup.go:52`, `template/api/internal/auth/application/setup.go:77`, `template/api/internal/auth/application/setup.go:130`). Recovery should reuse the strict canonical parser style but use a versioned selector/verifier grammar.
- Expensive Argon2 work has an immediate-acquisition semaphore (`template/api/internal/auth/adapter/password/argon2id.go:28`, `template/api/internal/auth/adapter/password/argon2id.go:65`). Reset completion must preflight before hashing, hash outside the DB transaction, and revalidate under lock before commit.
- PostgreSQL setup completion demonstrates `BeginTx`, best-effort rollback, `FOR UPDATE`, PostgreSQL time, and explicit commit (`template/api/internal/auth/adapter/postgres/store.go:113`). The reset transaction should follow the same pattern.
- Sessions currently store only `user_id` (`template/api/internal/auth/adapter/redis/scripts.go:22`) and `ResolveAndTouch` returns only that ID (`template/api/internal/auth/adapter/redis/store.go:63`). `SessionStore` only supports one-token deletion (`template/api/internal/auth/application/ports.go:27`). This is insufficient for provable user-wide invalidation.
- Current-session lookup already reads Redis and then PostgreSQL (`template/api/internal/auth/application/authentication.go:78`), so comparing a Redis version snapshot with the current PostgreSQL version adds no extra datastore round trip.
- Redis session keys are SHA-256-derived and finite (`template/api/internal/auth/adapter/redis/store.go:117`); recovery limiter keys should continue that redaction/TTL convention.
- Every unsafe route checks exact canonical Origin before decoding or state access (`template/api/internal/auth/adapter/httpapi/routes.go:81`, `template/api/internal/auth/adapter/httpapi/routes.go:104`, `template/api/internal/auth/adapter/httpapi/routes.go:157`). Both recovery POST routes must preserve that precedence.
- The JSON decoder already enforces one JSON content type, 64 KiB, an object root, no duplicates, no unknown fields, valid UTF-8, and no trailing data (`template/api/internal/auth/adapter/httpapi/json.go:26`). Do not create a weaker recovery decoder.
- The frontend setup authority is captured from a fragment before React mounts and removed with `replaceState` (`template/admin/src/shared/bootstrap/setup-authority.ts:9`, `template/admin/src/main.tsx:11`). Use the same lifecycle for a reset authority; never put it in query state, localStorage, QueryClient, or component props longer than needed.
- `APP_PUBLIC_URL` is parsed as an absolute trusted root without credentials, query, or fragment (`template/api/internal/config/config.go:156`, `template/api/internal/config/config.go:273`). Reset links must be built from this value, never request `Host` or forwarded headers.
- Redis is deliberately non-persistent (`template/compose.yaml:18`), while PostgreSQL has a named volume (`template/compose.yaml:1`, `template/compose.yaml:109`). Durable mail jobs therefore belong in PostgreSQL, not Redis Streams/lists.
- Generator completeness is explicit (`src/generate.ts:105`); new Go, SQL, frontend, and configuration files require coordinated inventory/test updates.

### Password reset credential: safe reconstruction without raw storage

Recommended token grammar:

```text
v1.<base64url-no-pad(selector[16])>.<base64url-no-pad(verifier[32])>
```

Generation and persistence:

1. Generate a 16-byte selector with `crypto/rand`. It is a public lookup handle, not sufficient authority.
2. Derive `verifier = HMAC-SHA256(PASSWORD_RESET_TOKEN_KEY, "temvia/password-reset/v1\x00" || selector)`.
3. Persist `selector` and `SHA-256(verifier)`, never `verifier` or the complete token.
4. Persist an outbox reference to the reset row, not a URL/token/ciphertext payload.
5. At dispatch, derive the verifier from the selector again and verify its SHA-256 digest against the row before rendering the link. A mismatch indicates a wrong/rotated key or corrupt record and must dead-letter without sending.
6. At reset submission, strictly parse the three parts, query by selector, hash the presented verifier, compare fixed-size digests without timing leakage, and revalidate expiry/consumption under `FOR UPDATE`.

The key must be a required secret, identical on every API replica, encoded as exactly 32 bytes in canonical unpadded Base64URL, and absent from `.env.example` values/logs. `crypto/rand.Read` is the Go standard CSPRNG; `crypto/hmac` documents keyed SHA-256 and timing-safe `hmac.Equal`. Links should use `${APP_PUBLIC_URL}/reset-password#token=...`; the fragment follows the project's proven capture-and-clear pattern and avoids sending the credential in the initial HTTP request. Also set `Referrer-Policy: no-referrer` on the admin response as defense in depth.

Suggested reset-row fields are `selector bytea PRIMARY KEY`, `user_id uuid UNIQUE REFERENCES auth_users`, `verifier_digest bytea NOT NULL`, `locale text`, `created_at`, `expires_at`, and `consumed_at`, with exact byte-length, locale, paired-state, and time constraints. Use PostgreSQL `clock_timestamp()` for creation, expiry, and consumption. A new accepted request locks the account/reset row, marks the previous reset superseded or replaces it, and inserts the new reset plus outbox job atomically. The dispatcher must recheck that a reset-email job still names the current unconsumed unexpired row before sending.

The PRD explicitly requires superseded links to fail. This has an availability tradeoff: anyone who knows a login email can invalidate an older link by requesting another one. Apply the per-email limiter before replacement and document the behavior. An alternative is to allow a small number of simultaneous active tokens and consume all after success, which resists this nuisance invalidation, but it conflicts with the current supersession acceptance criterion.

Key rotation caveat: already-delivered tokens can still be verified from their stored digest, while unsent jobs cannot be reconstructed with a replacement key. MVP should fail closed and require operators to cancel outstanding reset rows/jobs when rotating the key. A future key-ring (`key_id` plus current/previous keys) can provide graceful rotation.

Rejected token alternatives:

- Random verifier generated only when the worker sends: after SMTP acceptance followed by a crash, a retry would generate a different token and invalidate the first delivered message.
- Persisting the raw token in JSONB/text: violates the digest-only requirement and makes a database read sufficient for account takeover.
- Encrypting a random token in the outbox: viable, but adds AEAD nonce/ciphertext/version/rotation handling with no advantage over domain-separated HMAC reconstruction for this single use.
- JWT/stateless reset tokens: make single-use, supersession, and immediate revocation harder and add parsing/algorithm/key-rotation surface; OWASP explicitly notes their added vulnerability potential.
- Reversible encoding, UUID alone, timestamp-derived values, or passwords/PINs: insufficient or unnecessary authority strength.

### Enumeration resistance and timing

For validly shaped emails, known, unknown, and per-email-throttled requests should all return the same status, headers, and body, for example `202 {"status":"accepted"}` with `Cache-Control: no-store`. Do not reveal that the limiter dropped work. Syntax errors may remain the normal `422 invalid_email`; malformed JSON/media/Origin retain existing precedence. Redis/PostgreSQL uncertainty returns the same `503` independent of account state.

Recommended request behavior:

- Canonicalize with the existing `domain.NewEmail` and apply a dedicated global plus SHA-256-canonical-email Redis token bucket to every valid email, including unknown addresses. Suggested starting limits are a burst of 3 with one token per 20 minutes per email, and a global burst of 30 with one token per 2 seconds; expose them like existing login limits and tune from operational evidence.
- Generate selector/HMAC work regardless of account existence. Use one application store call whose conditional SQL inserts reset/outbox rows only when an account matches; never send to or persist a mail job for an unknown address.
- Establish an account-independent response target before branching (for example a CSPRNG-jittered target in the 300–400 ms range), then delay a normal accepted result until that target. The fixed target must be benchmarked so both normal DB paths finish below it. Avoid branch-specific sleeps and avoid statistically flaky wall-clock assertions; inject the clock/timer in application tests.
- Do not perform SMTP, DNS, MX lookup, Argon2, or a dummy email send on this HTTP path. Do not log known/unknown outcome or canonical email.
- Keep reset-submission invalid/malformed/expired/used/superseded token behavior under one stable problem type such as `403 /problems/invalid-password-reset-token`; rate-limit attempts with digest-keyed Redis keys even though the verifier has 256-bit strength.

OWASP requires a consistent message and response time for existing/non-existing accounts, asynchronous delivery, per-account abuse controls, secure random long single-use expiring tokens, notification after reset, explicit login rather than auto-login, and session invalidation. It also says reset URLs must come from a trusted configured origin rather than `Host` and recommends `no-referrer`.

### Transactional outbox without MQ

Use a typed `auth_email_outbox` table rather than a general JSON event bus. At minimum store `id uuidv7`, `kind` (`password_reset` or `password_changed`), `user_id`, nullable reset selector/reference, `locale`, event/change timestamp, `available_at`, `attempt_count`, `lease_id`, `lease_until`, `sent_at`, `canceled_at`, `dead_at`, and a safe bounded `last_error_code`. Do not persist raw SMTP response text because servers can echo recipient data. Prefer joining `auth_users.email` at send time over duplicating addresses; if later email-change/delete semantics require an immutable recipient snapshot, make that a separate reviewed contract.

Claim a small ordered batch using a data-modifying CTE and `FOR UPDATE SKIP LOCKED`, then assign an unpredictable lease ID and `lease_until` and commit. PostgreSQL 18 documents `SKIP LOCKED` as appropriate for multiple consumers of a queue-like table. Never hold a database transaction or row lock while dialing SMTP. Mark success/failure only with `WHERE id=$1 AND lease_id=$2`, so an expired/stolen lease cannot overwrite a newer attempt.

Suggested operational defaults:

- poll interval 1 second, batch size 10, one or two sends at a time;
- SMTP context/deadline 10 seconds;
- lease 30 seconds and greater than the send deadline plus DB update allowance;
- full-jitter exponential retry capped at 10 minutes;
- retry network/timeouts and SMTP `4yz`; treat reliable typed `5yz` as permanent, otherwise conservatively retry only to a bounded cap;
- for reset mail, never send after the reset expiry and cancel superseded/consumed/missing work;
- for password-change notification, retry for up to 24 hours (for example at most 10 attempts), then dead-letter;
- delete terminal sent/canceled rows after 7 days and dead rows after 30 days; delete consumed/superseded/expired reset rows after their mail job is terminal and at least a short troubleshooting grace period has passed.

SMTP is an at-least-once boundary. If the server accepts the message but the process dies before `sent_at` commits, the lease expires and the message is sent again. Exact-once delivery is not available. Render retries from the same immutable outbox data and use a stable globally unique `Message-ID` derived from the outbox UUID and configured sender domain. This makes duplicates recognizable but cannot guarantee every receiving system deduplicates them.

Failure semantics:

| Failure point | Required state/result |
| --- | --- |
| PostgreSQL fails before recovery-request commit | No token/job; generic `503`, not `202`. |
| Commit succeeds but client disconnects/response is lost | Token/job remains and may deliver; the user can request again. |
| SMTP is unavailable | HTTP request remains accepted; durable job retries. API startup is not gated on an SMTP connection. |
| Dispatcher dies while holding a lease before SMTP | Another dispatcher retries after lease expiry. |
| SMTP accepted, dispatcher dies before success update | Duplicate is possible; same `Message-ID` and same reset credential are reused. |
| Reset expires/supersedes/consumes before send | Cancel job; never deliver a known-invalid link. |
| Password change or notification-job insert fails in transaction | Roll back password, version, token consumption, and notification together. |
| Password transaction commits but Redis is unavailable | Reset still succeeds: PostgreSQL version mismatch is authoritative; stale Redis hashes are unusable once Redis recovers and expire naturally. |
| Password-changed SMTP delivery exhausts retries | Password remains changed; durable job is dead-lettered and logged by safe ID/kind/error class. |

The in-process dispatcher should start after configuration/schema validation, use the process lifecycle context, stop claiming on shutdown, give active sends a bounded grace period, and then release/allow leases to expire. Multiple API replicas are supported by row leases. SMTP reachability is not a startup dependency; invalid SMTP/token-key configuration is.

Rejected delivery alternatives:

- Database commit followed by direct MQ publish has a dual-write loss window and still needs an outbox; adding MQ does not solve the current problem.
- Sending SMTP in the request leaks timing, couples availability, and can lose the reset after a partial failure.
- Holding the outbox row transaction open over SMTP creates long locks and cannot make SMTP transactional.
- `LISTEN/NOTIFY` alone is not durable. It could later reduce poll latency only while PostgreSQL remains the source of truth.
- Redis queue/Streams conflicts with the project's deliberate no-AOF/no-RDB configuration and would lose queued mail on restart.

### SMTP and Mailpit contract

Recommend `github.com/wneessen/go-mail v0.8.1`. As of 2026-09-01 it is the current release, declares Go 1.25, supports context-aware dial/send, required STARTTLS, implicit TLS, TLS 1.2 defaults, authentication, timeouts, address validation, and message construction. It is compatible with this template's Go 1.27. Adding it will also raise the module's `golang.org/x/crypto` / `x/text` selections from the currently pinned `v0.41.0` / `v0.29.0` (`template/api/go.mod:5`) because go-mail v0.8.1 declares `x/crypto v0.54.0` and `x/text v0.40.0`; validate the whole Go suite and Argon2 behavior after `go mod tidy`.

Use explicit SMTP security modes: `starttls` (mandatory), `tls` (implicit TLS), and `none` (development only). Never offer opportunistic cleartext fallback or `InsecureSkipVerify`. RFC 8314 recommends implicit TLS on 465 and also supports correctly configured mandatory STARTTLS on 587; both require certificate validation and TLS 1.2 or later. Username/password may be optional to support trusted relays, but must be paired if configured.

Suggested supported inventory:

```text
PASSWORD_RESET_TOKEN_KEY=        # required secret, 32-byte canonical Base64URL
PASSWORD_RESET_LINK_TTL=30m
PASSWORD_RESET_RATE_LIMIT_GLOBAL_CAPACITY=30
PASSWORD_RESET_RATE_LIMIT_GLOBAL_REFILL_INTERVAL=2s
PASSWORD_RESET_RATE_LIMIT_EMAIL_CAPACITY=3
PASSWORD_RESET_RATE_LIMIT_EMAIL_REFILL_INTERVAL=20m
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURITY=none               # none only when APP_ENV=development
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_ADDRESS=no-reply@temvia.test
SMTP_FROM_NAME=Administration
SMTP_TIMEOUT=10s
MAIL_OUTBOX_POLL_INTERVAL=1s
MAIL_OUTBOX_LEASE_DURATION=30s
```

Validate host/port, sender address/name against header injection, duration bounds, TLS mode, username/password pairing, production prohibition of `none`, and secret canonical encoding at startup. Do not connect to SMTP during configuration/startup checks.

Pin local Mailpit to `axllent/mailpit:v1.31.0` (released 2026-08-22; current as of the research date). It exposes SMTP 1025 and UI 8025. Publish only the UI to loopback, e.g. `127.0.0.1:${MAILPIT_UI_PORT:-8025}:8025`; the API reaches `mailpit:1025` over the Compose network, so the SMTP port need not be host-published. Mailpit is a development catcher, can remain ephemeral, and must not become an API startup gate. The exact multi-architecture image manifest reported by Docker Hub on the research date is `sha256:c96991d9bef73594c246d89ca81411d4e916f03e76a7d2d72fa2ab5dd3c9ce24`; the repository currently pins exact version tags rather than digests, so match that convention unless the deployment policy changes.

### Password-changed notification

Insert the notification outbox row in the same transaction as password hash replacement, reset consumption, and `auth_version` increment. Render from the PostgreSQL change timestamp. The mail contains no password, password hash, reset link/token, session identifier, IP address inferred through untrusted proxy headers, or internal failure data. It should state that the password changed, include the UTC time (and optionally a localized display time), and tell the recipient to contact their administrator if it was unexpected.

The server currently stores no user locale; the only preference is browser-local. To meet the localized-email acceptance criterion without inventing an account preference, include a strict `locale: "en" | "zh-CN"` field in recovery/reset requests from the current i18next locale, snapshot it in reset/outbox state, and use a documented default. This is presentational and not authority. An attacker can choose the language of a rate-limited recovery email; storing an account locale later would remove that nuisance but belongs to user management.

### Safe invalidation of all Redis sessions

Do not use `KEYS`, `SCAN` plus `HGET`, or a user session set as the sole revocation guarantee. Redis documents that `SCAN` has limited guarantees while the keyspace changes; a concurrent login can also create a session after a scan passes. A user-index set improves cleanup but still cannot atomically coordinate a PostgreSQL password commit with Redis.

Add `auth_users.auth_version bigint NOT NULL DEFAULT 1 CHECK (auth_version > 0)` and carry it as a non-public field in `domain.Account` / an authenticated-account result. Login reads the version together with the password hash and passes it into `SessionStore.Create`. Redis stores it in the session hash. `ResolveAndTouch` returns both `user_id` and stored version. PostgreSQL current-user lookup returns the public user and current version. Any mismatch is unauthenticated and the presented Redis key is best-effort deleted.

Password reset locks the user row, changes the hash, and increments `auth_version` in one PostgreSQL transaction. This closes the important race: a login that verified the old password before reset but creates its Redis session after the reset still carries the old version and cannot authorize. No cross-datastore transaction is needed. Old hashes can remain until their existing 30-minute idle/12-hour absolute TTL; they are no longer authority. A successful reset response should clear the caller's session cookie if present, but must not create a new session.

This design depends on every authenticated action using the shared authentication path that performs the PostgreSQL version comparison. The current `/me` path already reads PostgreSQL after Redis, but future authorization middleware must preserve that invariant. Treat sessions without a version (created before deployment) as malformed and unauthenticated; rollout therefore logs out existing users, which is acceptable and should be documented/tested.

### HTTP/UI contract and tests

Suggested endpoints:

- `POST /api/auth/password-reset-requests` with strict `{email, locale}` -> generic `202 {status:"accepted"}`.
- `POST /api/auth/password-resets` with strict `{token, password, locale}` -> `204`, clears any presented session cookie, no automatic login.

Use one invalid-token problem for malformed, unknown, expired, used, and superseded tokens; keep new-password validation as `422 invalid_password`; map dependency/Argon capacity uncertainty to `503`. Both routes are unsafe, exact-Origin protected, no-store, and never advertise Basic/Bearer authentication.

Frontend routes should be `/forgot-password` and `/reset-password`. Add a login-page link, localized request/accepted/reset/success/invalid/dependency states, `autocomplete="email"` for the request, and `autocomplete="new-password"` plus confirmation for reset. Capture and clear reset fragments before React just like setup, hold them only in module memory, clear on route leave/success/invalidity, and route successful users to normal login.

Required focused evidence:

- Token unit tests: selector entropy injection, HMAC domain separation, strict canonical grammar, digest-only persistence fixtures, deterministic reconstruction, wrong key/digest failure, single use, expiry, supersession, replay, and constant-size compare.
- Application tests: known/unknown/throttled byte-equivalent accepted responses and timer targets, dependency failures, Argon preflight/hash/revalidation ordering, no auto-login, notification enqueue, and old-login/reset race.
- PostgreSQL integration: migration up/down and expected-version sync, reset+outbox atomicity, conditional unknown-account no-op, concurrent latest-token replacement, one-winner concurrent consumption, password/version/notification atomicity, lease contention with multiple consumers, expired lease recovery, and cleanup.
- Redis integration: version field and TTL, old/missing/malformed version rejection, old login created after reset rejection, outage/recovery semantics, and hashed finite recovery-limiter keys.
- Dispatcher tests with a fake SMTP port: retry classification, backoff/jitter bounds, conditional lease updates, shutdown, expired/superseded cancellation, permanent dead-letter, no secret/error leakage, and stable Message-ID/body across retry.
- Mailpit integration/e2e: inspect a real reset mail via Mailpit API, extract fragment link, complete reset once, verify old password/all old sessions fail, explicitly log in with new password, and inspect a separate localized password-changed message containing time but no credential/password.
- Generator tests: update source preflight and independent inventories, pack the real npm artifact, generate with a non-seed module path, compare bytes, run Go/admin gates, build images, and exercise the forwarded same-origin browser flow.

### External references and current versions

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — consistent message/timing, async side channel, abuse controls, random long single-use expiring tokens, trusted reset URL, no-referrer, notification, explicit login, and session invalidation.
- [Go `crypto/rand`](https://pkg.go.dev/crypto/rand) — CSPRNG contract for selectors and lease IDs.
- [Go `crypto/hmac`](https://pkg.go.dev/crypto/hmac) and [Go `crypto/sha256`](https://pkg.go.dev/crypto/sha256) — domain-separated verifier derivation and timing-safe MAC comparison / 32-byte digests.
- [PostgreSQL 18 `SELECT` locking clause](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE) — `FOR UPDATE SKIP LOCKED` is specifically appropriate for queue-like consumers.
- [Redis `SCAN`](https://redis.io/docs/latest/commands/scan/) — concurrent iteration has limited guarantees, so it cannot prove complete revocation.
- [Redis scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/) — current session create/touch scripts are atomic within Redis but cannot be atomic with PostgreSQL.
- [RFC 5321 SMTP reply semantics](https://datatracker.ietf.org/doc/html/rfc5321#section-4.2.1) — `4yz` is transient/retryable and `5yz` is permanent; clients act on reply codes, not text.
- [RFC 8314 email submission TLS](https://datatracker.ietf.org/doc/html/rfc8314#section-3.3) — implicit TLS 465 preference, mandatory STARTTLS 587 transition support, certificate validation, and TLS 1.2+.
- [`github.com/wneessen/go-mail` v0.8.1 docs](https://pkg.go.dev/github.com/wneessen/go-mail@v0.8.1), [release](https://github.com/wneessen/go-mail/releases/tag/v0.8.1), and [go.mod](https://raw.githubusercontent.com/wneessen/go-mail/v0.8.1/go.mod) — current compatible SMTP/MIME client and transitive version impact.
- [Mailpit Docker documentation](https://mailpit.axllent.org/docs/install/docker/) and [v1.31.0 release](https://github.com/axllent/mailpit/releases/tag/v1.31.0) — official local SMTP/UI ports and current image version.
- [RFC 5322 Message-ID](https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.4) — globally unique message identifiers; use stable outbox-derived IDs across retries.

### Related specs

- `.trellis/spec/backend/authentication-contract.md` — must be extended for recovery HTTP, token, outbox, SMTP, versioned-session, and configuration contracts.
- `.trellis/spec/backend/database-guidelines.md` — direct SQL, PostgreSQL time, external migration, transaction and schema-version rules apply.
- `.trellis/spec/backend/error-handling.md` — add stable recovery problem types/codes without exposing account or dependency details.
- `.trellis/spec/backend/logging-guidelines.md` — extend redaction to reset selectors/verifiers/links, token key, SMTP credentials, recipients, and SMTP response text.
- `.trellis/spec/backend/quality-guidelines.md` and `.trellis/spec/backend/scaffolding-contract.md` — inventories, packed/generated bytes, integrations, and image/version agreement apply.
- `.trellis/spec/frontend/type-safety.md`, `.trellis/spec/frontend/state-management.md`, `.trellis/spec/frontend/hook-guidelines.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/quality-guidelines.md` — typed API parsing, memory-only authority, no blind mutation retry, i18n/accessibility, and generated browser checks apply.

## Caveats / Not Found

- No current user locale exists in PostgreSQL. Localized email requires the bounded request-locale snapshot recommended above, bilingual mail, or a later account-preference contract.
- No trusted proxy/client-IP contract exists. Do not add an IP limiter using raw `X-Forwarded-For`; the proposed MVP uses global plus per-canonical-email limits. Add trusted-proxy parsing/CAPTCHA only in a separate abuse-hardening task.
- No support contact/product branding configuration exists. Notification copy can say “contact your administrator,” but must not invent a URL, company name, or logo.
- PostgreSQL and SMTP cannot provide exactly-once delivery. A stable Message-ID reduces duplicate impact but does not guarantee recipient-side deduplication.
- Latest-token supersession matches the PRD but allows nuisance invalidation of an older link by someone who knows the email; rate limiting limits frequency, not possibility.
- PostgreSQL `auth_version` guarantees that stale sessions are unusable, not that every stale Redis hash is physically absent immediately. Physical deletion can be added as best-effort cleanup, but must never replace the version check.
- The suggested rate limits, timing target, retry schedule, lease, and retention values are secure starting points, not measured production capacity. Benchmark response paths and SMTP behavior before freezing them in stable specs.
- `go-mail v0.8.1` is compatible with Go 1.27 but upgrades the project's selected `x/crypto` and `x/text`; that transitive change needs `go mod tidy`, full tests, and explicit lockfile review during implementation.
