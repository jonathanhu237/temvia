# Generated admin interface polish implementation plan

## Delivery order

### 1. Lock behavior with focused tests

- Extend the existing auth form/component coverage for label, autocomplete,
  paste, conditional `aria-describedby`, validation focus, and absence of the
  removed persistent descriptions.
- Extend the real-browser flow with semantic assertions for the concise setup
  and login Cards, responsive language trigger, and Sidebar header removal.
- Keep screenshots targeted to the agreed visual review rather than adding
  broad pixel snapshots.

### 2. Simplify the shared public auth shell

- Remove the brand header, `Layers3`, top accent strip, `Separator`, and custom
  Card shadow/border classes from `auth-page.tsx`.
- Compose the local `Card`, `CardHeader`, `CardTitle`, optional
  `CardDescription`, and `CardContent` with a semantic `h1`.
- Move `LanguageMenu` into the Card header and make the single trigger compact
  below the small breakpoint while preserving its accessible name and menu.
- Make `AuthPage` description optional and remove its eyebrow contract; update
  every setup, login, not-found, and error call site deliberately.

### 3. Remove persistent helper copy without weakening errors

- Remove mandatory description props and `FieldDescription` nodes from the
  shared text/password fields.
- Point `aria-describedby` only at an existing conditional error node.
- Remove description arguments from setup and login forms while retaining all
  current RHF/Zod/server error, pending, password reveal, autocomplete, paste,
  and focus behavior.

### 4. Remove temporary runtime branding

- Delete the authenticated Sidebar header rather than leaving an empty state.
- Remove unused brand/eyebrow/helper keys from both locale trees and neutralize
  required recovery/problem copy that still contains the product name.
- Change normal login copy to `Sign in` / `登录`; keep setup title and required
  operational recovery instructions.
- Neutralize the static browser title/description and the Playwright display
  name fixture. Do not rename documentation, packages, repository identity, or
  provenance records.
- Run a scoped search across `template/admin/index.html`, runtime source, and
  browser fixtures to catch remaining user-visible hard-coded brand text.

### 5. Verify source, package, generated output, and visuals

- Run lightweight root checks and task validation locally.
- Pack the real CLI, generate a disposable project, and confirm byte parity for
  all modified template files.
- Rsync the local repository one-way to Centaurus; run admin lint, type-check,
  tests, and production build in the disposable generated project.
- Rebuild/run the generated admin stack on Centaurus with a fresh database and
  forward its Caddy port locally. Run the Playwright authentication flow and
  axe smoke with a fresh setup link.
- Review and save screenshots for normal setup, normal login, expanded and
  collapsed desktop Sidebar, and mobile Sidebar. Confirm the repeated Home
  labels remain unchanged as agreed.
- Dispatch a Trellis check agent, fix verified findings, then decide whether
  the resulting convention needs a frontend spec update before committing.

## Validation commands

Exact disposable paths and ports are selected during execution.

```sh
# Local task and scaffolding checks
python3 ./.trellis/scripts/task.py validate admin-interface-polish
pnpm check
pnpm build
pnpm test

# Generated admin on Centaurus
corepack pnpm install --ignore-scripts
pnpm lint
pnpm check
pnpm test
pnpm build

# Generated real stack on Centaurus
docker compose build admin api migrate
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d api admin
E2E_SETUP_URL='<fresh forwarded setup URL>' corepack pnpm test:e2e
```

The package/generator checks must use the packed artifact rather than copying
the source template directly. Runtime verification also confirms that the
setup credential leaves the URL, the Caddy/API boundary still behaves, and no
unexpected browser console errors appear.

## Risk controls and rollback points

| Area | Risk | Control / rollback |
| --- | --- | --- |
| Shared `AuthPage` props | Exceptional states lose needed instructions | Update every call site explicitly; keep optional descriptions for recovery/error states; route/component tests before visual cleanup is accepted. |
| Field descriptions | Removing nodes leaves broken ARIA references | Assert no dangling `aria-describedby`; retain conditional error IDs and focus tests. |
| Sidebar header removal | Collapsed/mobile geometry shifts incorrectly | Preserve official Sidebar primitives and capture expanded, collapsed, and mobile bounds/screenshots. |
| Runtime copy cleanup | Brand removal accidentally deletes operational meaning | Neutral rewrite in both locales plus scoped key/reference and `Temvia` searches. |
| Template delivery | Source looks correct but package/generated app is stale | Pack/generate byte checks and Centaurus build from the actual generated project. |

No database or backend contract change is permitted. If implementation reveals
one, return the task to planning rather than widening scope.

## Pre-start review gate

- `prd.md`, `design.md`, and this plan have no open product decision.
- `implement.jsonl` and `check.jsonl` contain real, relevant context.
- `task.py validate` succeeds.
- The user reviews the planning summary and explicitly approves implementation
  in a subsequent message before `task.py start`.
