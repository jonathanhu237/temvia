# Initial Administrator and Login Planning Evidence

Date: 2026-08-29. Read-only product inspection and primary-source research. Accepted decisions are identified by requirement references; other mechanisms below remain recommendations for discussion, not accepted architecture or implementation authorization.

## Repository Constraints

- `template/api/cmd/server/main.go` only supplies `GET /health`; `template/api/go.mod` currently has no third-party dependencies.
- `template/admin/package.json` currently includes React and React DOM but no routing or authentication library. `template/admin/vite.config.ts` has no API proxy, and the frontend is an independent package.
- `.trellis/spec/backend/scaffolding-contract.md` describes the initial database-free starter. Adding persistence will require an explicit contract update and generated-project validation.
- `.trellis/spec/frontend/quality-guidelines.md` currently preserves the official Vite demo and its independent baseline inventory. The requested setup/login pages require a deliberate customization boundary and coherent source, package, and generated-output tests; do not overwrite upstream baseline hashes from changed files.

## Proposed Initialization Safety Properties

These are design recommendations inferred from the requested first-administrator flow, not claims that OWASP prescribes this specific bootstrap protocol.

- An empty database alone does not prove that a visitor owns the deployment. Following the comparison in `bootstrap-project-comparison.md`, the user accepted a temporary initialization link supplied through the deployment terminal; see R11 in `../prd.md`. Never return its credential from a public status endpoint or embed it in frontend assets. Exact issuance, storage, rotation, transport, and expiration still need design discussion.
- Treat initialization as an explicitly persisted one-time transition. Creating the administrator and marking setup complete must succeed together; concurrent requests must not create multiple initial administrators. Failure must not leave a locked, partially initialized installation.
- Do not infer initialization permission from an empty users table after setup. Account deletion or restart must not silently reopen a public administrator-creation endpoint.
- Database or API failures must be distinguished from an uninitialized instance. The UI should show an error/retry state, and the server should refuse setup when it cannot establish the authoritative state.
- A setup-complete backend must reject further setup requests regardless of frontend route visibility. The accepted initialization-link credential must no longer authorize initialization after completion.

### Initialization Link Lifecycle: Accepted under R59 and R62

R59 defines token handling and atomic setup completion; R62 supersedes only its earlier command-based issuance trigger. The generated project's ordinary API start performs issuance after the separate migration step and schema-readiness check. It requires a configured trusted public URL, refuses once setup is durably complete, and never derives the link origin from a request `Host` header. OWASP's reset-token guidance is not a specification for bootstrap flows, but its transferable secret-handling properties support cryptographically random, sufficiently long, securely stored, expiring, single-use tokens and trusted HTTPS URL construction. See [OWASP URL-token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#url-tokens).

An uninitialized API start generates 32 bytes with Go's cryptographically secure random source and encodes them as unpadded URL-safe Base64. It writes the complete link once to deployment logs and persists only a SHA-256 digest plus the configured expiration in PostgreSQL; `SETUP_LINK_TTL=30m` is the safe initial value in `.env.example`, while exact validation bounds remain design work. The unsalted digest is appropriate only because the input is a uniformly random 256-bit secret; it is not a password-hashing precedent. There is at most one current token: restarting before completion atomically replaces the digest and invalidates the earlier link. An expired token is rejected; restarting the still-uninitialized API renews it. Once setup completes, later startup cannot create or print another token.

The accepted URL form is `${APP_PUBLIC_URL}/setup#token=<base64url>`. RFC 3986 specifies that a fragment is separated before dereferencing and handled by the user agent, so it is not sent as part of the HTTP request URL. The frontend reads the fragment once, immediately removes it from the displayed URL and current history entry, retains it only in memory, and supplies it in the HTTPS setup POST body; request bodies and secrets must not be logged. Reloading after removal loses the in-memory token and requires reopening the link. See [RFC 3986 section 3.5](https://www.rfc-editor.org/rfc/rfc3986#section-3.5). This follows the relevant shape found in PocketBase's inspected 30-minute fragment-based installer link, while Temvia's lifecycle is defined by R59; see `bootstrap-project-comparison.md`.

Successful setup atomically validates and consumes the current token, creates exactly one initial administrator, and durably closes initialization. Ordinary form-validation errors do not consume the token so the operator can correct input before expiry. Concurrent valid submissions cannot both create administrators. Only R62's one-time uninitialized-start log entry may disclose the credential; public status endpoints, browser assets, request logs, diagnostics, and later routine logs must not. Exact public-URL validation, TTL bounds, persistence schema, endpoint error contracts, multi-instance serialization, and startup/log failure handling remain design work.

### Setup Trigger and Packaging: Accepted under R62

The current template has one `cmd/server` executable whose no-argument behavior starts HTTP. The assistant initially proposed two explicit subcommands, then simplified that to preserving server startup plus one `setup-link` operation. The user correctly challenged the premise because Temvia is a project-template generator, and the placeholder `temvia-api` name blurred Temvia's generation-time responsibility with the generated application's deployment-time behavior. Both command proposals are rejected.

The setup credential cannot be created by the Temvia scaffolding CLI: project generation may precede deployment by an arbitrary interval, and the generator has neither the deployed PostgreSQL state nor the final public URL. The setup page and administrator creation remain features of the generated application after deployment.

The user accepted automatic issuance by the generated project's normal API process after it confirms schema readiness and durable incomplete-setup state. Startup atomically replaces any previous current token, logs the new short-lived link once, and continues serving HTTP. A completed installation never reopens. Restarting an incomplete API renews the link and invalidates the earlier one. This avoids additional runtime CLI behavior but places the bearer credential in deployment logs and makes restart the renewal operation, so access to those logs is deployment authority. Exact startup failure/concurrency handling remains design work. R23/R54 still keep schema migration in the independent migrate image, and Temvia performs only project generation.

## Authentication Recommendations and Primary Sources

- Store password hashes with a suitable password hashing algorithm and unique salts, never plaintext or fast general-purpose hashes. The user accepted Argon2id under R29 and golang.org/x/crypto/argon2 with project-owned integration under R30; work factors, storage format, resource limits, and deployment measurements remain unresolved. The comparisons and accepted implementation boundary are in `password-storage-options.md`. [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- The user accepted server-side sessions with an opaque HttpOnly cookie under R31. Use HTTPS and appropriate Secure and SameSite cookie attributes; also plan explicit CSRF defenses. SameSite and HttpOnly are not complete CSRF/XSS solutions. Resolve local-development exceptions, origins, expiration, and login session rotation; logout must invalidate the server-side session and clear the cookie as explained in the accepted flow. [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- Plan throttling for credential and setup-secret attempts, non-enumerating login errors, and safe logging without credentials or session secrets. [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- Persistent account data is needed to avoid recreating the administrator on restart. The user accepted Redis session storage under R32, its routine-restart continuity behavior under R33, primary AOF persistence under R34, and appendfsync everysec under R35. PostgreSQL account persistence and Redis session durability remain separate concerns; concrete recovery handling is not yet selected.

## Session Mechanism Decision and Comparison

The current milestone is a browser admin calling one Go API. No requirement for independently verifying credentials across multiple services has been established. The user accepted server-side sessions with an opaque HttpOnly cookie under R31 and observed that JWT is unnecessary with this choice. No JWT issuance, verification, or JWT access/refresh-token infrastructure is selected for this flow.

Cookie transport and JWT format are separate choices: a JWT can also be placed in a cookie. This earlier clarification was not a proposal to combine both mechanisms. The selected cookie carries an opaque random credential resolved against server-side state, not a JWT. The comparison below explains the alternative signed-claims approach. See [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html).

| Approach | Trade-off for this milestone |
| --- | --- |
| Server-side session, accepted under R31 | The browser holds an unpredictable identifier; the server resolves the user and expiration from session state. Revoking the record can reject subsequent requests immediately. Protected requests require a session-store lookup and depend on that store's availability. |
| Signed JWT carrying claims | APIs can validate signatures and required claims locally without a per-session lookup. Immediate revocation still needs additional state or coordination; deleting a browser's copy does not invalidate other copies of an otherwise valid token. Short expiration limits exposure but does not itself provide immediate revocation. |

Sources: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP REST security: JWT](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html#jwt).

Accepted flow under R31: successful explicit login creates a fresh authenticated session and sets its cookie; protected requests validate that session; logout invalidates it on the server and clears the cookie. HttpOnly restricts JavaScript access to the credential, not malicious requests from an XSS-compromised page. HTTPS, Secure/SameSite settings, CSRF defense, and frontend/API origins still require a concrete contract.

Session storage follows R32, Redis restart behavior follows R33, server-side lifetime follows R38, and non-persistent cookie behavior follows R39. Implementation package and authenticated landing remain separate decisions. Detailed cookie policy beyond the accepted HttpOnly transport and persistence behavior remains unresolved. This decision applies to browser authentication and does not narrow the Go API's general-backend role.

### Session Storage Decision: Redis

The assistant initially proposed PostgreSQL session storage to avoid another service dependency. The user requested Redis infrastructure, reconsidered necessity, and challenged deferral because the general backend may need high concurrency later. After discussing both approaches, the user accepted Redis session storage from the first milestone and its operational cost under R32. PostgreSQL retains account and initialization-completion state; its proposed session store was never accepted.

PostgreSQL sessions were the smaller-infrastructure alternative. The selected Redis approach is an early infrastructure investment for the already required session workload, rather than an optimization justified by a measured bottleneck. Future capacity still needs validation. No numerical load target, concrete cache workload, shared-counter requirement, or selected Redis-dependent worker framework has been established, and no benchmarks have run.

Database-backed sessions are an established alternative: [Django 5.2's session documentation](https://docs.djangoproject.com/en/5.2/topics/http/sessions/#configuring-the-session-engine) specifies database storage as the default. This is a concrete counterexample to Redis being required for session management, not evidence about the numerical prevalence of Redis across applications or a proposal to use Django in Temvia.

The unselected PostgreSQL design would incur a session lookup on protected requests and require expired-record cleanup. A shared database can hold sessions for multiple API processes; multiple processes alone do not establish a Redis requirement. This comparison does not authorize implementing a second store. With Redis selected, keep storage responsibilities separate from login behavior and enforce session validity independently of any eventual physical cleanup.

The user chose to prepare the Redis session infrastructure now, weighing TTL support and avoiding a later store transition against another service's configuration, client, resource limits, and failure handling. This does not authorize cache or shared-counter workloads. Familiarity or a deliberate infrastructure-learning goal must not be invented as requirements.

### Future Concurrency: Scope of the Benefit

Personal project ownership does not imply permanently low traffic. The user's concern is legitimate, but it does not specify a peak request rate, simultaneous login rate, latency objective, or high-availability requirement. Do not invent those targets or claim that either candidate already meets them.

The selected Redis design will put session reads/writes outside PostgreSQL and provide shared session state and key expiration from the outset. It avoids implementing the proposed PostgreSQL session schema and later transitioning that store. PostgreSQL still retains account and initialization-completion data. Shared sessions are not exclusive to Redis; the PostgreSQL alternative can also support multiple API processes. See [Redis session store guidance](https://redis.io/docs/latest/develop/use-cases/session-store/).

Distinguish frequent authenticated API requests from password-verification traffic: Redis can handle the former's session lookup but does not execute or remove Argon2id's CPU/memory work. Business SQL, transaction contention, downstream calls, and resource limits remain independent capacity concerns. This is architectural reasoning, not a measured bottleneck diagnosis. See [Go Argon2 API](https://pkg.go.dev/golang.org/x/crypto/argon2) and [Redis latency guidance](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/).

R32 selects Redis for sessions, R33 selects restart continuity and conservative fault-recovery behavior, and R34 selects primary AOF persistence; concrete outage, recovery, remaining persistence settings, and memory mechanisms still require design. These decisions do not authorize speculative cache/queue features or Sentinel/Cluster deployment, and one Redis instance is not itself a high-availability design. Implement the selected store only; do not add a second live PostgreSQL session store or an automatic fallback merely for hypothetical future flexibility.

With Redis selected as the session store, resolve these operational consequences:

- Session state in Redis is authentication state, not a disposable cache with a transparent PostgreSQL fallback. If the store cannot validate a session, protected requests must not bypass authentication. Distinguish temporary dependency failure from an absent or expired session.
- Redis key expiration can support TTL-based cleanup. The implementation must set data and expiry safely and preserve the eventual idle/absolute lifetime contract; a cleanup mechanism alone does not define that contract. See [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/).
- Redis supports RDB snapshots, AOF, their combination, or disabled persistence. Restart outcomes depend on the chosen policy and available files; do not claim all Redis restarts necessarily erase sessions or that persistence eliminates all loss. Missing session records require a fresh login once the service is available; PostgreSQL account data must remain intact. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
- Memory-pressure eviction can remove a live session before its intended expiry. `noeviction` instead rejects relevant writes when memory is exhausted; it does not remove capacity planning. If Redis later also serves caches, revisit workload isolation and eviction policy. See [Redis key eviction](https://redis.io/docs/latest/develop/reference/eviction/).

Hosting in the accepted Compose deployment, client/package selection, remaining persistence settings, memory policy, and outage/recovery mechanisms still need concrete design under R32/R33/R34. No cache, queue, Redis-based limiter, or high-availability topology is added merely because Redis is selected.

### Redis Restart Behavior: Accepted under R33

The user accepted preserving still-valid sessions across routine Redis restarts when the browser retains its cookie, with conservative invalidation and a fresh login when safe recovery cannot be established after a fault. R33 records this behavior; it must not be conflated with restarting only the Go API or closing the browser. After discussing memory-based operation versus disk-based recovery, the user accepted primary AOF persistence under R34.

Without persistence or another recovery source, restarting the Redis process loses its in-memory sessions. Redis supports RDB snapshots and AOF write replay, so persistence can support retaining sessions across restarts. Container replacement additionally requires retaining and reusing the storage holding those files. AOF and everysec are selected under R34/R35; supplementary RDB snapshots, volume configuration, and cookie lifetime remain unresolved. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

Persistence does not guarantee zero loss: lost recent changes can include session creation, renewal, or revocation. The recovery design must not assume that restoring older session data preserves logout guarantees. A concrete durability policy is not a complete solution until uncertain or stale recovery can safely invalidate sessions. Availability during Redis downtime remains separate from recovery after it returns; no persistence choice authorizes bypassing authentication.

Redis continues to serve data from memory with persistence enabled. RDB captures a point-in-time snapshot; AOF records state-changing operations for replay at startup. Neither makes the runtime dataset independent of RAM. The user accepted AOF as the primary session-recovery mechanism under R34 after discussing this distinction; fsync frequency subsequently follows R35. Log writes, synchronization, and rewrite management remain operational costs. This is not a zero-loss guarantee or a decision to disable supplementary RDB snapshots. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

### AOF Synchronization Policy: Accepted under R35

Writing to an operating-system buffer is distinct from synchronizing to durable storage. Redis offers these policies:

| Policy | Tradeoff |
| --- | --- |
| `always` | Synchronizes writes before acknowledging them, with batching possible; stronger durability at a latency cost. |
| `everysec` | Background synchronization roughly once per second; a compromise that can lose recent changes after a fault. |
| `no` | Leaves synchronization to the operating system, with less explicit durability control. |

See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/). Slow disks and synchronization delays affect behavior; do not turn the nominal interval into an unconditional one-second loss bound. See [Redis latency](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency/).

The user accepted `everysec` under R35 after this comparison and the lost-revocation caveat. In this application, a lost session deletion could restore a logged-out credential; successful AOF loading does not establish that no revocations were lost. The accepted policy therefore still requires recovery-design work satisfying R33, not a claim that persistence alone preserves authentication safety. Exact detection and invalidation mechanisms remain open.

### Logout Durability Confirmation: Accepted under R36

The user accepted waiting for local AOF confirmation of session revocation through `WAITAOF` before reporting successful logout under R36, while retaining R35's global `everysec` policy. This trades additional logout latency and connection-handling work for stronger evidence that a reported revocation survived the ordinary synchronization window. Redis 7.2 or later is required; the exact release, timeout, retry details, and failure UX remain open. A failed or timed-out confirmation must not be reported as successful server-side revocation.

Redis 7.2 introduced `WAITAOF`. It can wait for earlier writes on the same connection to be fsynced locally; the caller must check the returned acknowledgement count even when there is no command error. Waiting is ineffective inside a blocking-disallowed context such as a transaction or script. See [Redis WAITAOF](https://redis.io/docs/latest/commands/waitaof/).

Integration constraints for the accepted mechanism, with implementation still unapproved:

- Use the same uninterrupted connection for revocation and a bounded local confirmation wait; do not silently retry only the wait on a new connection or claim success after a timeout. Avoid an infinite wait.
- Design idempotent retries, including a deletion that returns no matching key after an earlier unconfirmed attempt. A missing key on a different connection must not be assumed to establish durability of the earlier deletion.
- Ensure concurrent renewal cannot recreate a revoked session. Client-cookie clearing, error responses, and retry UX need an explicit contract; local cookie removal alone does not confirm server revocation.
- This is not a safe-backup-restore protocol, a solution to physical storage loss, or a high-availability design. R33's conservative invalidation requirement still applies when recovery is uncertain; no automatic failure detector or manual recovery command has been selected.

For later recovery design: Redis's normal shutdown sequence flushes AOF, but sending a shutdown request does not prove it completed successfully; error/forced-exit cases must remain distinct. See [Redis SHUTDOWN](https://redis.io/docs/latest/commands/shutdown/). `INFO` exposes a server `run_id` and persistence status, useful evidence rather than proof that all historical revocations were retained. See [Redis INFO](https://redis.io/docs/latest/commands/info/).

### Authenticated Session Lifetime: Accepted under R38

The user accepted two server-enforced limits under R38:

- A 30-minute idle timeout, extended by accepted authenticated activity. It limits an unattended session's lifetime but can interrupt work after inactivity; frontend background polling must not accidentally keep a session alive indefinitely.
- A 12-hour absolute timeout measured from session creation and never extended by activity. It bounds a continuously used or stolen session at the cost of requiring login again during unusually long work periods.

OWASP recommends both idle and absolute timeouts and emphasizes server-side enforcement; its example ranges depend on application risk and normal usage rather than defining universal values. See [OWASP session expiration](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#session-expiration). The accepted numbers are Temvia tradeoffs for a privileged administrator that may be deployed publicly, not quoted OWASP defaults.

Redis expiry can support cleanup, but the session record must retain immutable creation/absolute-expiry data rather than allowing TTL refresh to extend the absolute deadline. Expiry and invalidation must be enforced even if the browser retains a cookie. Cookie persistence follows R39 and periodic session-ID renewal scope follows R40; what activity refreshes idle time, client expiry warnings, and exact clock/race behavior remain separate design decisions.

### Cookie Persistence Across Browser Closure: Accepted under R39

The user accepted a non-persistent authenticated cookie under R39: omit `Max-Age` and `Expires`, while still applying R38's server-side deadlines. This reduces intentional browser storage beyond the browser session, at the cost of requiring login again when the browser actually discards the cookie.

Closing a browser is not a reliable server-side logout event. Browsers define when a session ends, and session restoration can retain session cookies, so neither the product contract nor security tests may promise that every window or process close removes the cookie. See [MDN cookie lifetime](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#removal_defining_the_lifetime_of_a_cookie). Do not add an unreliable unload-event logout request as a substitute. Explicit logout remains the reliable user action under R31/R36, and the server rejects expired sessions under R38 regardless of client storage.

### Periodic Session-ID Renewal: Deferred under R40

The user accepted creating a fresh unpredictable Session ID after explicit credential verification at login but not rotating it periodically during an authenticated session in the first milestone. R38's 30-minute idle and 12-hour absolute deadlines plus explicit logout provide bounded lifetime and revocation.

Periodic renewal can reduce how long a copied static ID remains useful, but it introduces an overlap window, concurrent-request races, old-ID invalidation, cookie replacement, and additional Redis durability interactions. An attacker actively using the credential and receiving replacement cookies may follow a renewal, so the mechanism is additional protection rather than a complete theft remedy. OWASP describes it as an additional mechanism and notes a potential race during renewal. See [OWASP renewal timeout](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#renewal-timeout). The accepted deferral means an active stolen credential can remain usable until logout, idle expiry, or the absolute deadline. A future renewal design would require explicit concurrency and failure semantics rather than a simple TTL refresh.

### Frontend/API Public Origin: Accepted under R41

Repository evidence: `template/admin/vite.config.ts` currently binds the development frontend to `127.0.0.1` and prefers port 5173 with fallback, while `template/api/cmd/server/main.go` defaults the API to `127.0.0.1:8080`. Searches found no Vite proxy, API base URL, CORS policy, or browser API calls. The existing ports describe independent development processes, not an accepted production-origin contract.

The user accepted one public production origin under R41: serve the admin at `/` and forward `/api/*` to the independent Go API through a reverse proxy or gateway. The frontend and API remain separately generated and internally deployable under R03; sharing an external origin does not make the Go API admin-specific or prevent non-browser clients from calling it. Exact public hostname and gateway technology are not selected.

Benefits and costs:

- Browser calls use relative `/api` URLs. Session cookies do not require credentialed cross-origin requests, and the production CORS allowlist can remain absent unless a separately approved browser client needs it.
- Local development can retain separate processes while Vite proxies `/api` to the local Go API, so the browser still observes one frontend origin. Vite's fallback port behavior remains intact.
- Production gains another deployment component responsible for TLS, static frontend delivery/routing, and API forwarding. This is operational work, and the API must still validate Host/origin and apply explicit CSRF protection; same-origin routing does not make cookie-authenticated state changes automatically safe.

The unselected alternative is separate public origins for admin and API. That preserves the same code independence but requires an explicit credentialed CORS contract and origin-specific cookie/fetch behavior. No requirement currently benefits from that browser complexity. R41 does not select Caddy, Nginx, Traefik, or an API gateway.

## Login Identifier Decision

Repository inspection found no existing account fields or login UI contract. The assistant initially proposed username and password to avoid requiring an address in a flow with no mail features. The user instead selected email and password on 2026-08-29, initially citing familiarity and then clarifying that simpler forgotten-password recovery is a concrete benefit they value. R26 records the selection and rationale; the username proposal was never accepted. No claim about the numerical majority of current products is established or needed for this product preference.

Using an email-shaped identifier alone does not require SMTP or prove mailbox ownership. OWASP distinguishes email-format validation, consistent address comparison, and mailbox-ownership verification, and generally recommends verifying ownership before activating an account. Format validation must not be represented as proof of ownership. Exact normalization, uniqueness, and validation rules remain to be designed; do not silently choose provider-specific address transformations. [OWASP email validation and verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html), [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#usernames)

### Email Ownership Verification: Deferred under R42

The user accepted deferring email sending and mailbox-ownership verification for this personal-use first-administrator flow, treating the entered email only as an unverified login identifier. The user explained future recovery as a reason for email but explicitly deferred the recovery feature under R27. Initialization remains authorized through R11's deployment-issued link, which establishes setup authority rather than mailbox control; public self-registration is still excluded. The first milestone therefore has no mail service, verification message or token, or activation/verification state, and neither its UI nor API may claim the address is verified. An address typo cannot be recovered through email in this milestone. A future email-recovery design must establish mailbox ownership rather than inheriting an unverified setup assumption.

### Email Normalization and Comparison: Accepted under R43

The mailbox domain is case-insensitive, while SMTP formally requires the local part to be treated as case-sensitive even though exploiting that distinction is discouraged because it harms interoperability. This means lowercasing the whole address is a deliberate product identity rule, not a claim about every mail server. See [RFC 5321, mailbox semantics](https://www.rfc-editor.org/rfc/rfc5321.html).

OWASP recommends defining one normalization policy before storage and comparison, retaining the original address together with a canonical value, lowercasing the domain, and avoiding provider-specific transformations such as Gmail dot removal. It also recommends a tested parser or library rather than a custom expression that attempts to reproduce all email grammar. Go's standard [`net/mail.ParseAddress`](https://pkg.go.dev/net/mail#ParseAddress) parses a single RFC 5322 address but also accepts display-name forms, so using it for this login identifier would require an application wrapper that rejects input such as `Alice <alice@example.com>` and requires one plain mailbox. See [OWASP email validation and verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).

The user accepted a deliberately simple first-version contract under R43: trim outer whitespace; accept ASCII mailbox syntax only; preserve the trimmed form for display and possible future delivery; derive a lowercase canonical value for login and uniqueness; and do not remove dots, plus tags, or apply other provider-specific rewrites. A database uniqueness constraint targets the canonical value, and setup and login must derive it identically. This avoids case-only duplicate administrators and makes login behavior unsurprising for this product, at the cost of merging the rare mailboxes that differ only by local-part case and excluding internationalized addresses. Exact parser-wrapper behavior, lengths, error messages, and schema naming remain design work rather than accepted implementation detail.

### Administrator Name: Included under R44 and Defined under R45

The user chose to add a human-readable administrator name instead of persisting only email and password. R44 records inclusion without treating that name as a login identifier, uniqueness key, authorization input, or verified legal identity. The user then found the term "display name" unnatural and accepted the revised R45 contract: the Chinese form label is "姓名", the backend concept is `name`, and the field is required during initial setup. It means the administrator's ordinary in-product name, can contain a real name or chosen form of address, and may support greetings, presentation, and future audit attribution without claiming legal-identity verification. It remains one field rather than separate real-name and nickname fields. Exact validation and later editing remain design work rather than implementation approval.

### Password Confirmation: Accepted under R46

The setup API needs one password credential and must enforce the agreed password policy independently of any frontend behavior. The user accepted browser-only confirmation under R46 as presentation-layer error prevention rather than account data or a second credential. Because forgotten-password recovery is deferred under R27 and setup is one-time, the browser compares password and confirmation before submitting only `password` to the API. Confirmation is not persisted or logged and does not expand the general API contract. The API still validates the accepted password policy independently; bypassing the browser cannot bypass that policy.

## Forgotten-Password Scope Decision: Deferred

The user's desired simplicity is the recovery experience: enter the account email, receive a reset link, and choose a new password. Email can serve as both login identifier and recovery destination. A username-based account could also recover through an associated verified email, so email as the login identifier is not technically required for recovery; it avoids a separate login name in the selected product experience.

After the assistant proposed adding mailbox verification and forgotten-password reset together, the user explicitly said not to handle the recovery flow yet on 2026-08-29. R27 records the deferral. The email decision remains accepted; the reason for that decision was not a request to build its future recovery benefit now. Do not add reset UI, endpoints, tokens, or recovery-mail integrations in this milestone. Initial mailbox-ownership verification was subsequently deferred under R42.

For future reference only, OWASP's reset guidance supports random, securely stored, expiring single-use reset credentials; consistent responses for existing and nonexistent accounts; request throttling; setting a new password rather than emailing a password; and a deliberate existing-session invalidation policy. Reset requests alone must not alter or lock the account. This research is not part of the current implementation scope or a selection of token formats, storage schemas, lifetimes, or session policies. Verification and recovery tokens must not be confused with the deployment initialization credential. [OWASP forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

## Current Planning Boundary

The agreed user outcome is browser-based initial-administrator creation through a deployment-issued temporary initialization link, followed by ordinary email/password login. Forgotten-password recovery is explicitly deferred. The user accepted showing completion and navigating to the login page under R28, requiring an explicit email/password login rather than automatic sign-in. Argon2id and its Go implementation boundary are selected under R29/R30; server-side sessions with an opaque HttpOnly cookie and no JWT follow R31. Redis session storage and its first-version operational cost follow R32, routine-restart continuity with conservative fault recovery follows R33, primary AOF persistence follows R34, everysec synchronization follows R35, logout durability confirmation follows R36, go-redis v9 follows R37, server-side session lifetime follows R38, non-persistent cookie behavior follows R39, periodic mid-session rotation is deferred under R40, the shared public origin follows R41, mailbox-ownership verification is deferred under R42, email normalization/comparison follows R43, inclusion of a human-readable administrator name follows R44, required `name` semantics follow R45, browser-only password confirmation follows R46, password input rules follow R47, weak-password blocklist screening is declined under R48, the Argon2id resource profile follows R49, PHC password-record storage follows R50, backend Compose delivery follows R51, pgx/go-redis release pins follow R55, database/sql pool defaults follow R56, the environment configuration contract follows R57/R58, the initialization-token lifecycle follows R59, explicit development/production behavior follows R60, first-milestone secret delivery follows R61, and automatic startup issuance with no runtime administrative CLI follows R62. Logout/recovery handling, exact parser ceiling/API, the exact x/crypto release, remaining deployment settings, login throttling, and name validation remain unresolved. See `redis-client-options.md` for the client comparison and remaining integration work. The user requires discussion of every technical choice. See `../prd.md` for authoritative accepted decisions and remaining questions; recommendations in this research do not independently authorize a selection. There is no approval to implement or to run services.
