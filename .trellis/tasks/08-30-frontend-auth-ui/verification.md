# React setup and login frontend verification

Verified on 2026-08-31. No setup credential, session cookie, database password,
Redis password, or test password is recorded in this file.

## Packed generator boundary

- Final packed artifact:
  `/tmp/temvia-frontend-auth-final.XAeUlK/create-temvia-0.0.0.tgz`
- SHA-256:
  `f6de9078c30fdb5eb737d453edcebcd1f72faded27768fcd0f1915fc8924559e`
- The artifact was installed offline with production dependencies only and its
  mapped `create-temvia` bin generated
  `/tmp/temvia-frontend-auth-final.XAeUlK/generated`.
- The generated output was synchronized one way to
  `/tmp/temvia-frontend-auth-verified.e7m8gk/generated` on Centaurus. The npm
  package test compared every required source byte with the packed and
  generated copies, apart from the documented Go module rewrite.

## Local generator and admin checks

| Check | Result |
| --- | --- |
| `pnpm check` | Passed |
| `pnpm build` | Passed |
| `pnpm test` | 12/12 passed |
| `pnpm test:git` | 5/5 passed |
| `pnpm test:package` | 2/2 passed |
| `git diff --check` | Passed |
| `pnpm --dir template/admin lint` | Passed |
| `pnpm --dir template/admin check` | Passed |
| `pnpm --dir template/admin test` | 7 files, 24/24 tests passed |
| `pnpm --dir template/admin build` | Passed |

The production CSS was inspected after the build: Sidebar widths compile to
`width:var(--sidebar-width)`, and no invalid `width:--sidebar-width`
declaration remains.

## Centaurus generated-project checks

The final packed output passed these checks on Centaurus with Node 24.20.0,
pnpm 11.24.0, and Go 1.27.0:

- fresh admin install with ignored dependency scripts;
- Oxlint: 0 warnings and 0 errors across 53 files;
- `tsc -b`;
- Vitest: 7 files and 24 tests;
- Vite production build;
- `go test ./...`;
- `go vet ./...`;
- `go test -race ./...`;
- `go build ./cmd/server`.

Compose built the `api`, `migrate`, and multi-stage `admin` images. Migration
was run explicitly before the API and admin were started. The final Caddy
runtime runs as `uid=100(caddy)`, has no Node executable, and contains neither
the source tree nor `node_modules`.

## Caddy boundary probes

| Request | Observed contract |
| --- | --- |
| `/` | `200 text/html`, `Cache-Control: no-cache` |
| `/login` | `200 text/html`, SPA history fallback, `no-cache` |
| `/api/setup/status` | `200 application/json`, `no-store` |
| exact `/api` | backend `404 application/problem+json`, `no-store` |
| unknown `/api/*` | backend `404 application/problem+json`, `no-store` |
| exact `/assets` | real `404`, not `index.html` |
| missing `/assets/*.js` | real `404`, not `index.html` |
| built hashed JavaScript asset | `200 text/javascript`, one-year immutable cache |

## Browser and visual verification

Playwright Chromium ran against the generated Caddy origin and a fresh setup
link. Both tests passed:

1. setup authority removal and non-persistence, administrator creation,
   explicit login, protected Home, session restoration after reload, English
   and Chinese locale behavior, mobile Sidebar, successful logout, browser
   console audit, and axe smoke;
2. unauthenticated protected navigation redirecting to login.

Targeted desktop and mobile screenshots were inspected. That review exposed a
Tailwind 4 CSS-variable incompatibility in the imported Sidebar source which
allowed the fixed desktop Sidebar to cover page content. The utility syntax was
corrected, the screenshots were repeated successfully, and Playwright now
asserts that the Home heading begins to the right of the visible Sidebar.

## Deliberate limits

- Chromium is the only browser engine in this milestone.
- Generic Compose uses HTTP on a loopback-published port. Public DNS and TLS
  remain operator deployment choices documented in the generated README.
- Password recovery, MFA, roles, dark mode, and a Zustand store remain outside
  this task.
