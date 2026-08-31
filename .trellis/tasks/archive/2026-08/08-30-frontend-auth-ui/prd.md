# React setup and login frontend

## Goal

Replace the generated admin's preserved create-vite demo with a maintainable React authentication experience that lets an operator consume the API's one-time setup link, create the initial administrator, log in with the resulting email and password, restore an existing server session, and log out. The generated project must work in development and as a containerized same-origin deployment.

## Background and Repository Evidence

- `template/admin` is currently an independent React 19, TypeScript 6, Vite 8 and pnpm package containing the fixed create-vite demo. It has no application router, forms, runtime validation, API client, server-state owner, i18n runtime, UI system or frontend tests.
- `.trellis/spec/backend/authentication-contract.md` defines the shipped setup and session API. The React admin consumes that contract; it does not change authentication, cookies, rate limiting or Problem Details semantics.
- `src/generate.ts`, `tests/react-ts-baseline.mjs`, `tests/fixtures/react-ts-baseline.json`, `template/admin/UPSTREAM.md` and `.trellis/spec/frontend/quality-guidelines.md` currently enforce the demo's exact provenance and inventory. Replacing that demo requires an intentional new application/template contract across source, npm tarball and generated output.
- The generated admin remains independent from the root generator package and from the Go module. The root does not become a frontend workspace.

## Requirements

### Product behavior

- **R01 — Setup-link handling:** `/setup#token=<credential>` must capture a single canonical 43-character Base64URL setup credential, remove the fragment from the current history entry before the first React render, retain the credential only in memory, and send it only in the setup request body. Reloading or leaving the cleaned page requires reopening the original setup link.
- **R02 — Initial administrator:** While setup is required and valid setup authority is present, show a localized form for name, email, password and browser-only password confirmation. Successful setup creates no browser session and navigates to login. Missing, malformed, expired or replaced authority must not initialize the system and must show a persistent recovery instruction. A completed setup must not show the creation form.
- **R03 — Login and session restoration:** Login uses email and password, relies on the API's HttpOnly session cookie, loads the returned/current user, and navigates to protected `/`. Reloading a protected route must restore authentication through `GET /api/auth/me`; an unauthenticated result returns to login without a redirect loop.
- **R04 — Logout correctness:** A successful logout removes cached authenticated state and returns to login. A retryable `503` must retain the authenticated UI and must not claim the cookie/session was revoked.
- **R05 — Error experience:** Browser-owned validation, backend JSON-pointer field issues, invalid credentials, invalid setup authority, setup completion, unauthenticated access, rate limiting, dependency unavailability, malformed responses and network failures must have stable localized behavior. Rate-limit UI must not invent a reset time, and critical errors must remain visible with an appropriate retry or recovery action.
- **R06 — Authenticated destination:** The protected index uses shadcn/ui's inset, icon-collapsible Sidebar. It contains product identity, one localized Home item, current-user/locale/logout controls, a sidebar trigger, and a minimal home page with a title and personalized welcome sentence. Mobile uses the Sidebar's off-canvas behavior.
- **R07 — Accessibility and browser behavior:** Setup and login preserve keyboard operation, visible focus, programmatic labels and descriptions, sensible focus-on-error, paste, autofill and password-manager behavior. The layouts remain usable on mobile and desktop, and state is never communicated through color or an icon alone.
- **R08 — Localization:** The first render supports Simplified Chinese and English. Locale selection follows saved manual preference, supported browser languages, then English; only manual selection is persisted. Document `lang` and `dir` stay synchronized. Machine codes, not backend English prose, select translations.

### Architecture and dependency constraints

- **R09 — Explicit ownership:** Use the agreed dependency set below. Do not introduce overlapping alternatives, an empty global store or unrelated UI primitives.

| Responsibility | Accepted choice | Constraint |
| --- | --- | --- |
| UI and styling | Tailwind CSS plus shadcn/ui | Own and adapt generated component source; add only components and Radix primitives used by these screens |
| Routing | TanStack Router, file-based Vite integration | Public setup/login routes and a pathless protected parent; typed router context |
| Form interaction | React Hook Form | Own values, touched/dirty/submission/focus and server field-error application |
| Runtime/browser validation | Zod 4 plus `@hookform/resolvers` | Emit stable codes; duplicate only deterministic public constraints; Go remains authoritative |
| Remote server state | TanStack Query v5 | Single in-memory owner of setup/current-user data; QueryClient is available through router context |
| HTTP transport | Browser Fetch behind a project-owned typed adapter | Relative same-origin URLs, abort signals, Zod response parsing and typed Problem Details; no Axios or Ky |
| Localization | i18next plus react-i18next | Bundled typed `common`, `auth` and `problems` resources; no detector/backend/SaaS plugin |
| Notifications | Sonner through the shadcn wrapper | Transient non-critical success/information only; critical auth failures remain inline |
| Icons | Lucide React | Sole general-purpose icon set; concrete imports and accessible icon usage |
| Tests | Vitest/jsdom, Testing Library, user-event, jest-dom, MSW 2 Node, Playwright Chromium and axe-core Playwright | Test at the owning boundary; no Jest, Cypress, browser-mode Vitest, broad pixel baselines or arbitrary coverage threshold |
| Future client-global state | Zustand, deferred | Preferred only when a concrete client-global state appears; do not install or scaffold it now |

- **R10 — State boundaries:** TanStack Router owns URL/navigation state, TanStack Query owns remote state, React Hook Form owns form state, i18next owns locale state and React owns local presentation state. Do not mirror current user or those other owners in Zustand, Redux or an authentication React Context.
- **R11 — Same-origin delivery:** Development uses a Vite `/api` proxy. Production uses a dedicated multi-stage admin image whose pinned Caddy runtime serves the built SPA and proxies exact `/api` and `/api/*` to the private Go API without path rewriting. Node and source files are absent from the runtime image; SPA fallback must never swallow API or missing hashed-asset errors.
- **R12 — Deployment configuration:** Compose exposes the Caddy admin origin and keeps the API's loopback publication for direct development and diagnostics. `APP_PUBLIC_URL` must equal the browser-visible origin. `.env.example` remains the complete configuration inventory and gives a non-sensitive default for the admin port. Generic Compose does not assume public DNS or automatic TLS; direct Caddy TLS or an external TLS ingress is documented as an operator choice.
- **R13 — Template integrity:** Update the explicit generator inventory, npm-pack tests, admin provenance, frontend specifications and English/Chinese/generated-project documentation for every intentional file replacement/addition. The actual npm tarball, not the source tree alone, must generate the tested application.
- **R14 — Visual scope:** Use a restrained neutral shadcn theme, semantic CSS variables and platform sans/monospace stacks. Do not add a custom brand system, remote/self-hosted font, theme-switching dependency, blueprint motif or decorative motion system.

## Acceptance Criteria

- **AC01 (R01):** Before any React component renders, a valid setup fragment is absent from the address bar, browser history replacement is observable, and the credential is absent from localStorage, sessionStorage, cookies, logs and TanStack Query state.
- **AC02 (R02, R05):** A fresh real setup link completes initial-user creation and navigates to login; missing/malformed/replaced/expired authority and already-complete setup produce the specified persistent localized states without disclosing authority.
- **AC03 (R03):** Valid login reaches `/`, renders the current user's name, and a direct reload of `/` restores the session with `/api/auth/me`.
- **AC04 (R03, R05):** Unauthenticated protected navigation reaches login without looping, while a dependency/network failure renders a retryable persistent state instead of being misclassified as unauthenticated.
- **AC05 (R04):** Successful logout returns to login and protected navigation requires authentication; simulated logout `503` keeps the user on the authenticated page and offers retry.
- **AC06 (R05, R08):** Known Problem Details type/top-level/field codes render Chinese and English translations, field pointers focus the matching control, unknown codes/pointers use a localized generic fallback, and server `title`/`detail` are never translation keys.
- **AC07 (R06, R07):** The accepted desktop sidebar, mobile off-canvas shell, Home view, locale menu and logout controls work with keyboard and pointer input at representative mobile and desktop viewports.
- **AC08 (R07):** Automated interaction tests verify labels, descriptions, focus, autocomplete attributes and paste; the real principal flow has no automatically detectable axe violations or unexpected browser console errors.
- **AC09 (R08):** First-render locale selection, manual persistence, fallback-to-English, and document `lang`/`dir` behavior pass deterministic tests without a visible language flash.
- **AC10 (R09, R10):** The installed dependency graph contains the accepted owners and their required transitive primitives only; it contains no Axios, Ky, Zustand, Redux, second UI framework, i18next detector/backend or alternative notification/icon/test stack.
- **AC11 (R11, R12):** Vite development and the Caddy container both serve the browser flow through relative `/api`; direct SPA route reload works, unknown `/api` remains an API Problem response, missing hashed assets are not rewritten to HTML, cache headers distinguish immutable assets from the revalidated app shell, and the runtime image contains no Node toolchain.
- **AC12 (R13):** Root checks prove the intended source-to-tarball-to-generated byte path and reject missing required frontend/container files or contaminated template artifacts.
- **AC13 (R13):** On Centaurus, the generated admin passes install, lint, TypeScript check, unit/component tests and production build; the generated Go application retains its tests; the built Compose stack passes the fresh setup/login/reload/logout Playwright flow through a forwarded Caddy origin.

## Out of Scope

- Password recovery, email verification, self-registration, MFA, roles/permissions, account management, session/device management and dashboard business features.
- Changing backend authentication, database, Redis, cookie, Origin, rate-limit or Problem Details contracts unless implementation discovers a verified incompatibility and returns the task to planning.
- Persisting TanStack Query state, installing Zustand before it owns a real requirement, or adding a second state/form/router/API/UI abstraction.
- Custom branding, dark-mode controls, remote fonts, elaborate animation, broad screenshot regression suites, additional Playwright browsers, numeric coverage gates and generalized security hardening.
- Treating Caddy automatic HTTPS as configured by the generic Compose template. Nginx remains a documented replacement for deployments that already standardize on it, not a second bundled runtime.

## Risks and Deferred Items

- An API/public-origin mismatch will cause the backend's exact-Origin check to reject unsafe requests; documentation and real-stack tests must use one browser-visible origin.
- A broad SPA fallback can hide API or asset failures behind `index.html`; Caddy matchers and tests must keep those namespaces separate.
- The initial generated project intentionally has no admin lockfile. The Docker build must be able to perform the first install while honoring a checked-in lockfile once the consumer creates one.
- Additional browsers, dark mode, password recovery and a concrete Zustand use case are deferred until requirements justify their cost.
