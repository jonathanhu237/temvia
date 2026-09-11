# Temvia account access

The language used for account invitations and password recovery in Temvia administration apps.

## Language

**Invitation link**:
A single-use link that lets an invited person set a password and activate their account.

**Invitation language**:
The language used in an invitation email, independent of the sender's current interface language.
_Avoid_: Account language, interface language

**Default email language**:
A system-wide language setting for invitation emails, password reset emails, and password change notifications. It is separate from each person's interface language preference.
_Avoid_: Interface language, account language

**System settings**:
Shared administrative configuration that applies throughout a Temvia administration app. These settings are separate from each person's interface preferences.

**Email configuration**:
The shared delivery settings and default language for email sent by a Temvia administration app.

**System name（系统名称）**:
The single shared display name identifying an administration app across its pages, browser titles, and system emails. It is freely named without a prescribed language and stays the same regardless of interface or email language.

**System icon（系统图标）**:
The shared visual symbol identifying an administration app on its pages and browser tabs.
_Avoid_: ICON

**Operational warning**:
A current system condition shown on the home page that needs administrative attention, such as missing email configuration.
_Avoid_: Notification history, audit log

**Password reset link**:
A single-use link that lets an account holder choose a new password after requesting password recovery.

**Link expiry**:
The deadline after which an invitation link or password reset link can no longer be used. Using, replacing, or revoking a link can make it unusable before that deadline.
_Avoid_: Countdown, remaining time

# Temvia role-based access

The language used for grouping and granting administrative capabilities in Temvia administration apps.

## Language

**Role**:
A named collection of permissions that can be assigned to a user or an invitation.

**Permission**:
A named administrative capability included in a role, expressed as a resource and either read or write access. Read permits viewing the resource; write permits changing it or performing its state-changing operations, and does not implicitly grant read access.

**Read and write access**:
A combination that explicitly grants both read and write permissions for a resource.

**Feature permission combination**:
The explicit set of permissions needed to use an administrative capability. Role configuration includes the required permissions together; the combination does not implicitly grant additional permissions at runtime.

**Built-in role**:
A role supplied by Temvia whose definition cannot be edited or deleted.
_Avoid_: System role

**Custom role**:
A role created and maintained by an administrator.

**Role assignment**:
A relationship between a role and either a user or an invitation. A role remains in use while any of its assignments exist, including assignments to disabled users, and cannot be deleted until every assignment has been removed.

**Assignment count**:
The number of users and invitations currently assigned a role. Expired invitations remain included until they are renewed or revoked.

**User**:
A person with an activated account in a Temvia administration app. A disabled user retains their account but cannot sign in.

**User deactivation（停用用户）**:
A reversible administrative action that ends a user's existing sign-in sessions and prevents further sign-in while retaining their account, email, password, role assignments, and history. Password recovery cannot restore access while the user is disabled; reactivation requires an administrator. Deactivation invalidates existing password reset links but does not revoke invitations previously created by the user.

**User reactivation（恢复用户）**:
An administrative action that allows a disabled user to sign in again with their retained account and role assignments. Previous sign-in sessions and invalidated password reset links are not restored.

**User deletion（删除用户）**:
An irreversible administrative action that removes an unneeded account while retaining associated historical and business records. It is distinct from deactivation and does not mean erasing all personal information.

**Deleted user（已删除用户）**:
A former account holder identified in retained records by their original identity, including name, email, and user identifier, with an indication that the account has been deleted. Deleting an invitation's creator does not revoke the invitation. The email may be invited again, but a newly activated account is a distinct user and does not inherit the deleted user's identity or history.

**User management（用户管理）**:
The administrative capability to view users with user read access and to change role assignments, deactivate, reactivate, or delete users with user write access. Deactivation, reactivation, and deletion may target any other user regardless of relative permissions, including a Super Admin; role assignment retains its separate grant restrictions.

**Available Super Admin（可用超级管理员）**:
A user who holds the Super Admin role and is not disabled. User management must retain at least one available Super Admin and cannot deactivate or delete the acting user's own account.

**Invitation**:
A request for a person to activate an account, with roles selected in advance. The person becomes a user only after accepting the invitation.

**Pending invitation**:
An invitation whose link can still be used to activate an account.

**Expired invitation**:
An invitation whose link has passed its expiry. It remains an invitation and retains its role assignments until it is renewed or revoked.

**Invitation management**:
The ability to create, resend, renew, and revoke invitations. Its complete administrative permission combination includes viewing invitations and reading roles for selection, without requiring access to the user list.

**System settings management**:
The ability to change shared system settings, which can be granted through a custom role. Its administrative permission combination explicitly includes both viewing and changing settings.

**Assignable role**:
A role whose permissions do not exceed those of the administrator assigning roles to a user or creating or managing an invitation. Only a Super Admin can assign the Super Admin role.

# Temvia operation history

## Language

**Operation log**:
A historical record of the outcome of an administrative action or account activity, identifying what happened, when, and who initiated it when known. One operation has one result record, whether successful or failed; additional kinds of operations can join this history as the application grows.
_Avoid_: API request log, operational warning

**Operation log retention**:
The configurable period for which operation history is kept before it is automatically removed.

**Operation log recording status**:
The observed condition of saving operation history, including an unknown initial condition, recording failures, and recovery. A recovered condition does not mean that missing historical records have been restored.

**Unverified actor**:
A person whose identity has not been established for an account activity. An account identifier supplied in an unsuccessful login attempt does not establish that the account holder performed it.

# Temvia online user management

## Language

**Online user**:
A user with at least one valid sign-in session, even when their browser page is closed. Online status does not mean the person is actively using the application.
_Avoid_: Recently active user

**Force sign-out（强制退出）**:
An administrative action that ends all existing sign-in sessions for a user across devices. It does not prevent the user from signing in again.
_Avoid_: 踢下线, disable user, ban user

**Force sign-out permission（强制退出权限）**:
The administrative capability to force any user to sign out, including a Super Admin or the actor themselves. The target user's role does not restrict this capability.
