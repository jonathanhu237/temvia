# Design: revised administrator password policy

## Boundaries

The Go domain remains authoritative. The React admin mirrors the rule only to
give immediate feedback; a direct API client cannot bypass the backend.

Password creation and password verification become separate domain concepts:

- `NewPassword` validates a newly chosen password against the 8-128 length and
  four-class creation policy.
- `NewLoginPassword` validates only the login transport boundary: valid UTF-8,
  NFC normalization, non-empty, and at most 128 Unicode code points.
- Both return the existing `domain.Password` value so hashing and verification
  ports do not change.

`Setup.Complete` continues to use `NewPassword` before hashing.
`Authentication.Login` switches to `NewLoginPassword` before rate limiting and
Argon2id verification. This separation prevents future policy changes from
locking out credentials that were valid when stored.

## Character contract

After NFC normalization, count Unicode code points for the 8-128 bounds. Scan
the normalized value once and record these ASCII classes:

| Class | Code points |
| --- | --- |
| Uppercase | `U+0041-U+005A` (`A-Z`) |
| Lowercase | `U+0061-U+007A` (`a-z`) |
| Digit | `U+0030-U+0039` (`0-9`) |
| Special | `U+0021-U+002F`, `U+003A-U+0040`, `U+005B-U+0060`, `U+007B-U+007E` |

Space, non-ASCII letters/digits, emoji, and other Unicode characters are
allowed as additional characters but do not satisfy a required class. Use
explicit code-point ranges in Go and TypeScript rather than separate regular
expressions whose Unicode behavior could drift.

## Validation and error contract

- Setup creation failures retain `errors[].code = "invalid_password"`.
- Login input failures use `errors[].code = "invalid_login_password"` so the
  UI can explain the actual non-empty/128-character input boundary instead of
  showing creation requirements.
- The frontend field-code table maps both codes to typed i18next resources.
- Setup copy states the 8-128 and four-class policy. Login copy asks for a
  non-empty password of at most 128 characters.
- `password_mismatch` and all top-level Problem Details behavior remain
  unchanged.

## Compatibility and migration

No schema, PHC, Argon2id, session, or environment migration is needed. Existing
15-128-code-point passwords continue through login verification even when they
lack one or more new creation classes. New setup requests are subject to the
new creation policy.

This is a source-template contract change. Generated projects that update code
receive the compatibility-preserving login behavior; already stored hashes are
not rewritten.

## Operational considerations

The policy is compiled into the API and static admin bundle. It is not an
`.env` setting because runtime-configurable validation would require a new API
policy-discovery contract and could let the static client drift from the
backend. A future password-change feature must call the creation validator for
the replacement password.

Rollback to the old creation minimum requires reverting the source rule and
copy only. Passwords created under the new rule are at least eight characters;
rolling back to a 15-character minimum could prevent those users from logging
in if the old shared login validator were restored, so any rollback must retain
the separate login validator.
