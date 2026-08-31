# React server-state comparison

Research snapshot: 2026-08-30.

## Project-specific responsibilities

- Bootstrap the current session through `GET /api/auth/me` before protected content renders.
- Share the current user between the authenticated route guard, layout/header and future pages without duplicating it in a separate client-state store.
- Write the login response into the current-user cache immediately.
- Clear authenticated cache only after logout succeeds; a `503` must keep the UI truthful and allow retry.
- Load setup status, deduplicate concurrent reads, cancel obsolete requests and expose pending/error state.
- Establish a reusable pattern for future admin lists, pagination, detail views and mutations.
- Keep the HttpOnly session credential outside JavaScript and never persist the query cache to storage.

## Ecosystem snapshot

Weekly downloads cover 2026-08-23 through 2026-08-29 and are supporting maintenance signals.

| Candidate | Current package | Weekly downloads | Model |
| --- | ---: | ---: | --- |
| TanStack Query | 5.102.8 | 65,663,515 | Query-key cache, observers, mutations, invalidation and cancellation |
| SWR | 2.5.1 | 16,913,942 | Hook-first stale-while-revalidate cache and mutation APIs |
| RTK Query | Redux Toolkit 2.12.0 | 28,281,349 for toolkit | Endpoint cache built on a Redux store |
| TanStack Router loaders only | Router already selected | n/a | Route-owned preload/cache lifecycle |
| Project auth context/store | Project-owned | n/a | Manual remote-state state machine and invalidation |

Zustand and similar stores are client-state containers, not a remote-cache solution. Adding one only to hold `/api/auth/me` would create duplicate server state.

## Comparison

| Concern | TanStack Query | SWR | Router loaders only | RTK Query |
| --- | --- | --- | --- | --- |
| Router preloading | Official `queryClient.ensureQueryData` pattern through typed router context | Can integrate through promises/cache, less direct official composition | Native | Custom integration around Redux dispatch/selectors |
| Mutations/invalidation | First-class mutations, direct cache writes and key invalidation | Mutation and cache update APIs | Project-owned route invalidation and shared state synchronization | First-class endpoint mutations and tag invalidation |
| Current-user single source | Query cache can be read by guard and components | SWR cache can do this | Loader result is route-scoped; cross-route mutation sync needs conventions | Redux-backed endpoint cache |
| Cancellation | Query function receives `AbortSignal` | Supported through fetcher design/project wiring | Loader receives abort signal | Supported through RTK Query lifecycle |
| Future admin CRUD | Strong query keys, pagination, optimistic updates, dependent/prefetched queries | Good for simpler hook-centric fetching | Increasing custom cache/invalidation code | Strong, especially in an existing Redux app |
| Architectural cost | QueryClient provider/context and query conventions | SWR provider/key/mutation conventions | No dependency, more project infrastructure | Introduces Redux Toolkit solely for server state |
| Fit | Strongest | Strong alternative | Fine for the auth milestone, weak as the long-term template convention | No reason without an existing Redux architecture |

## Why Router loaders alone are not enough long-term

TanStack Router can preload and temporarily cache route data. For the two current auth screens it can work without another dependency. The problem appears at mutation boundaries: login must update the authenticated identity, logout must retain or clear it based on the response, the header subscribes to it, and future pages will need invalidation independent of route transitions.

Keeping all of that in Router would either make route loader data a general application store or require a second project-owned auth context. TanStack Query supplies the missing remote-state ownership while Router coordinates when critical data must be present.

## Proposed integration

- Create one in-memory `QueryClient`; do not install a persistence plugin.
- Put the QueryClient in typed TanStack Router context.
- Define reusable `queryOptions` factories beside endpoint modules.
- The authenticated parent's `beforeLoad`/loader ensures the current-user query and redirects when its value is unauthenticated.
- Protected components subscribe to the same query rather than copying its user into React Context or Zustand.
- Login mutation writes the returned user into the current-user query before navigation.
- Logout mutation removes authenticated query data only after the server confirms success. `503` keeps the cached user and presents retryable failure.
- Setup completion updates setup-status data and then navigates to login; it does not populate current user because backend setup creates no session.
- Query functions pass TanStack Query's `AbortSignal` to the Fetch endpoint functions.

## Defaults that must be overridden deliberately

TanStack Query v5 considers data stale by default, refetches stale queries on mount/focus/reconnect, garbage-collects inactive queries after five minutes and retries failed browser queries three times. Those defaults are unsuitable as implicit authentication policy.

For auth/setup queries and all mutations, define explicit freshness and retry behavior. Do not retry `401`, `403`, `409`, `422`, or `429`; do not retry authentication mutations. Service-unavailable/network retry behavior should be a visible, per-query UX policy rather than a hidden global assumption. Exact current-user freshness will be fixed in the authentication flow design, not inherited accidentally from library defaults.

## Recommendation

Choose **TanStack Query v5** for remote server state and keep TanStack Router responsible for navigation/preload coordination.

This is justified by the long-lived admin scope rather than brand consistency. It avoids a hand-built auth cache now and establishes the same query/invalidation model future CRUD screens will need. SWR is capable and smaller in API surface, but its hook-first model offers less benefit than Query's direct route-loader integration here. RTK Query would introduce Redux without a separate Redux requirement.

Do not add Zustand/Redux for authentication. Zustand is the accepted first choice when a concrete cross-page client-state need appears, but this task must not create an empty store or duplicate Router, Query, Form, i18n, or local React state merely to install it preemptively.

## Primary sources

- TanStack Router external data loading: <https://tanstack.com/router/latest/docs/guide/external-data-loading>
- TanStack Router and Query integration: <https://tanstack.com/router/latest/docs/integrations/query>
- TanStack Query v5 defaults: <https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults>
- TanStack Query retries: <https://tanstack.com/query/latest/docs/framework/react/guides/query-retries>
- SWR: <https://swr.vercel.app/>
- SWR mutation: <https://swr.vercel.app/docs/mutation>
- RTK Query overview: <https://redux-toolkit.js.org/rtk-query/overview>
- RTK Query cache behavior: <https://redux-toolkit.js.org/rtk-query/usage/cache-behavior>
- npm package registry and download API: <https://www.npmjs.com/>
