# Frontend Quality Guidelines

## Scope

These rules cover `template/admin/` and the generated `admin/` application.
The root package is the scaffolding CLI, not a frontend workspace. A template
change must remain correct across source, npm packing and generated output.

## Toolchain and checks

The admin keeps its own Node and pnpm contract: Node `>=24` and
`pnpm@11.24.0`. Run the following from `admin/`:

```sh
pnpm install --ignore-scripts
pnpm lint       # Oxlint
pnpm check      # tsc -b
pnpm test       # Vitest + Testing Library + MSW
pnpm build      # type-check and Vite production build
pnpm test:e2e   # Chromium against a running same-origin stack
```

`vitest.config.ts` gives jsdom an explicit HTTP origin and appends
`--no-experimental-webstorage` to `NODE_OPTIONS` before Vitest starts worker
processes. Preserve this worker-level setting while Node 26's experimental
global Web Storage can shadow jsdom's `window.localStorage`; putting the flag
only on the parent `node` command does not propagate it to Vitest's default
fork pool.

The bundled template intentionally has no lockfile. The first install in a
consuming project creates `admin/pnpm-lock.yaml`; commit it there and let the
Docker build use `--frozen-lockfile`. The generator and npm package exclude
local lockfiles, workspaces, `node_modules`, build output, secrets and tool
state.

For standalone Vite development, the API's `APP_PUBLIC_URL` must equal the
exact origin printed by Vite. If Vite falls back from its preferred port,
update the root `.env`, restart the API so its Origin policy and setup link use
the selected port, and use the replacement setup link. Vite reads `API_PORT`
from the same root environment inventory.

## Application contracts

- Keep the admin independent from the Go module and root package. Browser code
  calls relative `/api` endpoints through `shared/api/client.ts`.
- Validate every API success body and RFC 9457 Problem Details body with Zod.
  Map stable problem types/codes through i18next; never render raw server
  diagnostics.
- Setup authority is captured from `/setup#token=...` before React mounts,
  removed from history, held in module memory and cleared after setup,
  invalid authority or navigation away. Password-reset authority follows the
  same shared parser for `/reset-password#token=v1.<selector>.<verifier>` and
  is never persisted beyond module memory. Invitation acceptance uses the same
  rule for `/accept-invitation#token=v1.<selector>.<verifier>`.
- Authentication state remains in the process memory QueryClient. A failed
  logout keeps the current user and shows a retryable Alert.
- Users/Roles navigation and read UI follow current-principal permissions;
  mutation controls require `superAdmin`. This is presentation only: API
  authorization must still reject direct requests.
- Role and user editors submit complete replacement payloads with `revision`
  or `authVersion`; conflict handling reloads server state before retry.
- Keep all UI text in the English and Simplified Chinese resource trees.
- Recovery request success is generic and localized; reset success, invalid/
  expired-link, loading, validation, and dependency-failure states remain
  visible without rendering API `title`, `detail`, token, or password text.

## Generator and provenance

`tests/react-ts-baseline.mjs` is an independently maintained final admin
inventory and configuration assertion. It is not an exact create-vite demo
hash oracle. `template/admin/UPSTREAM.md` records the fixed create-vite seed,
the filename materialization rule and the intentional application replacement.
When adding an admin file, update the inventory and `src/generate.ts`
preflight together. Preserve byte comparisons from template source to packed
npm artifact to generated output.

## Runtime verification

Use a disposable generated project and a one-way rsync to Centaurus for
resource-intensive checks. Run admin lint/check/test/build there, then build
the API, admin and migration images. Confirm the Caddy runtime contains only
the built static files, proxies exact `/api` and `/api/*` paths without SPA
rewrites, serves hashed assets with immutable caching, returns a real missing
asset response and falls back only navigation paths to `index.html`.

Run Playwright Chromium against the forwarded Caddy origin with a fresh setup
link. Cover setup, login, reload session restoration, locale selection,
password recovery via Mailpit, reset-fragment clearing, invitation activation,
read/mutation permission denial, grant-driven session invalidation,
role-in-use and last-super conflicts, responsive Sidebar navigation, logout
and an axe smoke. Save screenshots and
traces only when a test fails or a targeted review needs them.

Set `PLAYWRIGHT_BASE_URL` to the exact forwarded Caddy origin whenever a flow
uses relative navigation such as `page.goto('/')`; an absolute setup URL does
not configure later tests, and a default port can silently open another local
service. For mobile Sidebar evidence, create the browser context at the mobile
viewport before navigation, wait for `[data-sidebar="sidebar"][data-mobile="true"]`
to become visible, and let the Sheet transition settle before capturing. A
desktop context resized immediately before clicking can race `useIsMobile` and
produce a misleading screenshot of the desktop state.

## Wrong vs correct

Wrong: update an old fixture from the current template and treat that as an
upstream audit, or verify only the source template.

Correct: keep provenance separate from the final inventory, pack the real CLI,
generate from the packed artifact, compare bytes and run application checks on
the generated project.
