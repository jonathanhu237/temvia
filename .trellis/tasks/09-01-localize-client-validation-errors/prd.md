# Localize client validation errors

## Goal

Translate client-side authentication validation codes before rendering them so
raw identifiers such as `invalid_password` never reach the UI.

## Background

- The supplied screenshot in `research/raw-validation-code.png` shows
  `invalid_password` rendered below a password field.
- `features/auth/schemas.ts` deliberately stores stable codes in Zod issue
  messages: `invalid_name`, `invalid_email`, `invalid_password`, and
  `password_mismatch`.
- Server field problems already use the `fieldKeys` mapping in
  `shared/api/problems.ts`, but React Hook Form's client validation errors flow
  directly into `FieldError`, which renders the untranslated issue message.
- The defect affects both setup and login because they share the same schemas
  and field components.

## Requirements

- **R01 — Localized client errors:** Every known client-side authentication
  validation code renders through the existing English/Simplified Chinese
  field-error resources rather than as a raw stable identifier.
- **R02 — One field-code mapping:** Client and server field validation reuse
  the same code-to-message-key mapping. Do not create a second table that can
  drift.
- **R03 — Stable schema contract:** Keep Zod schemas locale-independent and
  preserve their stable issue codes for tests and programmatic handling.
  Translation occurs at the UI/display boundary.
- **R04 — Safe fallback:** An unknown or missing client field code must never
  be displayed verbatim; use the localized generic invalid-value message.
- **R05 — Interaction and accessibility:** Preserve field placement,
  `aria-describedby`, `aria-invalid`, first-error focus, password visibility,
  autocomplete, paste, and server Problem Details translation.
- **R06 — Regression coverage:** Cover all four emitted client codes in both
  locale behavior and assert that snake-case identifiers are absent from the
  rendered form.

## Acceptance Criteria

- **AC01 (R01, R02):** Setup client validation renders localized name, email,
  password, and confirmation messages using the same mapping as server field
  problems.
- **AC02 (R01):** Login client validation also renders localized email and
  password messages.
- **AC03 (R03):** Schema tests continue to observe stable issue codes and no
  i18n dependency is introduced into `schemas.ts`.
- **AC04 (R04):** Unknown field codes resolve to the localized `invalidValue`
  fallback and raw identifiers are not rendered.
- **AC05 (R05):** The localized error node remains associated with its input,
  and the existing form focus and server-error tests pass.
- **AC06 (R06):** Admin lint, type-check, tests, and build pass; root template
  and package/generator checks remain green.

## Out of Scope

- Changing password, email, or name validation policy.
- Changing backend Problem Details codes or response shapes.
- Adding a new form library, i18n library, error-summary component, or
  persistent helper descriptions.
- Revisiting the surrounding authentication-page visual design.
