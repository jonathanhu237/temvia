# Verification

Verified 2026-09-01.

## Static and generated-project checks

- `template/admin`: Oxlint passed.
- `template/admin`: TypeScript project check passed.
- `template/admin`: Vitest passed, 36/36 tests.
- `template/admin`: production build passed, 2188 modules transformed.
- Root CLI tests passed, 12/12.
- Git behavior tests passed, 5/5.
- npm pack/generated-project tests passed, 2/2.
- `git diff --check` passed.
- Trellis task context validation passed.

The npm package was packed and used to generate a disposable project. Its
admin was synchronized one way to Centaurus, checked with Node 24 and pnpm 11,
built into the Caddy image, and served through the same-origin stack at
`http://127.0.0.1:41173`.

## Runtime checks

- Runtime custom properties resolved to Neutral values:
  - `background`: `oklch(100% 0 0)`
  - `foreground`: `oklch(14.5% 0 0)`
  - `primary`: `oklch(20.5% 0 0)`
  - `accent`: `oklch(97% 0 0)`
  - `sidebar`: `oklch(98.5% 0 0)`
- Setup screen axe violations: 0.
- Authenticated Home screen axe violations: 0.
- Browser console/page errors: 0.
- Setup, login, session restoration, locale selection, responsive Sidebar and
  logout behavior passed in the Chromium authentication flow.
- The final preview database was reset after verification; `/api/setup/status`
  returned `{"status":"required"}` and all four Compose services were running.

## Visual evidence

- `evidence/neutral-setup.png`: setup Card with Neutral borders and primary
  button.
- `evidence/neutral-login.png`: login Card from the independent review.
- `evidence/neutral-home.png`: authenticated Home with a Neutral Sidebar.
- `evidence/visual-verification.json`: authenticated runtime token and axe
  results.
