# RBAC industry patterns

Research date: 2026-09-02

## Question

Which established RBAC patterns should guide Temvia's first role, permission,
user-assignment, and invitation implementation?

## Primary sources reviewed

- NIST RBAC project and FAQ:
  - https://csrc.nist.gov/projects/role-based-access-control
  - https://csrc.nist.gov/Projects/role-based-access-control/faqs
- Kubernetes RBAC authorization and security guidance:
  - https://kubernetes.io/docs/reference/access-authn-authz/rbac/
  - https://kubernetes.io/docs/concepts/security/rbac-good-practices/
- GitHub organization and custom repository role documentation:
  - https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization
  - https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/about-custom-repository-roles
  - https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/managing-custom-repository-roles-for-an-organization
- Google Cloud IAM roles documentation:
  - https://docs.cloud.google.com/iam/docs/overview
  - https://docs.cloud.google.com/iam/docs/roles-overview
- Keycloak server administration guide:
  - https://www.keycloak.org/docs/latest/server_admin/

## Common model

1. Core RBAC has separate user-role assignment and permission-role assignment
   relations. Both are many-to-many. Permissions are not normally granted
   directly to individual users.
2. A permission represents a concrete allowed operation. Mature systems use
   stable machine identifiers that resemble `service.resource.verb` and often
   correspond closely to API methods or enforcement points.
3. A role is a named bundle of permissions. A principal may hold multiple
   roles; effective access is normally additive, meaning the union of all
   grants. Absence of a grant means denial.
4. Custom roles support least privilege but cost more to maintain than curated
   built-in roles. Role hierarchy, deny rules, contextual conditions, and
   separation-of-duty constraints are extensions beyond core/flat RBAC, not
   prerequisites for a useful first implementation.
5. Authorization is enforced by the server at the operation boundary. Showing
   or hiding frontend controls is a usability concern, not the security
   boundary.

## Administrative safety patterns

- Kubernetes prevents privilege escalation at the API layer: a caller may not
  create or update a role containing permissions the caller does not already
  hold unless explicitly granted a special escalation capability. Binding a
  role is similarly constrained.
- Google Cloud warns that principals able to edit custom roles can add powerful
  permissions and potentially obtain unlimited access through a role already
  assigned to them. It recommends restricting custom-role editors to a small
  number of highly trusted principals.
- GitHub limits custom repository-role creation and management to organization
  owners. GitHub recommends at least two organization owners for continuity,
  even though one owner is technically possible.
- Kubernetes recommends least privilege, avoiding broad wildcards for ordinary
  roles, minimizing superuser use, and periodically reviewing assignments and
  privilege-escalation paths.
- Keycloak models role mapping and composite-role mapping as separately
  controllable administrative operations, demonstrating that role assignment
  is itself privileged and need not be coupled to general user editing.

## Recommendation for Temvia v1

Adopt flat/core RBAC:

- code-owned, stable permission catalog;
- database-owned custom roles and permission grants;
- many-to-many user-role assignments;
- additive effective permissions with default deny;
- no direct user-permission grants;
- no role hierarchy, composite roles, deny rules, conditions, or per-resource
  scopes in the first version;
- mandatory server-side authorization at every protected API operation;
- an immutable built-in `Super Admin` role that means all catalog permissions;
- initial setup assigns `Super Admin` to the first user;
- at least one usable `Super Admin` assignment must survive every mutation;
- only `Super Admin` may manage role definitions, invitations, and user-role
  assignments in v1.

The last rule is intentionally simpler than Kubernetes-style constrained
delegation. It matches GitHub's owner-managed custom-role model and Google
Cloud's warning to tightly restrict custom-role editors. Temvia can add an
explicit delegated-administration model later if a real use case requires it.

## Permission naming and lifecycle implications

- Use stable keys with a predictable resource/action grammar, for example
  `users.read` and `orders.update`. Human labels and descriptions are localized
  display metadata and may change without changing authority.
- Validate every persisted custom-role grant against the current catalog.
  Unknown permission keys fail closed and are visible to operators instead of
  silently becoming authority.
- Ordinary custom roles enumerate permissions explicitly. They do not receive
  future catalog entries automatically.
- `Super Admin` is the explicit exception: its semantics are all current and
  future catalog permissions rather than a wildcard row copied into the
  database. Holders must remain few and visible.
- Role and assignment changes must take effect promptly. Temvia's existing
  `auth_version` mechanism is a natural revocation boundary, but the exact
  transaction and session design belongs in `design.md`.
- Concurrent role edits need optimistic conflict protection or an equivalent
  lost-update guard. Google Cloud exposes an ETag for this purpose; Temvia can
  use a version field or conditional update appropriate to its REST contract.

## What the research does not settle

Standards and vendor behavior do not choose Temvia's product semantics for
deleting an assigned custom role, accepting an invitation, allowing an active
user to have zero roles, or exposing account status. Those remain explicit
planning decisions.
