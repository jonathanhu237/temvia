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
A named collection of permissions that can be selected for an active user or an invitation.

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
A relationship between a role and either a user or an invitation. A role remains in use while any of its assignments exist and cannot be deleted until every assignment has been removed.

**Assignment count**:
The number of users and invitations currently assigned a role. Expired invitations remain included until they are renewed or revoked.

**User**:
A person who has activated an account and can sign in to a Temvia administration app.

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
