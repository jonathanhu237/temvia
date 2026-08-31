# Revise administrator password policy

## Goal

Make administrator passwords easier to create while keeping one explicit,
consistent password contract across the generated Go API and React admin.

## Background

- The current password-only login has no MFA. Both setup and login normalize
  passwords to NFC without trimming and accept 15-128 Unicode code points.
- The Go domain owns authoritative validation in
  `template/api/internal/auth/domain/credentials.go`; the React Zod schema
  mirrors the rule for immediate form feedback.
- After reviewing the NIST/OWASP trade-off, the user explicitly replaced the
  current 15-character minimum with an 8-128 rule requiring all four character
  classes. This is a usability/product preference and must not be described as
  standards-aligned or inherently stronger than the previous rule.
- The earlier architecture decision deliberately selected 15-128 code points
  with no composition quotas and declined a weak/compromised-password
  blocklist.
- Current NIST SP 800-63B-4 requires at least 15 characters for a password used
  as the only authentication factor, permits 8 only when the password is part
  of MFA, and prohibits character-composition rules. OWASP reflects the same
  guidance. See `research/password-policy-guidance.md`.

## Requirements

- R01: The backend remains the authoritative password-policy enforcement
  boundary; the frontend mirrors the same contract for feedback.
- R02: New administrator passwords require 8-128 Unicode code points after NFC
  normalization and must contain uppercase, lowercase, digit, and special
  character classes. Uppercase means ASCII `A-Z`, lowercase means ASCII `a-z`,
  digit means ASCII `0-9`, and special means printable ASCII punctuation
  (`U+0021-U+002F`, `U+003A-U+0040`, `U+005B-U+0060`, or
  `U+007B-U+007E`). Spaces and other Unicode code points remain allowed but do
  not satisfy any required class.
- R03: Apply the new length and composition policy only when creating or later
  changing a password. Login normalizes the submitted password identically but
  performs only transport-safety validation (non-empty, at most 128 code
  points) before Argon2id verification, so an existing password that was valid
  under the previous policy continues to work.
- R04: Preserve the 128-code-point maximum, NFC normalization, no trimming,
  Unicode support, whitespace support, paste/autofill, and the stable
  `invalid_password` field code for new-password policy failures.
- R05: Use distinct stable field codes and English/Simplified Chinese messages
  for new-password policy failures and login input failures so each form
  describes its actual rule without exposing internal codes.
- R06: Existing stored Argon2id hashes and accounts remain compatible; this
  change does not migrate or rehash credentials.
- R07: Add boundary tests for every accepted/rejected part of the final rule in
  both Go and TypeScript, plus localized form coverage.

## Acceptance Criteria

- AC01 (R01, R02): The API and admin agree on new passwords immediately below,
  at, and above the 8-character boundary, at the 128-character maximum, and on
  every required composition class. Non-ASCII letters/digits, spaces, and
  Unicode symbols do not accidentally satisfy an ASCII class.
- AC02 (R04): Passwords are still counted by Unicode code point after NFC
  normalization, are not trimmed or truncated, and values over 128 code points
  are rejected.
- AC03 (R05): Setup and login display accurate localized password guidance in
  English and Simplified Chinese and never render `invalid_password` or
  `invalid_login_password`.
- AC04 (R06): Existing accounts continue to log in with their current password;
  Argon2id parameters and stored PHC format do not change.
- AC05 (R07): Backend, admin, generator/package, and generated-project checks
  pass.
- AC06 (R03): A legacy 15-128-code-point password without the four required
  creation classes can still reach Argon2id verification during login, while a
  newly submitted setup password with the same missing classes is rejected.

## Out of Scope

- Adding MFA, password recovery, password-change UI, a password-strength meter,
  or a compromised-password blocklist.
- Changing Argon2id parameters, login throttling, sessions, or database schema.
- Making password policy configurable through `.env`.
