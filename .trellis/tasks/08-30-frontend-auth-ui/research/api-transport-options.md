# Browser API transport comparison

Research snapshot: 2026-08-30.

## Responsibilities

The transport layer must:

- call same-origin relative `/api` URLs and allow the browser to manage the HttpOnly session cookie;
- accept an `AbortSignal` from route/server-state lifecycles;
- encode the small JSON request bodies with explicit content type;
- check `Response.ok`, because Fetch resolves normally for HTTP 4xx/5xx;
- distinguish expected success JSON, empty responses, RFC 9457 `application/problem+json`, malformed/unexpected responses, network failures and cancellation;
- validate untrusted success/problem bodies at the boundary with small Zod schemas;
- never retry setup, login or logout implicitly and never log request bodies or setup credentials.

It should expose endpoint functions such as `getSetupStatus`, `completeSetup`, `login`, `getCurrentUser`, and `logout`, rather than allowing components to assemble URLs and parse responses directly.

## Comparison

| Candidate | Strengths | Costs for Temvia | Fit |
| --- | --- | --- | --- |
| Native Fetch plus a small typed adapter | Browser standard, native `Request`/`Response`/`AbortSignal`, same-origin cookies by default, no dependency, direct content-type control | Must explicitly check status and implement typed error parsing once | Strongest |
| Ky | Polished Fetch wrapper with JSON shortcuts, typed generics, timeout, hooks, structured HTTP/network/timeout errors and configurable retry | Its defaults/policies must be constrained for auth mutations; Problem Details and runtime schemas still require project code | Strong but unnecessary |
| Axios | Mature instances/interceptors, automatic JSON, progress support, cancellation, configurable adapters | Adds a second HTTP abstraction, interceptor lifecycle and Axios-specific error/config types without a requirement for upload progress or multi-runtime adapters | Too much surface |
| OpenAPI-generated Fetch client | Generated endpoint types and low manual drift when an OpenAPI document is authoritative | No OpenAPI contract currently exists; introducing and validating code generation is a separate backend/API governance decision | Defer until an OpenAPI source exists |
| Direct Fetch in components/loaders | Zero wrapper | Repeats content-type/status/problem parsing and makes security-sensitive behavior inconsistent | Reject |

## Why native Fetch is enough

The application deliberately uses one origin in development and production. Fetch's default `credentials` value is `same-origin`, so the browser sends and accepts the server session cookie without `credentials: "include"` or permissive CORS. The adapter should still set `credentials: "same-origin"` explicitly to document the invariant.

Fetch accepts `AbortSignal`, which integrates with TanStack Router loaders and any later server-state library. It does not reject on HTTP error statuses, so the adapter must use `response.ok` and inspect `Content-Type` before decoding. That explicit branch is useful here because an RFC 9457 response is an expected protocol value, while a network failure or malformed body is a different error class.

## Proposed boundary

- `requestJSON` owns headers, request encoding, cancellation and response classification.
- Zod schemas parse both success bodies and the shared Problem Details envelope from `unknown`.
- A typed `ApiProblem` preserves `type`, `status`, optional stable `code`, and field `pointer`/`code`/`params`; UI code never branches on English `title` or `detail`.
- Endpoint modules own paths, methods, request types and expected success schemas.
- Auth/form layers decide presentation, redirects and applying field errors. The transport has no global redirect/toast interceptor.
- No transport-level automatic retry. A later server-state decision may retry safe reads deliberately; authentication mutations remain non-retried unless a product flow explicitly requests a retry.

## Recommendation

Use **native Fetch behind a small project-owned typed adapter**. Add neither Axios nor Ky.

Ky would reduce a few lines of status/timeout boilerplate but not the project-specific Problem Details, Zod parsing, credential-safety or endpoint-contract code. Axios offers capabilities the current frontend does not require. Native Fetch keeps the transport on browser standards while preserving one audited place for protocol behavior.

This decision does not decide TanStack Query versus router loaders. Both can call the same endpoint functions and pass their abort signals.

## Primary sources

- MDN Fetch usage, status handling, response bodies and cancellation: <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch>
- MDN `RequestInit` credentials behavior: <https://developer.mozilla.org/en-US/docs/Web/API/RequestInit>
- Ky documentation: <https://github.com/sindresorhus/ky>
- Axios interceptors: <https://axios-http.com/docs/interceptors>
- Axios cancellation: <https://axios-http.com/docs/cancellation>
- OpenAPI Generator TypeScript Fetch: <https://openapi-generator.tech/docs/generators/typescript-fetch/>
- OpenAPI TypeScript Fetch API: <https://openapi-ts.dev/openapi-fetch/api>
