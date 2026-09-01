# Forgot password flow

## Goal

Allow a user who has lost their password—especially the sole initial
administrator—to regain access through their login email without disclosing
whether an account exists.

## Background and confirmed facts

- The generated application currently supports initial-administrator setup,
  email/password login, current-session lookup, and logout, but has no account
  recovery path.
- Email is already the canonical login identifier. The user previously chose
  email in part because it can also serve as the recovery channel.
- Authentication is a clean/hexagonal module with PostgreSQL-backed users,
  Redis-backed opaque sessions and rate limits, Argon2id password hashing,
  RFC 9457 Problem Details, and strict Origin and JSON handling.
- Resetting a password requires a new way to revoke all sessions belonging to
  the affected user; the current session port can revoke only the presented
  session.
- The template has no email-delivery adapter, email configuration, local mail
  catcher, reset-token storage, or password-recovery UI.
- `.env.example` is the complete supported configuration inventory, and
  Compose is the reference local runtime.

## Key decisions and constraints

- Production email delivery will use a provider-neutral SMTP contract. The
  reference local environment will include Mailpit for inspecting messages.
- A successful password reset will revoke all of the account's existing
  sessions and will not create a new authenticated session. The user must log
  in explicitly with the new password.
- A successful password reset will also send a security-notification email.
  That message must not contain the password or any recovery credential.
- Email work will be persisted in a PostgreSQL transactional outbox and
  delivered by an in-process background dispatcher. A standalone message
  broker and separate mail worker are intentionally not part of this milestone.
- Adding the durable authentication version to sessions will intentionally
  invalidate sessions created by an older API once at deployment; users sign
  in again normally.

## Requirements

- Add a public recovery-request flow that accepts an email address and returns
  the same observable result whether or not that account exists.
- Keep both the public response fields and normal response timing independent
  of account existence; SMTP delivery must not occur on the request path.
- Add a provider-neutral SMTP delivery adapter and documented SMTP
  configuration; add Mailpit to the reference development Compose stack.
- Atomically persist each mail job with the password-recovery state that
  requires it, then deliver outside the HTTP request with bounded retries,
  leasing, expiry, cleanup, and graceful shutdown behavior.
- Deliver a link to the account email when a matching account exists.
- Use a cryptographically strong, opaque, single-use reset credential with a
  bounded lifetime; persist only its non-authorizing public selector and a
  one-way digest of its secret verifier, never a usable raw credential.
- Add a reset-completion flow that validates the credential, applies the
  existing password-creation policy, and replaces the Argon2id password hash.
- Revoke every existing session for the account after a successful password
  reset so the new password becomes the only recovery authority, and clear the
  presented browser session cookie if one exists.
- After a successful reset, show a localized confirmation and direct the user
  to the normal login flow without automatically authenticating them.
- Send a password-changed notification to the account email after a successful
  reset, including the change time but no password or reset credential.
- Rate-limit recovery requests without storing raw canonical email values in
  Redis keys or logs.
- Keep unsafe API routes behind the existing exact-Origin policy and keep all
  recovery responses non-cacheable.
- Add localized Simplified Chinese and English admin UI for requesting a reset
  and choosing a new password, including loading, success, invalid/expired-link,
  validation, and dependency-failure states.
- Extend API, adapter, integration, frontend, end-to-end, configuration,
  generator-inventory, and generated-project verification coverage in line
  with the existing contracts.

## Out of scope

- General user-management CRUD, role/permission design, invitations, and
  account disablement.
- A standalone message queue, separate mail-worker deployment, or a general
  application event bus.
- Changing the existing email identity rules or password policy.
- Email-address verification or changing a user's email address.

## Acceptance Criteria

- [ ] From the login page, a signed-out user can request recovery for a validly
  shaped email and always sees the same accepted state for known and unknown
  accounts without waiting for SMTP delivery.
- [ ] A known account receives a link under `APP_PUBLIC_URL`; the raw reset
  credential is absent from PostgreSQL, Redis keys, and logs.
- [ ] A valid, unexpired, unused link lets the user set a policy-compliant new
  password exactly once.
- [ ] Replayed, malformed, expired, or superseded links cannot change a
  password and produce one stable, localized invalid-link experience.
- [ ] After success, all sessions created before the reset are unusable, the
  old password no longer works, the presented cookie is cleared, no session is
  created automatically, and the new password can create a fresh session
  through the normal login flow.
- [ ] Sessions without the new authentication-version field fail closed after
  deployment, producing a one-time logout rather than bypassing revocation.
- [ ] A successful reset sends a separate localized password-changed security
  notification with the change time and no password or recovery credential.
- [ ] A temporary SMTP outage neither blocks recovery-request HTTP responses
  nor loses committed mail jobs; delivery is retried, duplicate delivery is
  safe, and expired work is cleaned up.
- [ ] Recovery throttling, dependency failures, strict request parsing, Origin
  precedence, and Problem Details mappings have automated coverage without
  account-enumeration differences in public success fields or normal response
  timing.
- [ ] The reference local environment provides a practical way to inspect a
  reset email, and the production delivery configuration is documented in
  `.env.example` and the generated README.
- [ ] Template source, packed package, generated project, API/admin tests, and
  the real browser recovery flow pass the project quality gates.
