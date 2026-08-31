# React setup and login frontend design

## 1. Architecture and Boundaries

The admin remains an independent Vite application in `template/admin`. It consumes the Go API over HTTP and shares no generated TypeScript types or build workspace with the Go module. The application is organized by feature and stable shared boundaries rather than generic page-wide service buckets:

```text
template/admin/
├── Caddyfile
├── Dockerfile
├── components.json
├── playwright.config.ts
├── vite.config.ts
├── vitest.config.ts
├── src/
│   ├── app/                     # bootstrap, router context, QueryClient
│   ├── routes/                  # TanStack file routes and route boundaries
│   ├── features/auth/           # setup/login/session UI, schemas, query options
│   ├── components/              # app shell and open-code shadcn components
│   │   └── ui/
│   ├── shared/api/              # Fetch adapter, success/problem schemas, errors
│   ├── shared/i18n/             # initialization, locale selection, resources
│   └── test/                    # Vitest/Testing Library setup and MSW utilities
└── e2e/                         # real-stack Playwright flows and accessibility smoke
```

Exact filenames may follow the installed TanStack Router and shadcn generators, but ownership must remain equivalent. UI components do not call Fetch directly. Route loaders and auth feature query/mutation functions use the shared HTTP boundary. Generated `routeTree.gen.ts` is treated as tool output and kept synchronized with route source.

No child Trellis tasks are required. The UI, same-origin proxy and generator inventory are one jointly verifiable template contract. Execution is ordered so lower boundaries exist before routes and end-to-end verification.

## 2. Runtime Bootstrap

Bootstrap occurs in this order:

1. Inspect `window.location` before initializing React. Only the `/setup` route may capture authority. Parse the fragment as URL parameters, require exactly one `token` and canonical 43-character unpadded Base64URL syntax, then call `history.replaceState` with the same pathname and search but no fragment.
2. Store a lexically valid credential in a small module-scoped in-memory authority holder. It is never placed in a React prop tree above the setup feature, URL/search state, browser storage, cookies, QueryClient, logs or error messages. Clear it on successful setup, invalid-authority response or navigation away from setup.
3. Resolve and initialize i18next before the first render. Read a supported manual preference from one namespaced localStorage key, otherwise inspect `navigator.languages`, otherwise select English. Install bundled `zh-CN` and `en` resources, update document `lang` and `dir`, and use English as the resource fallback.
4. Construct one in-memory QueryClient, the typed API/auth capability and TanStack Router. Mount React only after these synchronous/asynchronous prerequisites are ready, avoiding a credential exposure frame or locale flash.

Malformed or absent setup fragments are removed just as promptly when present and become a persistent recovery state. The backend remains responsible for deciding whether a lexically valid token is current, expired or already consumed.

## 3. Routes and Authentication Flow

The file route tree contains:

- `/setup`: public setup route. It resolves setup status. Complete status redirects to `/login`; required status plus in-memory authority renders the setup form; required status without authority renders instructions to retrieve and reopen the latest API-log link. A status dependency failure renders a retryable page state.
- `/login`: public login route. It resolves setup status first. Required status replaces the login form with initialization instructions; complete status renders the login form. An already authenticated user may proceed to `/`.
- A pathless authenticated parent: its `beforeLoad`/loader resolves the current-user query through the typed router auth capability. `unauthenticated` redirects to `/login`; network, protocol and `service-unavailable` failures remain visible in a route error state and never masquerade as logout.
- `/` below the authenticated parent: the minimal Home screen inside the Sidebar shell.
- Root not-found/error boundaries: localized persistent pages with safe navigation or retry actions.

The router context contains the QueryClient and a narrow authentication capability that can resolve the current user without exposing transport internals. It does not contain a second user cache. Login always navigates to the accepted protected `/` destination; no unvalidated return URL is introduced in this milestone.

## 4. Server State and Mutations

Stable query keys cover setup status and current user. Query option factories live with the auth feature so loaders, components and mutations share schemas and behavior.

- Setup status and current-user checks do not blindly retry authentication or dependency failures. Retry is an explicit user action in persistent UI.
- Successful setup writes setup status `complete`, clears setup authority and navigates to login. It does not seed current user because setup creates no session.
- Successful login writes the returned user to the current-user query and navigates to `/`.
- Successful logout removes current-user query data and navigates to login.
- Failed logout, especially `503`, retains current-user data and the authenticated route, then shows an inline retry action.
- A current-user `401 unauthenticated` clears stale current-user data and permits the protected-route redirect. Other failures preserve the distinction between unknown authentication state and confirmed unauthenticated state.

TanStack Query cache is process-memory only and is recreated on reload. `/api/auth/me` is the authority after reload. No auth data is copied into React Context, Zustand or localStorage.

## 5. HTTP and Runtime Validation

The shared Fetch adapter accepts a relative endpoint, method/body schema expectations and `AbortSignal`. It always uses same-origin credentials, `Accept` values for JSON/Problem Details, `Cache-Control` behavior compatible with the no-store API, and JSON content type for bodies. It has no global redirects, navigation or toasts.

Responses are separated into:

- typed endpoint success values parsed by Zod;
- a parsed RFC 9457 Problem Details value carried by `ApiProblemError`;
- transport failures such as offline/DNS/aborted requests;
- protocol failures such as an unexpected content type, status/body combination or schema mismatch.

`204` logout is handled without JSON parsing. Unknown or malformed bodies produce a localized generic persistent error; raw response text and backend internal detail are not shown. Auth mutations are never implicitly retried.

The Problem Details translator maps known `type`, top-level `code` and `errors[].code` to typed resource keys. A known JSON pointer is applied through React Hook Form `setError(..., { shouldFocus: true })`; unknown pointers become a form-level localized fallback. `params` may interpolate only a translation's expected safe values. English `title` and `detail` are diagnostic fallback fields, never lookup keys.

## 6. Forms and Validation

React Hook Form owns interaction state and uses Zod 4 through `@hookform/resolvers`. Browser schemas normalize values according to documented deterministic rules where possible and emit stable codes:

- name: Unicode surrounding trim/NFC, non-empty, at most 100 code points and no controls;
- email: surrounding trim, ASCII/length/basic mailbox checks, while the server remains authoritative for its full DNS-label grammar;
- password: NFC without trimming, 15–128 code points;
- confirmation: browser-only equality check and never serialized.

The setup form uses `name`, `email` and `new-password` autocomplete semantics. Login uses `username` for the email identifier and `current-password`. Controls do not block paste. Pending submission prevents duplicate submission without making the page unreadable. Field errors are associated with inputs, a form-level Alert carries persistent non-field failures, and focus moves to the first actionable field.

## 7. UI, Localization and Notifications

Setup and login use a compact centered Card composition built from only the shadcn components needed by the screens. The authenticated layout uses official Sidebar source with `variant="inset"` and `collapsible="icon"`, a `SidebarTrigger`, one Home item and a footer menu for current user, locale and logout. Mobile behavior comes from the Sidebar's off-canvas primitive.

Styling uses Tailwind and shadcn semantic variables with a neutral palette and platform font stacks. Layout, contrast, focus and responsive behavior receive design review, but the task adds no standalone brand language, dark-mode controller, font package or decorative animation.

Sonner is mounted once. It is reserved for non-critical confirmation/information where disappearance does not remove the user's recovery path. Setup/login/logout failures, rate limits, dependency outages and invalid authority use FieldError, Alert or route-page UI. Lucide icons supplement visible labels; icon-only controls have accessible names and decorative icons are hidden from assistive technology.

## 8. Development and Production Delivery

### Development

Vite remains loopback-bound and keeps its preferred, non-strict port. Its `/api` proxy targets the loopback API port derived from the root environment inventory with the existing default. Browser code always calls relative `/api`; no Vite-exposed API base URL or credentialed CORS is added.

### Production image and Compose

`admin/Dockerfile` uses an exact Node 24 build image and pnpm package-manager contract to create `dist`. When a consumer lockfile exists it is installed frozen; the initial generated project without a lockfile can perform its documented first install. A pinned Caddy runtime stage contains only `dist`, the reviewed Caddyfile and runtime necessities, runs deliberately without privileged-port requirements, and contains no Node/source/dependency tree.

Caddy listens on an internal unprivileged port. Handler order is explicit:

1. exact `/api` and `/api/*` proxy to `api:8080` with the path unchanged;
2. hashed Vite asset namespace serves files directly with immutable caching and returns a real missing-file response;
3. remaining existing public files are served, and navigation paths fall back to `index.html` with revalidation caching.

Backend status, content type, `Cache-Control: no-store`, Set-Cookie and Problem Details pass through the proxy. Compose adds an `admin` service and loopback `ADMIN_PORT` publication while retaining the API's loopback port for Vite development and diagnostics. `make up`, `make build` and logs/documentation include the admin. No automatic migration is introduced.

The generic Caddyfile does not claim a public hostname and therefore does not silently own public certificates. Production documentation requires `APP_PUBLIC_URL` to match the external HTTPS origin and describes direct Caddy TLS configuration or an external ingress as deployment alternatives. Nginx is documented only as a replaceable equivalent.

## 9. Template, Provenance and Compatibility

The create-vite artifact remains historical provenance, not an unchanged-product invariant. Replace the old exact-demo test with an independent required admin inventory plus meaningful configuration/dependency assertions. Preserve byte-for-byte checks across template source, packed npm artifact and generated output, including binary assets and nested dotfiles. Update `src/generate.ts` preflight at the same time as the test inventory.

`UPSTREAM.md` records the original seed and explains the intentional application replacement. Admin/root/generated README files describe actual commands, setup-link behavior, the Vite and Caddy origins, lockfile expectations and production topology. The frontend Trellis specs are rewritten from placeholders/obsolete demo rules to conventions demonstrated by the resulting code.

No database migration or backend API change is planned. Existing generated projects are unaffected until regenerated; this is a template upgrade. Consumers may replace Caddy with an established gateway if they preserve SPA fallback, exact `/api` proxying, cache rules and `APP_PUBLIC_URL` equality.

## 10. Failure, Rollback and Operational Considerations

- If the API is temporarily unavailable, Caddy and the SPA may still run; the UI renders the persistent dependency/transport state. Caddy must not rewrite the proxy failure to the SPA shell.
- If Redis is unavailable, setup-status behavior remains governed by the backend while login/session operations surface `503`; frontend code does not infer authentication failure.
- A bad origin setting consistently yields backend `403 forbidden`; docs and tests diagnose the configuration rather than adding CORS.
- Rollback is a source/template/container revert. There is no schema rollback. The API remains independently operable while the admin service is stopped or reverted.
- Any verified mismatch in the shipped backend contract returns the task to planning instead of silently changing server semantics.
