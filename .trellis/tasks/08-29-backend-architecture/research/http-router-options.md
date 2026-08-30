# Go HTTP Router Options

Researched: 2026-08-30. Scope: routing/handler foundation for the generated Go API. This compares current primary project documentation and the existing template; it does not select a router or authorize dependencies.

## Current Template and Required Surface

- `template/api/cmd/server/main.go` already uses `net/http`, an explicit `http.Server`, and `http.NewServeMux` with method-qualified `GET /health`.
- The first auth milestone needs a small fixed route set for setup status/completion, login, current authentication, logout, and health. It needs composable middleware for request bounds, origin/CSRF enforcement, authentication, safe errors, and logging, but has no established need for a large framework, template renderer, automatic binding, or extensive nested resources.
- The accepted R63/R65 architecture requires HTTP framework types to remain inside `auth/adapter/httpapi` even if a third-party router is selected.

## Standard Library `net/http`

Current `ServeMux` patterns match HTTP method, optional host, path literals, named single-segment wildcards, and remainder wildcards. `Request.PathValue` reads named values. Handlers and middleware use the standard `http.Handler` contract. See the official [`net/http` documentation](https://pkg.go.dev/net/http#ServeMux).

Advantages:

- Keeps the generated API on the stable standard contract the user values and preserves the existing template direction.
- Covers this milestone's method/path routing without a router dependency.
- Keeps handlers, middleware, tests, and future adapters interoperable with the Go ecosystem's `http.Handler` boundary.
- Avoids framework-owned context, binding, response, error, and lifecycle types.

Costs:

- Route grouping and middleware chaining need small project-owned helpers or explicit composition.
- JSON decoding limits, validation, response envelopes, safe error mapping, recovery, request IDs, and logging remain application responsibilities; `net/http` is not a complete API framework.
- A substantially larger API with deeply nested route groups may find a focused router more ergonomic later.

## Chi

[Chi](https://github.com/go-chi/chi) is a small composable router that remains fully compatible with `net/http`, supports route groups/subrouters and scoped middleware, and has no external dependencies in its core. It is the closest alternative if standard `ServeMux` composition becomes cumbersome.

Advantages over direct `ServeMux`:

- Convenient nested route groups, mounts, and middleware scopes.
- Keeps standard `http.Handler` signatures and is less invasive than a full framework.

Costs for this milestone:

- Adds a third-party routing API for capabilities now substantially overlapped by the standard library.
- Path parameters and routing composition become Chi-specific even though handler signatures remain standard.
- Selecting it preemptively adds dependency/update surface without a demonstrated route-complexity requirement.

## Gin and Echo

[Gin](https://github.com/gin-gonic/gin) provides its own `gin.Context`, binding/validation, rendering, middleware, and routing conventions. [Echo](https://github.com/labstack/echo) similarly provides a framework context, data binding, centralized errors, middleware, rendering, and server conveniences. These can reduce API boilerplate and provide a cohesive framework experience.

For Temvia's accepted boundary, that convenience creates a larger transport-framework surface inside the HTTP adapter and duplicates project decisions already being made explicitly for validation, safe errors, logging, and server lifecycle. Neither framework is needed to satisfy the current routes, and choosing one would conflict with the user's preference to favor stable standard-library APIs unless its additional features solve an actual requirement.

## Recommendation

Keep `net/http` and `http.ServeMux` for the first milestone. Build only small project-owned HTTP helpers that express an actual repeated contract, while keeping middleware as `func(http.Handler) http.Handler`. Revisit Chi if route grouping or mounting becomes materially painful; a later router swap remains localized to `auth/adapter/httpapi` under R63/R65. Do not select Gin or Echo merely to obtain JSON binding or middleware bundles.

The user accepted this recommendation under R70. Exact routes, request limits, JSON rules, middleware order, recovery/logging, and response/error contracts remain design work; R70 does not authorize implementation.
