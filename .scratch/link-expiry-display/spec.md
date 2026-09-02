# Show the deadline of account links in email

Status: implemented

## Problem

The invitation and password-reset emails currently display a duration under
`LINK EXPIRY`. The formatter only supports exact whole minutes or truncated
seconds, so a nominal 72-hour invitation can appear as `259199 seconds` when
creation and expiry timestamps differ by a fraction of a second. Even exact
72-hour values become `4320 minutes`.

The displayed duration is calculated at creation, so it is also ambiguous when
delivery is delayed or the recipient reads the email later.

## Agreed behavior

- Display the link's actual deadline as a date, time, and explicit time zone.
- Apply the same rule to invitation and password-reset emails, in English and
  Simplified Chinese, in both HTML and plain text.
- Label it `EXPIRES AT` / `到期时间` in HTML and `Expires at:` / `到期时间：`
  in plain text. Preserve the existing single-use notice in HTML.
- Use `YYYY-MM-DD HH:mm:ss UTC`, following the existing password-change
  notification's unambiguous date format and explicit UTC time zone.
- Use the persisted link deadline. Delivery delay and SMTP retries do not
  change the date shown or grant a new validity period.
- Preserve link authorization, expiry checks, issuance, and resend behavior.

For example, a link expiring at `2026-09-06T12:34:56.789+08:00` is shown as
`2026-09-06 04:34:56 UTC` in either language. Subsecond precision is omitted,
not rounded up.

## Implementation and validation

`MailJob.ExpiresAt` is copied from the corresponding invitation or password
reset authorization record. Pass it directly to the mail templates instead of
subtracting `CreatedAt` or substituting a fallback duration.

Verify both kinds and both languages through the dispatcher, including a
fractional creation-time difference, a non-UTC input timestamp, and a delayed
SMTP retry. Check that HTML and plain text show the same deadline, existing
single-use notices remain present, and the mail layout accommodates the date.

This is a reversible presentation rule, so it does not require an ADR.

## Validation results

- 2026-09-03: Synced the local API source and documentation to Centaurus.
- `mise exec go -- go test ./internal/auth/application` passed on Centaurus.
  The regression test exercises English and Chinese invitations and password
  resets with fractional timestamp differences, a UTC+08:00 deadline, and an
  SMTP failure followed by a delayed successful retry.
- Generated all four HTML and plain-text examples from the actual Go templates
  on Centaurus using a temporary test overlay outside the repository.
- Visually checked the English invitation at desktop width and the English
  invitation and Chinese password reset at a 375px viewport. The deadline stays
  visible and wraps without overflowing on the narrow layout.
- `git diff --check` passed. Validation did not require changes to authorization
  rules or the running application services.

## Comments

- 2026-09-03: User approved the recommended absolute-deadline presentation and
  the shared scope covering both email kinds and languages.
