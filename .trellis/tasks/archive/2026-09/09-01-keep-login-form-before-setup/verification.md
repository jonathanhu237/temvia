# Keep login form available before setup verification

Verified on 2026-09-01 from the packed CLI output and a generated admin
application. The login route no longer reads setup status; the setup route
continues to own initialization authority and status handling.

## Source and package checks

- `template/admin`: `pnpm lint`, `pnpm check`, `pnpm test` (8 files, 36 tests),
  and `pnpm build` passed.
- Root: `pnpm check`, `pnpm build`, `pnpm test`, `pnpm test:git`, and
  `pnpm test:package` passed.
- `task.py validate keep-login-form-before-setup` and `git diff --check`
  passed.
- The actual packed CLI generated a disposable admin project; the changed
  login route, locale resources, and browser flow matched the template bytes.

## Generated admin and browser checks

- The generated admin was synchronized one way to Centaurus at
  `/tmp/temvia-admin-polish-verified.k7q4mn/generated/admin`.
- On Centaurus, generated admin install, lint, TypeScript check, 36 Vitest
  tests, and production build passed under Node 24.20.0 and pnpm 11.24.0.
- The rebuilt Caddy stack passed the Chromium flow through
  `http://127.0.0.1:41173`: before setup, `/login` showed the normal email and
  password form, made no `/api/setup/status` request, returned the localized
  generic invalid-credentials message for unknown credentials, and had zero
  axe violations. The existing setup, login, session, locale, responsive
  sidebar, logout, browser-console, and authenticated `/login` redirect checks
  also passed. The separate unauthenticated redirect smoke passed as well.

The independent review repeated the admin lint, TypeScript check and Vitest
suite locally, the packed/generated parity check, and the complete remote
Chromium flow after adding the authenticated `/login` redirect assertion.
The local machine has no bundled Playwright Chromium executable, so the full
browser flow was collected from the forwarded Centaurus runtime.

After the full flow, the disposable database was reset and the uninitialized
runtime was checked again with the system Chrome executable. `/login` rendered
the Simplified Chinese login form, made zero `/api/setup/status` requests, and
had zero axe violations. The screenshot is saved as
`evidence/normal-login-before-setup.png`; `/api/setup/status` returned
`{"status":"required"}` after the final reset.
