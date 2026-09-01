# RBAC roles and user assignments design

## 1. Scope and design stance

Implement one end-to-end identity-and-access milestone inside the generated
application. The milestone uses flat/core RBAC: users receive permissions only
through one or more roles, multiple roles are additive, and absent permissions
deny access. It deliberately excludes inheritance, deny rules, conditions,
resource scopes, tenants, direct user grants, and delegated RBAC administration.

This remains one Trellis implementation task rather than separately deployable
children. The schema, setup migration, session revocation, invitation state,
authorization checks, and admin UI share security invariants that must become
true together. The implementation plan still separates them into reviewable
checkpoints.

RBAC and invitation code extends the existing `internal/auth` capability. User
identity, sessions, password creation, mail credentials, and role assignments
must participate in shared transactions; splitting them into nominally separate
capabilities now would either create cross-feature transaction leakage or a
premature generic authorization framework. Future business modules consume a
narrow authorizer contract and register permission definitions at composition.

## 2. Authority model

### 2.1 Permission catalog

The application owns an immutable catalog for the lifetime of a process. A
permission definition has:

- a stable machine key using `<resource>.<action>`;
- a stable display/i18n key or category metadata;
- no user-authored executable expression.

The initial catalog contains exactly:

- `users.read` — list and inspect activated users and their roles;
- `roles.read` — list roles, their grants, and the available permission catalog.

The auth package contributes these definitions. Future generated-project
modules contribute their own constants when the composition root constructs
the catalog. Duplicate or malformed keys fail startup before the listener is
opened. Custom-role writes accept only catalog keys. Unknown persisted grants
never authorize an operation and surface as an operator-visible schema/data
error rather than being silently interpreted.

Each protected use case asks for one explicit permission constant. HTTP route
names, frontend labels, and role names are not authority.

### 2.2 Roles and effective access

- A custom role has an opaque UUID, editable display name and optional
  description, a non-empty explicit set of catalog permission keys, a revision,
  and timestamps.
- Role display names are normalized consistently and unique
  case-insensitively. UUIDs remain stable across renames.
- An activated user has one or more roles. Effective permissions are the set
  union of all custom-role grants.
- Direct user-permission grants do not exist.
- The built-in role has `system_key = super_admin`. It is represented as a role
  for assignment and display, but its effective meaning is all permissions in
  the live catalog; the database does not copy wildcard or catalog rows into
  it.
- `Super Admin` cannot be renamed, edited, or deleted. Only a current super
  administrator may mutate roles, invitations, or user-role assignments.
- Read-only role/user routes require `roles.read` or `users.read`, respectively.
  This makes non-super custom roles useful without giving them administrative
  mutation power.
- Home remains available to every authenticated activated user. Navigation to
  Users and Roles is derived from current-session permissions, while the API
  remains authoritative.

### 2.3 Continuity and default denial

Every protected operation defaults to denial. An authenticated user with an
unknown permission, stale session, missing role, or dependency uncertainty
cannot proceed.

Every transaction that can remove `Super Admin` from an activated user locks
the built-in role row before checking assignments. It rejects the mutation if
fewer than one other activated holder would remain. Pending invitations do not
count. The first setup user is not permanently special: their assignment may be
removed after another activated super administrator exists.

## 3. PostgreSQL model and migration

Migration `000003_rbac` adds the following durable state without rewriting the
released authentication migrations.

### 3.1 Roles and assignments

`auth_roles`

| Column | Contract |
| --- | --- |
| `id uuid` | `uuidv7()` primary key |
| `system_key text` | nullable, unique; only `super_admin` is supported |
| `name text` / `name_canonical text` | validated display value and unique canonical identity |
| `description text` | bounded, non-null empty string when absent |
| `revision bigint` | positive optimistic-concurrency revision |
| `created_at`, `updated_at` | PostgreSQL-authoritative timestamps |

`auth_role_permissions`

| Column | Contract |
| --- | --- |
| `role_id uuid` | role FK, delete cascade |
| `permission_key text` | bounded stable catalog key |
| primary key | `(role_id, permission_key)` |

The system role has no permission rows. Custom roles must have at least one
grant after every application mutation; this is enforced in the transaction
because a cross-row non-empty set is not a simple row constraint.

`auth_user_roles`

| Column | Contract |
| --- | --- |
| `user_id uuid` | activated user FK, delete cascade |
| `role_id uuid` | role FK, delete restrict |
| `assigned_at` | PostgreSQL-authoritative timestamp |
| primary key | `(user_id, role_id)` |

Role deletion uses `RESTRICT` plus an application conflict check. A referenced
role is never implicitly detached.

### 3.2 Existing and fresh installations

The migration inserts the built-in `Super Admin` role. On the supported upgrade
path, the only existing account is the setup administrator; the migration
assigns the built-in role to all pre-migration `auth_users` so no previously
working installation loses access. The migration verification explicitly
documents and tests this compatibility decision. When setup completes against
schema version 3, its existing account-creation transaction also assigns the
built-in role.

Migration down removes invitations and RBAC relations before roles and restores
the previous outbox shape. API startup advances its exact expected version to
3 and remains read-only.

### 3.3 Invitations

Pending identities remain separate from `auth_users`; the latter continues to
mean an activated credential-bearing account with a non-null password hash.

`auth_user_invitations` stores an opaque UUID, validated name/email plus unique
canonical email, a 16-byte public selector, a 32-byte verifier digest, locale,
expiry, creator user ID, revision, and timestamps. It never stores a usable raw
credential. `auth_invitation_roles` stores one or more initial role references
with delete restrict. An activated email and a pending invitation email cannot
both be created by application transactions.

Pending invitations can be listed, explicitly resent, or revoked by a super
administrator. Resend replaces the selector/digest and expiry, cancels obsolete
unsent invitation mail, and leaves the selected roles unchanged. Revocation
removes the invitation and cancels its unsent mail. Duplicate invitation of an
activated or already-pending email returns a stable conflict; resend is an
explicit action rather than an accidental side effect.

### 3.4 Mail outbox extension

Migration 3 generalizes `auth_mail_outbox` just enough for invitation mail:

- add an invitation reference/selector path;
- allow `user_id` only for the existing password events and `invitation_id`
  only for invitation events;
- extend kind and pair constraints so exactly the required authority is
  present;
- retain leasing, deterministic Message-ID, retries, terminal states,
  retention, and `FOR UPDATE SKIP LOCKED` behavior.

The dispatcher resolves the recipient from the owning user or invitation by
kind. Invitation jobs are discarded when their selector no longer matches the
current unexpired invitation.

## 4. Invitation credential and activation flow

Invitation authority uses the existing `v1.<selector>.<verifier>` shape with a
distinct HMAC domain and a new required `INVITATION_TOKEN_KEY`. PostgreSQL
stores only selector and verifier digest. The outbox dispatcher derives and
validates the verifier only while composing the email. The default invitation
TTL is 72 hours, configurable within a bounded maximum of 7 days.

The localized link is
`${APP_PUBLIC_URL}/accept-invitation#token=<credential>`. The admin captures and
clears the fragment before React renders, stores authority in module memory
only, and applies the same no-referrer defense as password recovery.

Completion performs a cheap credential preflight before Argon2id. After hashing
outside the transaction it locks and revalidates the invitation, verifies all
roles still exist, creates the activated `auth_users` row and its role
assignments, consumes the invitation, cancels obsolete mail, and commits as one
transaction. It does not create a session; the user explicitly signs in.
Malformed, expired, replayed, revoked, and superseded credentials share one
stable public invalid-invitation result.

## 5. Application services and transaction boundaries

Keep narrow use-case-oriented ports rather than a generic repository:

- `Authorization` resolves an authenticated principal and checks a requested
  permission or super-administrator status.
- `RoleManagement` lists catalog/roles and creates, replaces, or deletes custom
  roles.
- `UserAccessManagement` pages activated users, returns role assignments, and
  atomically replaces a user's non-empty role set.
- `InvitationManagement` creates, lists, resends, and revokes pending
  invitations.
- `InvitationAcceptance` preflights and consumes public invitation authority.

Role permission replacement locks the role, checks the submitted revision,
validates the complete non-empty grant set, replaces rows, increments the role
revision, and increments `auth_users.auth_version` for every assigned user in
the same transaction. User-role replacement locks the user and built-in role,
checks the submitted user version, preserves the last-super invariant, replaces
the complete non-empty set, and increments that user's `auth_version`.

Role renaming also uses role revision but does not revoke sessions when only
display metadata changes. Failed validation, conflicts, and dependency errors
leave grants, assignments, and versions unchanged.

## 6. Session and authorization behavior

Login and current-session resolution return an enriched current-principal
projection:

```json
{
  "user": {"id":"...","name":"...","email":"..."},
  "roles": [{"id":"...","name":"...","system":"super_admin|null"}],
  "permissions": ["roles.read","users.read"],
  "superAdmin": true
}
```

The exact TypeScript and Go types use a nullable/optional system discriminator,
not the illustrative string above. Permissions are sorted and deduplicated for
deterministic responses. The frontend never infers super-administrator status
from a role display name.

Existing Redis sessions already carry `auth_version`, and every resolution
compares it with PostgreSQL. Assignment and grant transactions increment the
affected versions, so all prior sessions for those users fail closed on their
next request. Best-effort Redis deletion is optional cleanup; PostgreSQL
version comparison is authority. A role metadata-only rename does not revoke.

## 7. HTTP contracts

All management responses are `Cache-Control: no-store`. Unsafe methods perform
the existing exact-Origin check before decoding. Bodies remain strict,
duplicate-key rejecting, and bounded. Path IDs are canonical UUIDs.

### 7.1 Authenticated reads

| Method and path | Required authority | Success |
| --- | --- | --- |
| `GET /api/roles` | `roles.read` | catalog plus system/custom role summaries |
| `GET /api/roles/{id}` | `roles.read` | role detail, grants, revision, assignment count |
| `GET /api/users?cursor=&limit=` | `users.read` | deterministic keyset page of activated users and roles |
| `GET /api/user-invitations?cursor=&limit=` | `Super Admin` | keyset page of pending invitations and roles |

Roles are expected to remain small and may be returned as one bounded list.
Users and invitations are cursor-paginated with validated limits and opaque
cursors; malformed cursors are validation failures, never raw SQL fragments.

### 7.2 Super-administrator mutations

| Method and path | Success |
| --- | --- |
| `POST /api/roles` | `201` custom role detail |
| `PUT /api/roles/{id}` | `200` complete replacement using submitted revision |
| `DELETE /api/roles/{id}` | `204`, only when unreferenced |
| `PUT /api/users/{id}/roles` | `200` complete assignment replacement using submitted version |
| `POST /api/user-invitations` | `201` pending invitation and queued-mail state |
| `POST /api/user-invitations/{id}/resend` | `202` refreshed pending invitation |
| `DELETE /api/user-invitations/{id}` | `204` revoked invitation |

### 7.3 Public activation

| Method and path | Success |
| --- | --- |
| `POST /api/auth/invitations/accept` | `204`, no session |

The request contains token, password, and locale. Name, email, and initial roles
come only from the invitation transaction. Successful completion clears any
presented session cookie defensively and directs the browser to normal login.

## 8. Error and concurrency contract

Add stable Problem Details types/codes for:

- `403 forbidden` for an authenticated principal lacking a read permission or
  super-administrator authority;
- invalid invitation authority;
- duplicate active email and invitation already pending;
- system role immutable;
- role in use;
- last super administrator;
- stale role or user revision;
- referenced role missing between form load and submit.

Existence-sensitive management conflicts are visible because the caller is an
authenticated super administrator. Public invitation completion collapses all
credential states into one result. Dependency uncertainty remains `503`, never
an empty list, `403`, or successful mutation.

Optimistic revisions prevent two browser sessions from silently overwriting a
role or a user's assignment set. The UI reloads current state after conflict
and does not automatically replay a stale destructive mutation.

## 9. Admin application

Add feature boundaries under `features/access/` and file routes under the
authenticated tree:

- `/users` — activated-user table with role badges; visible with `users.read`;
  super administrators can invite and replace assignments;
- `/roles` — role list/detail and permission matrix; visible with `roles.read`;
  super administrators can create/edit/delete custom roles;
- `/accept-invitation` — public password-creation flow using shared auth-page,
  authority-capture, password, localization, and error patterns.

The sidebar shows Users and Roles only when the current principal has the
matching read permission. Direct route loaders still fetch and surface `403`.
Super-only controls are absent for read-only users. Destructive actions use
explicit confirmation with the affected role name. Assigned-role deletion
conflict keeps the page state and explains that users/invitations must be
reassigned first.

Use TanStack Query option factories and stable keys owned by the access
feature. Mutations invalidate only affected role/user/invitation queries;
current-user state is re-resolved after a mutation affecting the actor. Zod
validates every success body. React Hook Form owns role and invitation forms.
All text and permission labels exist in English and Simplified Chinese.

The permission picker groups catalog items by resource, uses labeled
checkboxes, exposes descriptions, and enforces at least one permission. The
role-assignment control supports multiple selections without relying on color
alone. Tables remain usable at narrow widths, keyboard operations retain focus,
and loading/empty/forbidden/conflict/unavailable states remain persistent and
recoverable.

## 10. Security and operational properties

- No raw invitation, setup, reset, session, or password authority enters logs,
  PostgreSQL, Redis keys, query strings, browser storage, Query state, or error
  responses.
- Ordinary custom roles enumerate permissions; they do not use wildcards or
  automatically receive future permissions.
- Only the explicit system role receives future catalog permissions.
- All mutation authorization and invariants execute on the server and are
  rechecked inside the state-changing transaction where relevant.
- No account existence is disclosed from public invitation completion.
- Mail delivery remains asynchronous, leased, retried, and at least once.
- Audit-log functionality is not implied by timestamps or outbox history and
  remains out of scope.

## 11. Compatibility, rollout, and rollback

Deployment order remains: build images, run migration 3 explicitly, then start
the version-3 API/admin. An older API refuses the ahead schema; the new API
refuses version 2. Migration promotes supported existing users to `Super Admin`
and changes no password/session authority by itself.

Deploying the new API enriches login/current-user response bodies; the bundled
admin is updated atomically in the template. Existing sessions remain usable
until an access mutation increments their user's `auth_version`.

Rollback requires stopping the new API/admin, applying migration 3 down, and
deploying the previous pair. Invitation state and RBAC customizations are lost
by that explicit rollback; existing activated users and credentials remain,
and the former first-user-only application behavior resumes. Never attempt an
application-only rollback against schema version 3.

## 12. Verification strategy

Tests cover:

- catalog validation, role/name/description validation, additive permission
  union, default deny, and super-role semantics;
- migration up/down, existing-user promotion, fresh setup assignment, FK/check
  constraints, role-in-use conflict, concurrent last-super removal, optimistic
  conflicts, and atomic version increments;
- invitation replacement/resend/revoke/expiry/replay/concurrent acceptance,
  outbox leasing and stale-selector discard, and no raw authority at rest;
- session invalidation after user-role and role-grant changes, with unaffected
  users remaining authenticated;
- exact HTTP status, Problem Details, Origin/body precedence, no-store headers,
  UUID/cursor validation, permission denial, super-only mutations, and 404/405;
- frontend contracts, permission-aware routing/navigation, accessible forms,
  role conflicts, invitations, assignment updates, fragment clearing, i18n,
  responsive behavior, and axe smoke;
- source-to-packed-to-generated byte equality, migration readiness, container
  builds, SMTP outage/recovery, and a real two-user browser flow on Centaurus.
