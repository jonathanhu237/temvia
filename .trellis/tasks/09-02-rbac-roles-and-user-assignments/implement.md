# RBAC roles and user assignments implementation plan

Status: implemented and verified on 2026-09-02. Detailed evidence is recorded
in `verification.md`; the checklist below remains the reviewed execution plan.

## Delivery strategy

Implement inward-out from durable contracts to UI. Keep every checkpoint green
before moving to the next boundary. Stop and return to planning if execution
would weaken the reviewed catalog, super-administrator continuity, non-empty
roles/assignments, role-in-use, invitation-authority, or session-revocation
contracts.

## 1. Freeze contracts and migration 3

- [ ] Re-read `prd.md`, `design.md`, curated specs, and RBAC research; search
  every current migration-version, route, outbox-kind, user-response, and
  required-template inventory before changing values.
- [ ] Add matched `000003_rbac.up.sql`/`.down.sql` with roles, grants,
  user-role assignments, pending invitations, invitation-role assignments, and
  the constrained outbox extension.
- [ ] Insert the built-in `super_admin` role and assign supported existing users
  on upgrade; preserve zero-user pre-setup databases.
- [ ] Advance `ExpectedMigrationVersion` to 3 and update independent migration
  filename/version checks without rewriting migrations 1 or 2.
- [ ] Add PostgreSQL integration coverage for up/down, existing-user promotion,
  constraints, FK deletion behavior, timestamps/revisions, empty/fresh setup,
  and preservation of credentials/recovery data.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/adapter/postgres ./internal/config ./cmd/server
go vet ./...
```

Rollback point: migration and schema readiness only; no application depends on
version 3 yet.

## 2. Add permission, role, and principal domain contracts

- [ ] Add strict permission-key/catalog construction, initial `users.read` and
  `roles.read` definitions, duplicate/malformed startup rejection, deterministic
  sorting, and extension hooks for future modules.
- [ ] Add validated role name/canonical name, description, system-role,
  revision, assignment, invitation, and enriched current-principal types.
- [ ] Keep permission labels/descriptions out of backend authority; expose
  stable metadata keys for frontend localization.
- [ ] Add application sentinels for forbidden, invalid invitation, duplicate or
  pending email, immutable role, role in use, last super administrator, stale
  revision, and invalid role set.
- [ ] Add focused unit tests for normalization, bounds, non-empty sets,
  de-duplication, additive union, default denial, and super-role expansion.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/domain ./internal/auth/application
```

## 3. Implement PostgreSQL RBAC transactions

- [ ] Add narrow application ports and PostgreSQL operations for role/catalog
  reads, paged user reads, role create/replace/delete, and complete user-role
  replacement.
- [ ] Validate custom grants against the live catalog before database mutation.
- [ ] Implement optimistic revisions and distinguish missing, stale, immutable,
  referenced, validation, and dependency cases.
- [ ] Serialize super-role assignment mutations on the built-in role row and
  reject concurrent attempts that would leave no activated holder.
- [ ] Reject role deletion when referenced by any user or pending invitation;
  never cascade assignments.
- [ ] Increment `auth_version` for every assigned user when a role's grant set
  changes and for the target user when assignments change; keep display-only
  renames from revoking sessions.
- [ ] Cover rollback, concurrency, union queries, deterministic pagination,
  unknown grants, unaffected-user versions, and exact transaction atomicity.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/application ./internal/auth/adapter/postgres
go test -race ./internal/auth/...
```

## 4. Integrate setup, login, sessions, and authorization

- [ ] Extend fresh setup completion to assign `Super Admin` in the existing
  one-winner transaction.
- [ ] Resolve roles, effective permissions, and super status into login and
  `/me` projections without trusting Redis for authorization.
- [ ] Add one centralized authorization service used by protected application
  operations; distinguish unauthenticated `401` from authenticated forbidden
  `403` and dependency `503`.
- [ ] Preserve the existing Redis `auth_version` comparison so access changes
  invalidate all older sessions on their next use.
- [ ] Add application/Redis tests proving stale access fails closed, unaffected
  users remain logged in, permission union is deterministic, and role display
  names are never evaluated as authority.

Checkpoint:

```sh
cd template/api
go test ./internal/auth/application ./internal/auth/adapter/redis
go test -race ./internal/auth/application ./internal/auth/adapter/redis
```

## 5. Implement invitation state and mail delivery

- [ ] Add and validate `INVITATION_TOKEN_KEY` and bounded invitation TTL
  configuration, with a 72-hour default and 7-day maximum.
- [ ] Reuse the canonical selector/verifier shape under an invitation-specific
  HMAC domain; never store or log usable authority.
- [ ] Implement super-only create/list/resend/revoke use cases. Require a
  non-empty existing role set, reject active/pending duplicate emails, replace
  authority explicitly on resend, and cancel obsolete mail.
- [ ] Extend the outbox claim/sweep/compose path and localized SMTP templates
  for invitation jobs while preserving current reset/change behavior.
- [ ] Implement acceptance preflight before Argon2id and the revalidated
  activation transaction: create account, assign all roles, consume invitation,
  cancel mail, and create no session.
- [ ] Cover expiry, replay, revocation, resend supersession, concurrent accept,
  role deletion references, SMTP retry/duplicate behavior, locale content,
  and credential absence from durable/error/log state.

Checkpoint:

```sh
cd template/api
go test ./internal/config ./internal/auth/domain ./internal/auth/application
go test ./internal/auth/adapter/postgres ./internal/auth/adapter/mail
go vet ./...
go test -race ./internal/auth/...
```

## 6. Add strict HTTP contracts

- [ ] Add role, user, invitation, and public acceptance routes plus exact
  known-method entries, no-store responses, UUID/cursor parsing, strict JSON,
  bounded pages, and Origin-first unsafe-method handling.
- [ ] Require `roles.read`/`users.read` for reads and explicit super status for
  every mutation; do not rely on frontend navigation.
- [ ] Return enriched deterministic principal JSON from login and `/me` and
  endpoint-specific role/user/invitation success bodies.
- [ ] Map every reviewed public error to stable RFC 9457 Problem Details,
  including `403 forbidden`, role-in-use, last-super, stale revision, and one
  collapsed invalid-invitation type.
- [ ] Wire the catalog and new services explicitly in `cmd/server`; startup
  fails before listening on invalid catalog/config/schema.
- [ ] Extend table tests for exact bodies/status/content type/headers,
  permission matrices, conflict precedence, malformed cursors/UUIDs,
  404/405, Origin/body ordering, and secret/internal-text absence.

Checkpoint:

```sh
cd template/api
go test ./...
go vet ./...
go test -race ./...
```

Rollback point: API and migration 3 form one deployable backend checkpoint.

## 7. Add typed frontend access state and invitation bootstrap

- [ ] Extend shared Zod contracts and `ApiClient` for the enriched principal,
  catalog, role, paged user/invitation, mutation, conflict, and acceptance
  responses; components never call `fetch`.
- [ ] Add feature-owned query keys/options/mutations under `features/access/`
  with explicit retry, invalidation, and stale-revision behavior.
- [ ] Extend the shared pre-render fragment parser for
  `/accept-invitation#token=...`; clear history immediately and keep authority
  in module memory only.
- [ ] Update authentication loaders/cache users to consume one principal shape
  and preserve unauthenticated-versus-unavailable semantics.
- [ ] Add contract/client/query/authority tests before composing pages.

Checkpoint:

```sh
cd template/admin
pnpm lint
pnpm check
pnpm test
```

## 8. Build users, roles, and invitation interfaces

- [ ] Add permission-aware Users and Roles sidebar items and route loaders;
  preserve direct-route `403` handling even when navigation is hidden.
- [ ] Build the users page with deterministic pagination, role badges,
  read-only mode, invitation entry point, and super-only complete assignment
  replacement.
- [ ] Build the roles page with system/custom distinction, role detail,
  grouped localized permission picker, create/replace, revision conflict, and
  referenced-role deletion recovery.
- [ ] Build pending invitation list/resend/revoke states and the public
  acceptance password flow with normal explicit-login completion.
- [ ] Keep at least one permission per custom role and at least one role per
  user/invitation at both form and server boundaries.
- [ ] Add English/Simplified Chinese copy, keyboard/focus behavior,
  narrow-screen layouts, confirmations, and persistent loading/empty/
  forbidden/conflict/unavailable states.
- [ ] Regenerate `routeTree.gen.ts` through the TanStack Router plugin.
- [ ] Add component/route/MSW tests for read-only and super principals,
  navigation, multi-role union, stale edits, conflicts, invitation lifecycle,
  authority clearing, responsive UI, and accessibility.

Checkpoint:

```sh
cd template/admin
pnpm lint
pnpm check
pnpm test
pnpm build
```

## 9. Synchronize template inventory, configuration, and docs

- [ ] Update `.env.example`, Compose API environment, API/admin/generated
  READMEs, migration instructions, invitation key generation, TTL behavior,
  role semantics, continuity guidance, and deployment/rollback order.
- [ ] Register every new backend/admin/migration file in `src/generate.ts` and
  the independent root/admin inventory tests at the same time.
- [ ] Preserve source-to-packed-to-generated bytes, seed-module replacement,
  and exclusion of secrets, lockfiles, dependencies, build output, mail data,
  and test artifacts.
- [ ] Update stable backend/frontend specs only after implementation proves the
  final executable contract.

Checkpoint:

```sh
pnpm check
pnpm build
pnpm test
pnpm test:git
pnpm test:package
```

## 10. Generated-project and real-stack verification

- [ ] Run cheap local root/API/admin checks first. Keep real Git operations
  local and do not substitute resource-intensive local stack work.
- [ ] Pack the actual CLI, install it offline without dev dependencies,
  generate a disposable non-seed module, compare every template byte, and run
  Go/admin checks on that generated output.
- [ ] Rsync the local repository one way to Centaurus. If unavailable, report
  it and stop the resource-intensive validation path.
- [ ] On Centaurus, verify migration 2→3, fresh migration, down/up, dirty/ahead/
  behind startup refusal, PostgreSQL persistence, Redis restart/outage, SMTP
  outage/recovery, and API/admin/migration container builds.
- [ ] Forward Caddy/API/Mailpit ports and run the real Chromium flow: setup
  first super administrator, create a read-only role, invite a second user,
  inspect localized mail, clear fragment, accept/set password, explicitly log
  in, verify read access and mutation denial, modify grants, prove old session
  invalidation, add a second super administrator, reject final-super removal,
  reject assigned-role deletion, and run responsive/axe/console checks.
- [ ] Run a final full-scope Trellis check and reconcile every finding against
  actual trust boundaries before completion.

Final gates:

```sh
git diff --check
cd template/api && go test ./... && go vet ./... && go test -race ./...
cd template/admin && pnpm lint && pnpm check && pnpm test && pnpm build
cd ../.. && pnpm check && pnpm build && pnpm test && pnpm test:git && pnpm test:package
```

Final rollback point: stop version-3 services, run migration 3 down, then deploy
the previous API/admin pair. Do not run an older API against schema version 3.
