# Research: Initial CLI and generated starter toolchain

- Query: Select a minimal compatible TypeScript/Node CLI toolchain, distributed as built JavaScript through npm, that generates independent Go API and React admin skeletons together; verify package-name availability and template packing risks.
- Scope: Mixed — repository guidance, official documentation, public registry metadata, and published package contents; planning only.
- Date: 2026-08-28 (Asia/Shanghai). Initial registry/Node/Go responses carried HTTP dates around 08:16 UTC on this date.

## Findings

### Recommended initialization baseline

| Concern | Recommendation | Evidence / constraint |
| --- | --- | --- |
| Node runtime | Pin development/validation to **24.20.0**, the observed Node 24 LTS patch; declare the project's minimum as Node 24 | Official release index reports `lts: "Krypton"`, release date 2026-08-26, bundled npm **11.19.0**. Node 26 is Current, not LTS. [Node release index](https://nodejs.org/dist/index.json), [release status](https://nodejs.org/en/about/previous-releases) |
| Package manager | **pnpm 11.24.0**, independently in the generator repository and generated `admin/` | Registry `latest` is 11.24.0 with Node `>=22.13`; Node 24 satisfies it. Set an exact `packageManager` value in each package; no workspace needed. [pnpm metadata](https://registry.npmjs.org/pnpm/11.24.0), [pnpm compatibility](https://pnpm.io/installation) |
| CLI compiler | **TypeScript 6.0.3**, emitting ESM JavaScript with `tsc`; no bundler required initially | Version exists and requires Node `>=14.17`. This is a deliberate conservative selection, **not** a claim that it is the registry's latest major. [TypeScript 6.0.3 metadata](https://registry.npmjs.org/typescript/6.0.3) |
| Node types | **@types/node 24.13.3** | Highest stable 24.x version observed in the package's version map; matches the selected runtime major. [Version metadata](https://registry.npmjs.org/@types/node/24.13.3) |
| Generated API | **Go 1.27.0**, standard-library `net/http`, with `go 1.27.0` in `api/go.mod` | Both the download feed (`stable: true`) and release history explicitly identify 1.27.0; the latter dates it to 2026-08-19. This is verified, not inferred from the calendar. [Go download feed](https://go.dev/dl/?mode=json), [release history](https://go.dev/doc/devel/release) |
| Admin runtime libraries | **react 19.2.8**, **react-dom 19.2.8** | Both are observed `latest`; react-dom requires React `^19.2.8`. [React metadata](https://registry.npmjs.org/react/19.2.8), [React DOM metadata](https://registry.npmjs.org/react-dom/19.2.8) |
| Admin build / refresh | **vite 8.2.2**, **@vitejs/plugin-react 6.1.1** | Both require Node `^20.19.0 || >=22.12.0`; plugin-react requires Vite `^8.0.0`. Its compiler/Babel/OXC peers are optional. [Vite metadata](https://registry.npmjs.org/vite/8.2.2), [React plugin metadata](https://registry.npmjs.org/@vitejs/plugin-react/6.1.1) |
| Admin types | **@types/react 19.2.18**, **@types/react-dom 19.2.5**, plus TypeScript/Node types above | React DOM types require `@types/react ^19.2.0`. [React types metadata](https://registry.npmjs.org/@types/react/19.2.18), [React DOM types metadata](https://registry.npmjs.org/@types/react-dom/19.2.5) |
| Small lint tool, if the plan includes lint scripts | **oxlint 1.80.0**, without type-aware extensions | Current published create-vite uses Oxlint; observed 1.80.0 requires Node `^20.19.0 || >=22.12.0`, and both of its peers are optional. No ESLint plugin compatibility matrix is needed for this initial skeleton. [Oxlint metadata](https://registry.npmjs.org/oxlint/1.80.0) |

These recommendations satisfy the observed engine/peer declarations. They have **not** been installed or build-tested during this research. Exact pins and the approved validation run should establish the initial supported combination; do not describe every later Node or dependency version as tested.

### Why this remains small

- The CLI can use Node's filesystem, path, URL, argument parsing, and test modules. Emit `src/` to `dist/` with `tsc`, use `"type": "module"`, and point one npm `bin` entry at the emitted JavaScript. Use Node-compatible module resolution for the CLI, not the browser bundler configuration. TypeScript documents `NodeNext` for Node's module rules. [TypeScript module reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-node18-node20-nodenext)
- Tests can use the built-in `node:test` runner, including subprocess checks against the compiled CLI, without adding a test framework or a TypeScript runtime. [Node 24 test runner](https://nodejs.org/docs/latest-v24.x/api/test.html)
- Vendor the small, owned starter files into the published generator. Do not make generation invoke `create-vite@latest`, fetch GitHub `main`, or select features dynamically. The generator's installed artifact should determine what it produces.
- `api/` owns its own `go.mod`; `admin/` owns its own `package.json`. No root application `package.json`, pnpm workspace, Go workspace, runtime coupling, router, UI kit, database, or business modules are required. A basic React page does not require an API request or CORS setup.
- A `net/http` handler and mux are sufficient for the health endpoint; the standard library supplies server and routing support. An explicit `go` directive avoids silently inheriting a missing/default minimum. There is no reason to invent a `go.sum` for a module with no external dependencies. [net/http documentation](https://pkg.go.dev/net/http), [Go module directives](https://go.dev/ref/mod#go-mod-file-go)

### Current release evidence versus template defaults

The **published** [create-vite 9.2.0 archive](https://registry.npmjs.org/create-vite/-/create-vite-9.2.0.tgz) was downloaded into memory and inspected, not executed or installed. Its `package/template-react-ts/package.json` contains React `^19.2.8`, Vite `^8.2.2`, plugin-react `^6.1.0`, TypeScript `~6.0.2`, Node types `^24.13.3`, and Oxlint `^1.79.0`. It provides separate application/Node TypeScript configurations and `tsc -b && vite build` as the build command. The selected patch versions above fit those ranges.

The registry currently reports **TypeScript 7.0.2** as `latest`, while the released Vite template still uses the 6.0.x line. The package version map reports **6.0.3** as the highest stable 6.x patch. This difference is a reason to distinguish an upstream template baseline from a `latest` tag; it is not evidence that TypeScript 7 is incompatible. No TypeScript 7 migration is needed for this task. [TypeScript package metadata](https://registry.npmjs.org/typescript)

React's own documentation explicitly demonstrates a Vite `react-ts` setup, and Vite documents the same Node minimum reported by the packages. A basic client-rendered page is within that documented setup. [React from-scratch guide](https://react.dev/learn/build-a-react-app-from-scratch), [Vite guide](https://vite.dev/guide/)

Other observed values should not accidentally replace the chosen pins:

- **pnpm 12.0.0** is available under `next-12`; `latest` remains **11.24.0**. The pnpm documentation explicitly explains that distinction. [pnpm registry tags](https://registry.npmjs.org/pnpm), [pnpm installation](https://pnpm.io/installation)
- **npm 12.0.2** is registry `latest`, but Node 24.20.0 bundles **npm 11.19.0**. Use the bundled npm for the initial `npm pack` verification rather than silently introducing a second npm toolchain. [npm 12 metadata](https://registry.npmjs.org/npm/12.0.2), [Node release index](https://nodejs.org/dist/index.json)
- **Go 1.26.7** is also returned as stable and remains within Go's supported-release policy. Selecting 1.27.0 is a baseline decision, not a claim that this tiny HTTP server needs a 1.27-specific API. [Go download feed](https://go.dev/dl/?mode=json), [Go release policy](https://go.dev/doc/devel/release#policy)

### npm name and invocation

An unauthenticated GET of [the public `create-temvia` registry endpoint](https://registry.npmjs.org/create-temvia) returned **HTTP 404** with `{"error":"Not found"}` on 2026-08-28 at approximately **08:16:56 UTC**. This establishes that no public package document was returned at that moment. It does **not** reserve the name, guarantee publication permission, or rule out registry naming restrictions. Recheck immediately before a separately authorized publication; no registration or publication was attempted.

`create-temvia` is the appropriate package shape for the intended npm initializer route: `npm create temvia@<version>` resolves to `create-temvia@<version>`. A single matching executable keeps npm's bin selection straightforward. Until publishing is approved and succeeds, document packed-artifact validation, not a publicly working npm command. [npm init/create documentation](https://docs.npmjs.com/cli/v11/commands/npm-init/)

### Packaging contracts and traps

1. **Allowlist assets as well as JavaScript.** Recommend `files: ["dist", "templates"]`, with templates resolved relative to the installed module location. A JavaScript-only glob would lose Go, JSON, HTML, CSS, Markdown, and dotfile seed assets. `bin` must point to the built entry, whose first line must be `#!/usr/bin/env node`. Root `files` takes precedence over root ignore files, but nested ignore files can still affect included directories. [npm package metadata rules](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files)
2. **`go.mod` has no special npm exclusion in the inspected implementation.** Node 24.20.0's bundled npm 11.19.0 includes npm-packlist **10.0.4**. Inspection of `lib/index.js:16-44` and `:287-300` finds no Go-specific rule. Keep `templates/.../api/go.mod` (or its deliberate inert template filename) in the asset tree and assert its presence in the actual tarball. Do not rename it solely because of an assumed npm rule. [npm 11.19.0 archive](https://registry.npmjs.org/npm/-/npm-11.19.0.tgz), [npm-packlist 10.0.4 archive](https://registry.npmjs.org/npm-packlist/-/npm-packlist-10.0.4.tgz)
3. **Store `.gitignore` as inert template data.** npm-packlist's defaults exclude `.gitignore` and `.npmignore` themselves, and their contents can affect traversal. Store `_gitignore` and explicitly rename it to `.gitignore` when generating. The published create-vite archive contains `template-react-ts/_gitignore`; `dist/index.js` maps `_gitignore` to `.gitignore`. Its template contains no lockfile. [npm-packlist rules](https://github.com/npm/npm-packlist#readme), [create-vite 9.2.0 archive](https://registry.npmjs.org/create-vite/-/create-vite-9.2.0.tgz)
4. **Separate repository lockfiles from generated lockfiles.** Keep a generator `pnpm-lock.yaml` for reproducible development, but do not expect it in the npm artifact: npm documents lockfile exclusions, and the inspected packlist has explicit package-root rules for `package-lock.json`, `yarn.lock`, and `pnpm-lock.yaml`. Smallest initial template: omit an admin seed lock, as create-vite does; the user's first admin install creates its independent lock. This leaves transitive versions unfrozen for that first install. If the plan instead requires a reproducible generated install, generate and validate an admin lock during implementation, store it as `pnpm-lock.yaml.template`, and rename it on output. Do not assume nested lockfile behavior is identical to the root exclusion; verify the chosen representation in the real tarball. [npm file exclusions](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files), [npm-packlist 10.0.4 source archive](https://registry.npmjs.org/npm-packlist/-/npm-packlist-10.0.4.tgz)
5. **Packing is a lifecycle operation.** A `prepack` build can ensure `dist/` is fresh; npm runs lifecycle scripts for packing, so a packing command is not automatically a passive read. After the approved build, `npm pack --json --ignore-scripts` can inspect/package the already-built payload without repeating lifecycle work. A dry run is only an inventory check; the final smoke test must use the actual `.tgz`. [npm script lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/)

Recommended later acceptance evidence: assert the tarball contains the executable and every required template asset; extract/install it away from the source checkout; generate into a fresh directory from an unrelated working directory; verify that `api/go.mod`, admin manifests/configuration, and output `.gitignore` exist; run Go tests/build and admin typecheck/build on those generated files. Generation must not depend on the source checkout or development dependencies. No such builds, installs, or packing commands were run in this research.

### Files found and existing patterns

| File | Relevant evidence |
| --- | --- |
| `README.md:7` | Product description: CLI for scaffolding Go backends and React admin frontends; no tool/version conventions. |
| `README.zh-CN.md:7` | Same product intent in Chinese. |
| `.trellis/workflow.md` | Planning research belongs in this task's `research/`; implementation needs the main session's review/start gate. |
| `.trellis/spec/backend/index.md:15` | Backend guidelines are listed as **To fill**, not established Go conventions. |
| `.trellis/spec/backend/directory-structure.md:19` | Module layout is a placeholder; no existing layout to preserve. |
| `.trellis/spec/backend/error-handling.md:19` | No concrete error contract yet. |
| `.trellis/spec/backend/quality-guidelines.md:19` | No configured backend tooling/test standard yet. |
| `.trellis/spec/frontend/index.md:15` | Frontend guides are also **To fill**; no established framework tooling constraints. |
| `.trellis/spec/frontend/quality-guidelines.md:19` | No concrete lint/build rules yet. |
| `.trellis/spec/frontend/type-safety.md:19` | No existing TypeScript settings to preserve. |
| `.trellis/spec/guides/cross-layer-thinking-guide.md:21` | Map transformations and define boundaries; here the important boundary is source template → npm tarball → generated project. |

No product `package.json`, `go.mod`, or implementation source was found in the bounded repository inspection. The proposed settings are new design choices, not inferred codebase conventions. Relevant specs should be populated through the main session's later spec workflow, not by this research role.

## Caveats / Not Found

- Metadata, documented constraints, and published archive contents establish a plausible compatible baseline; they do not replace installation/build tests. This research did not install tools, execute downloaded package code, build, start tasks, publish, or perform Git operations.
- Mutable branch/default documentation and registry tags can describe different moments. The React TS package manifest fetched from Vite `main` matched the released 9.2.0 archive, but one separate `main` package-manifest request timed out. Recommendations rely on the released archive and versioned registry documents instead. No conflict was observed between the Go release feed and release-history page on this check.
- TypeScript 6.0.3 is intentionally chosen from the released Vite template's range although 7.0.2 is newer. Do not label 6.0.3 “latest TypeScript,” or claim TypeScript 7 is unsupported.
- Published npm-name availability remains provisional until a separately authorized publish succeeds. The task's license, npm ownership, and release credentials were not investigated.
- Environment installation, mise provisioning, Centaurus synchronization, and port-forward validation remain owned by the main session. All version/tool suggestions here are planning inputs only.
