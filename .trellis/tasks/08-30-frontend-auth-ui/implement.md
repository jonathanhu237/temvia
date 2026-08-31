# React setup and login frontend implementation plan

## Delivery Shape and Dependencies

Implement this as one integrated task. Later steps depend on the contracts established earlier: routes depend on bootstrap/API/query boundaries; real browser tests depend on Caddy/Compose; generator assertions and documentation must describe the final file set. Do not implement later steps against placeholders or split them into independently merged partial products.

## Ordered Checklist

### 1. Establish the admin toolchain and application skeleton

- Replace the create-vite demo entry/styles/assets with the agreed application bootstrap and neutral semantic theme.
- Install and exactly pin the accepted runtime/test dependencies only. Initialize Tailwind's Vite integration, shadcn aliases/theme with `iconLibrary: lucide`, TanStack Router's file plugin, Vitest/jsdom and Playwright configuration.
- Add only the shadcn components and corresponding Radix primitives needed by Card/forms/Alert/Sidebar/menu/Sheet/Sonner composition.
- Define lint, type-check, unit/component, build and browser-test scripts. Keep Node and pnpm contracts inside `admin/` and keep the root out of a frontend workspace.
- Generate and retain the TanStack route tree according to the chosen plugin convention.

### 2. Build security-sensitive bootstrap and shared boundaries

- Implement and unit-test pre-render setup-fragment capture, canonical validation, history replacement, in-memory lifetime and clearing behavior before mounting React.
- Implement deterministic locale selection, bundled typed English/Chinese resources, document metadata updates and pre-render i18next initialization.
- Implement the Fetch adapter, endpoint success schemas, RFC 9457 schemas/error classes, abort behavior and localized problem/field mapping.
- Create one QueryClient plus typed router/auth context and auth query option factories. Keep retries, cache ownership and unauthenticated-vs-unknown semantics explicit.

### 3. Implement setup and login

- Add Zod/RHF setup and login schemas with normalization, confirmation-only handling, stable error codes, autocomplete/paste/focus behavior and accessible descriptions.
- Implement setup status routing and the required/complete/dependency-failure states.
- Implement missing/malformed/invalid/expired/replaced setup-authority recovery UI without logging or persisting the credential.
- Implement setup mutation, server JSON-pointer field application, successful authority cleanup and navigation to login without a session assumption.
- Implement login mutation, invalid-credentials/rate-limit/dependency states, current-user cache update and navigation to `/`.

### 4. Implement protected shell and session lifecycle

- Add the pathless protected route with current-user resolution, confirmed-unauthenticated redirect and persistent retry UI for other failures.
- Compose the official inset/icon-collapsible Sidebar, mobile off-canvas behavior, Home navigation, personalized welcome, locale control and current-user footer.
- Implement logout so only acknowledged `204` clears auth state/navigates; retain the authenticated UI and show retry for `503` or transport uncertainty.
- Add localized root error and not-found boundaries without leaking protocol details.

### 5. Add Caddy and generated deployment integration

- Add an admin `.dockerignore`, multi-stage Dockerfile and Caddyfile with pinned images, unprivileged internal listener, exact API matchers, asset/non-asset separation, SPA fallback and reviewed cache behavior.
- Add the admin service and non-sensitive admin-port configuration to Compose/`.env.example`; preserve API loopback access, explicit migration workflow and exact `APP_PUBLIC_URL` requirement.
- Update Makefile commands and generated-project documentation for build/up/logs, frontend development, first lockfile creation, setup link use, same-origin operation, TLS ownership and Nginx replacement requirements.
- Prove the runtime image excludes Node/source files and that `/api`, missing assets and direct history routes keep distinct behavior.

### 6. Add tests at each owning boundary

- Unit tests: setup URL capture/cleanup, locale selection, schema normalization/code-point bounds, success/problem parsing, problem translation and query/cache transitions.
- Component integration tests: setup/login forms, paste/autocomplete/focus, setup state variants, all documented auth Problem Details classes, malformed/network fallback, protected-route behavior and logout uncertainty. Use MSW's Node integration with unhandled requests treated as failures.
- Playwright Chromium: fresh logged setup link, create administrator, explicit login, Home/sidebar, direct reload session restoration, locale change, successful logout, unauthenticated redirect, responsive navigation and axe smoke. Capture screenshots/traces only on failure or targeted review.
- Keep MSW test-only. Do not add coverage thresholds, broad pixel snapshots or extra browser engines.

### 7. Update generator and provenance contracts

- Replace the obsolete exact create-vite demo oracle with an independently maintained final admin inventory and behavior/config assertions. Remove obsolete fixture/assets only when all references and notices are accounted for.
- Synchronize `src/generate.ts` required-file preflight, contamination exclusions, npm-package asset expectations and generated-name transformations with every new file.
- Preserve byte comparisons from source to npm tarball to generated project and tests for missing files, binary assets, local installs/build output/secrets/lockfiles.
- Update `template/admin/UPSTREAM.md`, admin README, root English/Chinese README and generated README so they describe the intentional application and its commands accurately.

### 8. Verify and capture project conventions

- Run formatting/lint/type/unit checks before heavier integration.
- One-way rsync the local repository to Centaurus. If Centaurus is unavailable, report the blocker and do not substitute resource-intensive local admin/container/browser validation without permission.
- Build/install/test the actual packed CLI output and generated project on Centaurus, including Go regression checks, admin checks, container builds, explicit migration and the real-stack Playwright flow through a forwarded Caddy origin.
- Review desktop/mobile UI through the forwarded URL and use Playwright evidence for defects; do not open a Codex sidebar preview.
- Update `.trellis/spec/frontend/*` and affected scaffolding/quality guidance to the conventions proven by the implementation. Run a Trellis check agent after implementation and fix every validated issue before committing.

## Validation Commands

Exact remote paths and forwarded ports are chosen at execution time, but the validation set is:

```sh
# Lightweight local generator checks
pnpm check
pnpm build
pnpm test

# In the generated admin on Centaurus
corepack pnpm install --ignore-scripts
pnpm lint
pnpm check
pnpm test
pnpm build

# Generated backend regression on Centaurus
go test ./...
go vet ./...
go test -race ./...

# Generated production stack on Centaurus; migration remains explicit
docker compose build api admin migrate
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d api admin

# Run after capturing the fresh setup link and matching the forwarded origin
pnpm test:e2e
```

The root npm-pack/offline-install tests must generate the sample used for application verification. Runtime checks additionally inspect response status/content type/cache headers for `/`, a direct SPA route, `/assets/*`, exact `/api`, `/api/*` and unknown API paths; inspect the admin image contents; and assert no unexpected browser console errors.

## Risky Files and Rollback Points

| Area | Risk | Required control / rollback |
| --- | --- | --- |
| Pre-render bootstrap | Setup authority can leak into history/storage/render logs | Unit and browser assertions before route work; revert bootstrap independently if any sink is observed |
| Query/router auth boundary | Redirect loops or `503` misclassified as logout | Typed error branches and integration tests before composing the shell |
| Caddyfile/Compose | SPA fallback can mask API/assets; origin can mismatch | Exact matcher/header probes through the built container; revert admin exposure without changing API/database |
| Admin dependency/config replacement | Overlapping libraries or generated-code/lint drift | Dependency audit, exact pins and lint/type/build checks |
| Generator inventory/provenance | Source works but npm tarball omits files | Actual pack/install/generate byte checks; update preflight and independent inventory atomically |
| Frontend specification rewrite | Old demo contract can contradict the product | Update specs only from verified implementation and rerun Trellis quality check |

No SQL migration or backend contract change is expected. If one appears necessary, stop implementation and return to planning with the incompatibility evidence.

## Pre-Start Review Gate

- `prd.md`, `design.md` and this checklist have no unresolved product decision.
- Both context manifests contain real specification/research entries.
- `task.py validate` succeeds.
- The user reviews the final planning summary and explicitly approves implementation in a subsequent message before `task.py start` is run.
