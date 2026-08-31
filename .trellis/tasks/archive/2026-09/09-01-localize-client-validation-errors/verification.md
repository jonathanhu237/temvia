# Verification

## Code review

- Independent Trellis check found no correctness, accessibility, or scope
  issues.
- Client and server validation paths share `fieldMessageKey`; schemas continue
  to emit locale-independent codes.
- Server errors already localized by submit handlers remain unchanged when
  their React Hook Form error type is `server`.
- Unknown and missing client codes resolve to the localized `invalidValue`
  message.

## Automated checks

All checks passed on 2026-09-01.

- Generated admin on Centaurus, Node 24.20.0 and pnpm 11.24.0:
  `pnpm lint`, `pnpm check`, `pnpm test` (33 tests), and `pnpm build`.
- Root generator locally: `pnpm check`, `pnpm test` (12 tests),
  `pnpm test:git` (5 tests), and `pnpm test:package` (2 tests).
- Trellis manifests: `python3 ./.trellis/scripts/task.py validate
  localize-client-validation-errors`.
- Patch hygiene: `git diff --check`.

## Browser verification

The rebuilt generated admin was exercised in headless Chromium against the
running API, PostgreSQL, and Redis containers on Centaurus with locale
`zh-CN`. The setup form rendered localized messages for `invalid_name`,
`invalid_email`, `invalid_password`, and `password_mismatch`; no raw code was
present in the page text. Each input's `aria-describedby` referenced its
rendered localized error node.

Evidence: [client-validation-chinese.png](evidence/client-validation-chinese.png)
