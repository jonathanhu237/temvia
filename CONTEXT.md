# Temvia account access

The language used for account invitations and password recovery in Temvia administration apps.

## Language

**Invitation link**:
A single-use link that lets an invited person set a password and activate their account.

**Invitation language**:
The language selected for an invitation email, independent of the sender's current interface language.
_Avoid_: Account language, interface language

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
A named administrative capability included in a role.

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
The ability to create, resend, renew, and revoke invitations. It includes viewing invitations and depends on the ability to view users and roles.

**Assignable role**:
A role whose permissions do not exceed those of the administrator creating or managing an invitation. Only a Super Admin can assign the Super Admin role.
