# Password policy guidance

Reviewed 2026-09-01.

## Repository evidence

- `template/api/internal/auth/domain/credentials.go:114` normalizes password
  input to NFC and accepts 15-128 Unicode code points. This is the authoritative
  API rule used by both setup and login.
- `template/admin/src/features/auth/schemas.ts:46` mirrors the same bounds for
  form feedback.
- `.trellis/spec/backend/authentication-contract.md:58` records the stable
  backend contract.
- `.trellis/tasks/archive/2026-08/08-29-backend-architecture/prd.md:172`
  records the earlier user decision: 15-128 Unicode code points, no composition
  quota, and password-manager-compatible input.

## Current external guidance

- [NIST SP 800-63B-4, Password Verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver)
  requires at least 15 characters when a password is the sole authentication
  factor. Eight characters is permitted only when the password participates in
  MFA. It also prohibits mandatory character-type mixtures and recommends a
  maximum of at least 64 characters, Unicode support, and no truncation.
- [NIST SP 800-63B-4, Strength of Passwords](https://pages.nist.gov/800-63-4/sp800-63b/passwords/)
  explains that users respond predictably to composition rules. A password such
  as `Password1!` can satisfy four categories while remaining an obvious guess;
  the rules also impose substantial usability and memorability costs.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls)
  mirrors the 15-character threshold without MFA, the 8-character threshold
  with MFA, and the recommendation not to impose composition rules.

## Consequences for this task

The requested `8 + uppercase + lowercase + digit + special` rule is a valid
product choice but not the current standards-aligned choice for this
password-only system. It can reject long lowercase passphrases while accepting
short predictable transformations. Composition does not reliably compensate
for reducing the length floor. If selected, the deviation should be explicit
in the task rather than described as stronger security.
