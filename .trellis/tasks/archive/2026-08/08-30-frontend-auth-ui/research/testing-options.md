# Frontend testing and UI-review options

Research snapshot: 2026-08-30.

## What must be verified

The auth UI has three distinct risk levels. A single runner is a poor fit for all three.

1. Pure application rules: locale resolution, setup-fragment extraction and cleanup, Zod validation, Problem Details parsing/localization, API response parsing, and query retry rules.
2. Rendered component behavior: labels, keyboard/paste behavior, pending state, focus after validation, field/global errors, language switching, and reactions to documented HTTP responses.
3. Browser and system integration: real history behavior, Vite proxying, Go API/PostgreSQL/Redis integration, HttpOnly cookie sessions, protected reloads, logout, responsive layouts, and accessible rendered pages.

## Runner choices

| Choice | Strength | Cost for Temvia | Decision |
| --- | --- | --- | --- |
| Vitest | Uses Vite's resolver/transforms, TypeScript/ESM support, fast watch mode | Adds a test runner and DOM environment | Recommended for unit and component tests |
| Jest | Mature ecosystem | Duplicates Vite transformation/configuration and offers no requirement-specific advantage here | Do not add |
| Vitest Browser Mode | Component tests in a real browser | Adds a second browser-test harness/provider alongside the end-to-end runner; slower than a DOM emulator | Defer; Playwright already covers real-browser risks |
| Playwright Test | Real Chromium/Firefox/WebKit, auto-waiting locators, traces, screenshots, network inspection | Browser downloads and system-test setup are heavier | Recommended for a small, high-value end-to-end suite |
| Cypress | Strong interactive runner | A second alternative end-to-end ecosystem without an advantage required by these flows | Do not add |

Use Vitest with `jsdom`, not `happy-dom`, for component tests. `jsdom` favors web-platform compatibility over maximum startup speed; the auth component suite will be small enough that the difference is not worth choosing the less complete emulator. Real cookie/browser/proxy behavior remains Playwright's responsibility.

## Component test tools

### React Testing Library and user-event

Use `@testing-library/react`, its explicit `@testing-library/dom` peer, `@testing-library/user-event`, and `@testing-library/jest-dom`.

- Query forms by roles, labels and visible names instead of component instances or CSS classes.
- Drive normal interactions through `userEvent.setup()`; reserve `fireEvent` for a concrete low-level browser event that user-event does not model.
- Use jest-dom's semantic DOM assertions with Vitest.

This makes accessibility semantics part of ordinary component testing without coupling tests to shadcn/Radix implementation details.

### Mock Service Worker

Use MSW 2 in Vitest through its Node integration, with strict failure on unhandled `/api` requests.

- Intercept requests at the HTTP boundary instead of mocking the project-owned API module, `fetch`, TanStack Query, or React Hook Form internals.
- Model documented RFC 9457 responses such as invalid credentials, field validation, rate limiting and dependency unavailable.
- Keep mock handlers in test code only. Do not generate a browser service-worker asset or ship MSW in the production bundle.
- Use the real backend, not MSW, for the principal Playwright setup/login/session/logout path.

The extra dependency is justified because error rendering crosses Fetch, runtime schemas, TanStack Query, React Hook Form, i18n and UI boundaries. A stubbed hook would skip most of the behavior at risk.

## End-to-end and UI review

Use `@playwright/test` for a deliberately small system suite against the generated app and real Go/PostgreSQL/Redis stack on Centaurus:

- setup link reads and removes `#token`, creates the administrator, and reaches explicit login;
- login establishes the HttpOnly session, protected navigation and reload restore the user, and logout returns to login;
- language preference and core keyboard/focus behavior persist as specified;
- desktop and narrow mobile viewports render and operate without overflow or inaccessible controls.

Make Chromium the initial automated browser gate. Firefox/WebKit projects can be added when the project declares those browsers part of its support contract; downloading and running three engines before such a contract adds recurring cost without a current acceptance requirement.

For review during implementation:

- expose/forward the Centaurus frontend URL for manual inspection in the user's local browser;
- use Playwright's UI/debug mode during development and retain traces/screenshots on failures;
- capture targeted screenshots for design review, but do not commit broad pixel-diff baselines initially because font rendering, operating system and browser version make them noisy;
- assert visible behavior and accessibility roles rather than internal class names.

## Accessibility

Use `@axe-core/playwright` on setup, login and the authenticated landing page for automatically detectable WCAG A/AA issues. Also perform manual keyboard, focus, zoom/reflow and screen-reader-oriented review. Axe cannot prove accessibility; official Playwright guidance explicitly recommends combining automated and manual assessment.

## Coverage policy

Do not add a numeric line-coverage threshold or coverage-provider dependency in the first template milestone. Require tests around behavior whose failure would break the contract:

- pure boundary/parsing/selection rules receive unit tests;
- forms and documented error states receive component integration tests;
- one principal real-system auth lifecycle plus responsive/accessibility smoke receives Playwright tests.

This avoids tests that merely restate configuration while still placing every security- and navigation-sensitive frontend boundary under an appropriate test.

## Proposed development dependencies

Registry snapshot only; lockfile generation should resolve the accepted compatible versions during implementation.

| Package | Snapshot | Responsibility |
| --- | ---: | --- |
| `vitest` | 4.1.11 | unit/component runner |
| `jsdom` | 30.0.1 | emulated DOM for fast component tests |
| `@testing-library/react` | 16.3.3 | React rendering/query helpers |
| `@testing-library/dom` | 10.4.1 | explicit Testing Library peer/core queries |
| `@testing-library/user-event` | 14.6.6 | realistic component interactions |
| `@testing-library/jest-dom` | 7.0.1 | semantic DOM assertions |
| `msw` | 2.15.0 | HTTP-boundary mocks for component tests |
| `@playwright/test` | 1.62.1 | real-browser system tests and review artifacts |
| `@axe-core/playwright` | 4.13.0 | automated accessibility scans in Playwright |

Proposed scripts are `test` for one-shot Vitest, `test:watch` for local watch mode, and `test:e2e` for Playwright. Accessibility checks live in the end-to-end suite rather than creating another runner.

## Primary sources

- Vitest features and DOM environments: <https://v4.vitest.dev/guide/features>
- Vitest Browser Mode: <https://vitest.dev/guide/browser/>
- React Testing Library principles: <https://testing-library.com/docs/react-testing-library/intro/>
- Testing Library user-event: <https://testing-library.com/docs/user-event/intro/>
- MSW architecture and integrations: <https://mswjs.io/docs/>
- Playwright best practices: <https://playwright.dev/docs/best-practices>
- Playwright assertions: <https://playwright.dev/docs/test-assertions>
- Playwright accessibility testing: <https://playwright.dev/docs/accessibility-testing>
