# React SPA router comparison

Research snapshot: 2026-08-30.

## Scope and comparison rule

The target is a long-lived React + TypeScript + Vite admin SPA backed by an independent Go HTTP API. SSR is not required. Learning cost and the user's prior experience are deliberately excluded from the decision.

"Compare all" means covering every currently meaningful React routing family rather than pretending every abandoned npm package is a viable peer:

- mainstream React routers and their materially different operating modes;
- actively maintained lightweight and type-first routers;
- state-machine, framework-agnostic, and specialized routing architectures;
- framework-bound, superseded, archived, and maintenance-only choices, with the reason they do not enter the final shortlist.

The decision criteria are, in order: end-to-end correctness and type safety, route data/auth/error lifecycle, long-term maintenance, fit with the Vite SPA plus Go API boundary, URL-state handling, code splitting and scale, then ecosystem evidence. Bundle size is relevant only if two candidates otherwise solve the same responsibilities.

## Market map

Weekly downloads are a 2026-08-23 through 2026-08-29 registry snapshot. They are maintenance/adoption signals, not a popularity contest.

| Family | Candidate | Snapshot | What it actually optimizes |
| --- | --- | --- | --- |
| Mainstream | React Router | 8.3.1; 53,225,383 weekly downloads | Broad routing plus optional data-router or application-framework responsibilities |
| Mainstream/type-first | TanStack Router | 1.170.32; 22,100,476 | Whole-route-tree inference, typed URL state, route lifecycle, file routing |
| Lightweight | Wouter | 3.10.0; 2,693,325 | Very small React routing primitives |
| Emerging type-first | `@typeroute/router` | 0.12.1; 33 | Full inferred routes without code generation or a build plugin |
| Niche type-first | Chicane | 3.0.0; 6,656 | Named typed routes and a discriminated route union |
| State manager router | Atomic Router | 0.12.0; 1,736 | Routes as Effector events/stores/effects |
| State-machine router | Router5 | 8.0.1; 28,498 | Framework-independent route-state transitions and middleware |
| Framework-agnostic primitive | Universal Router | 10.0.3; 40,871 | Middleware-style async route resolution without React/history ownership |
| Specialized React router | Found | 1.3.0; 39,302 | Extensible static routes, Redux/Farce integration, Relay-oriented data loading |
| Maintenance-only minimal router | Raviger | 5.3.0; 5,540 | Zero-dependency hooks routing with a feature-complete/frozen scope |
| Legacy type-first | `type-route` | 1.1.0; 1,965 | Named typed path/query routes; last release in 2023 |
| Extremely new | `@plumile/router` | 0.2.3; 550 | New type-safe router without enough release history for a base template |

Other familiar names are not independent current choices: `react-router-dom` is part of React Router; `@remix-run/router` is its low-level engine; Reach Router was succeeded by React Router; Navi states that it is unmaintained; Hookrouter is archived. Page.js and Navigo are generic browser routers and would leave the same React integration responsibilities as Universal Router.

## Serious-candidate comparison

React Router is split by mode because its modes have materially different architecture. Declarative Mode is omitted from the final matrix: once route loaders, pending UI, route errors, authentication bootstrap, and redirects are needed, Data Mode is its strictly more suitable sibling.

| Concern | React Router Data Mode | React Router Framework SPA Mode | TanStack Router file-based | TypeRoute | Wouter | Chicane |
| --- | --- | --- | --- | --- | --- | --- |
| Route/navigation types | Component and API types, but no whole-tree typed `href` contract | Generated route-module types and typed `href` | Whole-tree inferred paths, params, navigation, context | Whole-tree inferred paths, params, navigation via module augmentation | Basic TypeScript and path-param inference | Typed named-route builders and route union |
| Search params | `URLSearchParams`; parsing/validation is application-owned | Same basic URL model; application still owns schemas | First-class parse/validate/type/inherit behavior | Declared search schemas with inferred navigation and reads | Application-owned | Route-specific typed query definitions |
| Data lifecycle | Loaders, actions, revalidation, pending UI, fetchers, route errors | Data Mode plus route modules, generated loader types and framework conventions | `beforeLoad`, loaders, pending/error components, preload and SWR-style loader cache | Preload hooks and boundaries, but deliberately does not own the application's data/cache layer | Application-owned | Application-owned |
| Authentication gate | Parent loader plus redirect | Parent route module loader/client loader plus redirect | Pathless/parent `beforeLoad`, redirect, typed auth context | Middleware/route composition; auth convention remains ours | Wrapper/hook convention remains ours | Application-owned guard convention |
| Code splitting | Manual lazy route objects | Intelligent automatic route splitting | Vite-plugin automatic route splitting | Route lazy loading, manually declared | React `lazy` owned by the app | Application-owned |
| Build/tool coupling | None beyond library | React Router Vite plugin, generated route types and framework file conventions | TanStack Vite plugin and generated route tree | None; TypeScript module augmentation | None | None |
| Navigation blocking | Stable APIs plus experimental prompt convenience | Same | Supported blocker APIs | Explicitly still on roadmap | No first-class lifecycle | No first-class lifecycle |
| Maintenance confidence | Highest | Highest | High | Very low history/adoption despite promising design | High for its deliberately narrow scope | Active but small ecosystem |
| Responsibilities left to Temvia | Typed route/search contract and validation conventions | Typed search validation and acceptance of framework ownership | Mainly API transport/auth-state ownership | Data/cache/auth conventions and maturity risk | Auth, data, errors, URL schemas, lazy conventions | Auth, data, pending/error and splitting conventions |
| Fit for this project | Strong | Strong if React Router's framework conventions are desired | Strongest | Technically attractive but premature for a reusable base | Only if the router is intentionally kept primitive | Too many missing lifecycle responsibilities |

## Detailed assessment

### React Router 8

React Router is three products behind one name:

- Declarative Mode only matches and navigates. It is too low-level for this application.
- Data Mode adds loaders, actions, redirects, pending state, fetchers and route errors while leaving Vite and the application structure under project control.
- Framework Mode wraps Data Mode in a Vite plugin and route-module conventions, adding generated parameter/loader types, typed `href`, automatic splitting, and SPA/SSR/static rendering options. It can run as an SPA, so lack of SSR is not itself a reason to reject it.

Framework SPA Mode is a credible finalist, but it makes React Router an application framework even though Temvia already has an independent Go backend and will select form and server-state ownership separately. Data Mode avoids that control shift, but then its path/search/navigation type contract is materially weaker than TanStack Router's. React Router's strongest advantage is a mature, cohesive async navigation lifecycle and the largest maintenance/ecosystem base.

The earlier discussion named React Router 7. The current release is 8.3.1; an accepted React Router choice must use v8 APIs and documentation.

### TanStack Router

TanStack Router treats the route tree, path parameters, validated search parameters, navigation, loaders and inherited context as one inferred TypeScript contract. This matters for an admin template because filters, pagination, tabs and return-to navigation become URL state instead of scattered strings and ad hoc parsers.

Its `beforeLoad` lifecycle and typed context fit a pathless authenticated parent. The context can receive an authentication service, bootstrap `/api/auth/me`, and redirect before protected child content renders. File-based mode adds a Vite plugin and generated route-tree file; that is build complexity, but it purchases automatic discovery, splitting, and whole-tree inference without turning the SPA into a full-stack framework.

TanStack Router includes a small loader cache but does not require TanStack Query. Selecting the router does not decide the later server-state library.

### TypeRoute (`@typeroute/router`)

This is a new project, formerly introduced as Waymark, and should not be confused with the older `type-route`. Its design is compelling: full path/param/search/navigation inference, roughly 4 kB gzip, lazy loading, preload, error/Suspense boundaries, middleware and devtools without codegen or a Vite plugin.

The technical trade is not learning cost; it is institutional risk. At the snapshot it has 52 GitHub stars, 33 weekly downloads, a pre-1.0 API, and navigation blockers are still on the roadmap. A personal application can reasonably experiment with it. A generator intended to provide a stable long-term base should not make its routing contract depend on such a young project yet.

### Wouter

Wouter is mature and excellent at its stated job: tiny hooks and components for URL matching and navigation. Its small size does not mean the resulting application is simpler here. Temvia would need to create and maintain its own auth-gate lifecycle, initial-session pending state, redirect rules, route-error boundaries, search-param schemas and splitting conventions. It wins only if we intentionally decide those are application responsibilities.

### Chicane

Chicane offers named, type-safe route builders and turns the current location into a useful discriminated union. It is more type-safe than Wouter without build-time generation. It does not provide the route data/auth/pending/error lifecycle needed here, and its small adoption means Temvia would own both the missing infrastructure and more dependency risk. Type safety alone is insufficient to put it ahead of the finalists.

## Other architectures and why they do not reach the final shortlist

| Candidate | Legitimate use case | Why it is not Temvia's base router |
| --- | --- | --- |
| Atomic Router | Applications already organized around Effector units and event-driven routing | It requires Effector/history and makes routing part of a state-management architecture that Temvia has not selected; its README also warns that future design changes may be breaking |
| Router5 | Framework-independent applications that model navigation as an explicit state machine with transition middleware | Good architecture in isolation, but React bindings and data/error conventions become integration work; meaningful repository activity largely stopped years ago |
| Universal Router | Custom isomorphic runtimes needing a small async route resolver | It intentionally owns neither browser history nor React rendering/data lifecycle, so Temvia would be building a router framework around it |
| Found | Redux/Relay applications needing highly customized matching and route data behavior | Pulls in Redux/Farce conventions and is strongest in a Relay-shaped architecture we do not otherwise need |
| Raviger | Small applications wanting a frozen, zero-dependency hook API | The project describes itself as feature complete and accepts maintenance patches; the missing lifecycle remains application-owned |
| Legacy `type-route` | Existing applications already committed to its named-route API | Its maintenance/release history is not sufficient for a new React 19 template, and the new TypeRoute is a separate project |
| `@plumile/router` | Early experimentation | A v0.2 project released immediately before this research snapshot has no stability history to evaluate |

## Framework-bound choices

Next.js App Router, TanStack Start, Remix-style full-stack runtimes, and Expo Router solve a larger or different problem. Next.js and TanStack Start would replace the agreed Vite SPA architecture and introduce a frontend server/runtime contract beside the Go backend. Expo Router targets React Native. They are valid framework decisions, not direct router-library alternatives for this frontend.

React Router Framework Mode is kept in the serious comparison because it can explicitly build a static SPA; unlike the others, it does not inherently require replacing the deployment model.

## Recommendation independent of learning cost

Choose **TanStack Router with the Vite plugin and file-based routing**.

It wins because it has the strongest combination of compile-time route/search correctness, route-level auth and error lifecycle, automatic splitting, active maintenance, and compatibility with an independently deployed Go API. React Router 8 Framework SPA Mode is the closest alternative: choose it if we want React Router to own more application conventions and value its ecosystem more than first-class typed URL state. React Router Data Mode is the conservative control-oriented alternative, but gives up much of the generated type contract. Wouter is the deliberate minimalism choice, not the simplest total system for this project.

The initial TanStack route shape should contain public setup and login routes plus a pathless authenticated parent. Its `beforeLoad` consults a router-context authentication service and redirects before protected content renders. Server authorization remains authoritative.

The setup URL fragment must be extracted and removed before constructing/rendering the router. The setup credential stays in a dedicated in-memory module and never enters route search params, router history/state, generated URLs, persistence, or logging.

Do not add TanStack Query merely because TanStack Router is selected. Server-state ownership remains a separate library decision.

## Primary sources

- React Router modes and current version: <https://reactrouter.com/start/modes>
- React Router type safety: <https://reactrouter.com/explanation/type-safety>
- TanStack Router overview: <https://tanstack.com/router/latest/docs/overview>
- TanStack Router type safety: <https://tanstack.com/router/latest/docs/guide/type-safety>
- TanStack Router route trees: <https://tanstack.com/router/latest/docs/routing/route-trees>
- TanStack Router authenticated routes: <https://tanstack.com/router/latest/docs/guide/authenticated-routes>
- TanStack Router code splitting: <https://tanstack.com/router/latest/docs/guide/code-splitting>
- Wouter: <https://github.com/molefrog/wouter>
- TypeRoute: <https://github.com/strblr/typeroute>
- Chicane: <https://github.com/zoontek/chicane>
- Atomic Router: <https://github.com/atomic-router/atomic-router>
- Router5: <https://github.com/router5/router5>
- Universal Router: <https://github.com/kriasoft/universal-router>
- Found: <https://github.com/4Catalyzer/found>
- Raviger: <https://github.com/kyeotic/raviger>
- Legacy Type Route: <https://github.com/zilch/type-route>
- Navi maintenance notice: <https://github.com/frontarm/navi>
- Hookrouter archive: <https://github.com/Paratron/hookrouter>
- npm registry packages and download API: <https://www.npmjs.com/>
