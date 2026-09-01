# RBAC roles and user assignments

## Goal

Make the generated Temvia administration application useful for multiple
operators by allowing authorized administrators to define roles, grant known
permissions to roles, assign one or more roles to users, and have the Go API
enforce the resulting access decisions.

## Background and confirmed facts

- The generated application currently has one `auth_users` identity table and
  creates only the first administrator during setup.
- Authentication currently covers setup, login, current-session lookup,
  logout, and transactional password recovery. Sessions carry `auth_version`,
  which already provides a mechanism for invalidating stale authorization.
- The current user contract exposes only `id`, `name`, `email`, and
  `createdAt`; there is no role, permission, account-status, or authorization
  contract.
- The admin shell has one authenticated Home route and no user or role
  management surface.
- Temvia is a scaffold whose generated projects will add business modules over
  time. A permission must therefore correspond to an API enforcement point;
  an arbitrary database string is not authority by itself.
- Earlier project planning deliberately deferred user management, invitation,
  and role permissions until after password recovery. The mail outbox and
  credential-link patterns now exist and can support a later invitation flow.

## Requirements

- **R01 — Permission catalog:** The generated API defines a stable catalog of
  code-owned permissions that can be referenced by authorization checks and
  displayed by the admin. The initial catalog contains `users.read` and
  `roles.read`; generated-project modules can register future permissions.
  Custom roles may grant only current catalog permissions, receive no future
  permissions automatically, and contain at least one permission.
- **R02 — Custom roles:** An authorized administrator can list, create, view,
  rename, update, and delete custom roles and their permission grants. A role
  referenced by any user or pending invitation cannot be deleted; the request
  fails with a conflict and leaves assignments unchanged.
- **R03 — Multiple roles:** Every activated user holds one or more roles;
  effective permissions are the union of all assigned role permissions. User
  invitation and assignment replacement reject an empty role set. Account
  suspension is a future explicit lifecycle state, not an empty assignment.
- **R04 — User assignments:** An authorized administrator can list users,
  inspect their assigned roles, and replace their role assignments. Users and
  invitations are deterministically paginated; roles remain a bounded list.
- **R04A — User invitation:** An authorized administrator can invite a new user
  by name and email, select the user's initial roles, and send a one-time link
  through the existing transactional mail infrastructure. The recipient sets
  their own password; no administrator chooses or learns it. Pending
  invitations can be listed, explicitly resent with replacement authority, or
  revoked. Acceptance activates the account atomically with its initial roles,
  consumes the invitation, and requires a normal subsequent login.
- **R05 — Server authority:** Every protected management endpoint authenticates
  the session and enforces its required permission in the Go API. `users.read`
  and `roles.read` gate their read surfaces; every mutation additionally
  requires current `Super Admin` status. Frontend visibility is not an
  authorization boundary.
- **R06 — Fresh authorization:** Role-grant and user-role changes increment the
  affected users' authentication versions in the same transaction, so existing
  sessions cannot continue with stale elevated permissions. Display-only role
  renames do not revoke sessions.
- **R07 — Bootstrap continuity:** The first user created by the existing setup
  flow is automatically assigned the built-in `Super Admin` role so a fresh
  installation can administer roles and users. Authorization is derived from
  that assignment rather than from a hard-coded user identifier.
- **R08 — Protected super administration:** `Super Admin` is a built-in role
  with every current and future catalog permission. The role cannot be edited
  or deleted. Its assignment may be removed from the first user once another
  usable super administrator exists, but role removal, account disabling, and
  later account-lifecycle operations must atomically preserve at least one
  usable user assigned to `Super Admin`.
- **R08A — Initial administration boundary:** In the first RBAC version, only a
  user assigned to `Super Admin` may create, rename, modify, or delete custom
  roles or change user-role assignments. Delegated role administration and
  constrained permission granting are deferred.
- **R09 — Admin UI:** The generated React admin provides localized, accessible
  Users, Roles, pending-invitation, and public invitation-acceptance screens
  with explicit loading, empty, forbidden, validation, conflict, and
  dependency-error states. Navigation reflects read permissions but direct
  routes still rely on server authorization.
- **R10 — Scaffold integrity:** Source templates, the packed CLI artifact, and a
  generated non-seed project remain byte-consistent and pass backend, frontend,
  migration, container, and real-stack authorization verification.

## Acceptance Criteria

- **AC01 (R01, R02):** A permitted administrator can create a named role from
  catalog permissions, edit it, reload the application, and observe the same
  persisted role and grants. Deleting an assigned or invitation-referenced role
  returns a stable conflict without silently removing any assignment.
- **AC02 (R03, R04):** Assigning multiple roles to a user produces the union of
  their grants without duplicated or order-dependent behavior. Invitations and
  assignment updates with no role are rejected without changing existing
  state.
- **AC02A (R04A):** A second user can be invited with initial roles, set a
  password through the one-time link, explicitly log in, and receive exactly
  the permissions granted by those roles. Duplicate, expired, replayed, and
  superseded invitations have defined outcomes; public credential failures are
  non-disclosing, resend invalidates the old link, and no raw authority is
  stored or logged.
- **AC03 (R05):** Direct API requests without the required permission receive a
  stable `403` Problem Details response and cannot mutate or disclose protected
  management data. A user with `users.read` or `roles.read` can use only the
  corresponding read surface; only a super administrator can mutate RBAC or
  invitations.
- **AC04 (R06):** After a role grant or user assignment is removed, a session
  that previously had the permission can no longer use it without waiting for
  normal session expiry.
- **AC05 (R07, R08):** Fresh setup assigns `Super Admin` to the first user. The
  assignment can later move to other users, while every attempt to remove or
  disable the final usable super administrator is rejected atomically.
- **AC06 (R09):** The role and assignment workflows are keyboard accessible,
  localized in English and Simplified Chinese, and distinguish forbidden from
  unauthenticated and unavailable states.
- **AC07 (R10):** Unit, integration, HTTP, frontend, generated-output, and
  real-stack tests demonstrate permitted and forbidden paths across at least
  two users with different effective permissions.

## Out of scope for the initial proposal

- Attribute-based or relationship-based access control.
- Per-record ownership rules, tenant isolation, permission conditions, or deny
  rules.
- Role inheritance or nested roles.
- Delegated RBAC administration, escalation/bind permissions, and direct user
  permission grants.
- External identity providers, SCIM, SSO, and directory synchronization.
- User disablement, zero-role suspension, hard deletion of users, and
  generalized audit-log functionality.
