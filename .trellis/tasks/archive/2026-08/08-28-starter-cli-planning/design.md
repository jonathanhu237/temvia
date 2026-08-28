# Initialization Design

Status: initial implementation and the Vite port-fallback correction accepted by the user on 2026-08-28. Further features remain outside this milestone.

## Architecture

Temvia has one generator and one owned starter. The generator copies source into a new project; it is not a runtime dependency or an application framework.

    temvia/
    ├── src/
    │   ├── cli.ts
    │   ├── generate.ts
    │   └── git.ts
    ├── template/
    │   ├── api/
    │   │   ├── go.mod
    │   │   └── cmd/server/
    │   │       ├── main.go
    │   │       └── main_test.go
    │   ├── admin/
    │   │   ├── package.json
    │   │   ├── vite.config.ts
    │   │   ├── tsconfig*.json
    │   │   ├── index.html
    │   │   └── src/
    │   ├── _gitignore
    │   └── README.md
    ├── tests/
    ├── package.json
    ├── pnpm-lock.yaml
    ├── tsconfig.json
    └── .mise.toml

The existing bilingual repository READMEs and Trellis files remain in place. No docs/ or package workspace is added.

Generated output:

    my-project/
    ├── api/
    ├── admin/
    ├── .gitignore
    └── README.md

A standalone output also receives .git/; an output inside an existing working tree does not. There is no generated root package.json, pnpm workspace, Go workspace, or web/. The generator's root package manages the CLI only.

## Toolchain

Use the following initial pins, researched on 2026-08-28:

| Area | Proposed baseline |
| --- | --- |
| Development runtime | Node 24.20.0 LTS, its bundled npm 11.19.0 |
| Package manager | pnpm 11.24.0, separately for the CLI and admin |
| TypeScript | 6.0.3 for CLI and admin; separate compiler configurations |
| API | Go 1.27.0 and standard-library net/http |
| Admin | React and React DOM 19.2.8 |
| Admin build | Vite 8.2.2, @vitejs/plugin-react 6.1.1 |
| Type packages | @types/node 24.13.3, @types/react 19.2.18, @types/react-dom 19.2.5 |

Set exact direct dependency versions, Node >=24 in package engines, and the exact pnpm packageManager value. Use project-scoped mise configuration for contributor tools; do not change global tool defaults. TypeScript 6 is a deliberate baseline from the released Vite template, not a claim that it is the latest major.

Keep the CLI development lockfile. Do not ship an admin seed lockfile in this milestone: the first pnpm install inside admin/ creates that application's own lockfile. This keeps the template simple but leaves transitive resolution unfrozen on the first install. Preserve the generated lockfile after installation; there is no cross-application lockfile.

Version/engine metadata and published template contents are documented in research/initialization-stack.md. Completed installation/build checks and tested platforms are recorded in verification.md.

## CLI and package contract

Proposed package and executable name: create-temvia.

    create-temvia <directory> --module <go-module-path>
    create-temvia --help
    create-temvia --version

Example after a separately authorized publication:

    npx create-temvia@<version> my-project --module example.com/my-project/api
    npm create temvia@<version> -- my-project --module example.com/my-project/api

These are intended entry points, not currently released commands. The public registry returned 404 for the package name during research; it is not reserved. Keep package metadata private during initialization and validate local tarballs. Publication, licensing decisions, name reservation, and registry credentials are separate work.

- Both the directory and Go module path are required for generation. Reject missing, duplicate, unknown, or extra arguments with a nonzero exit and a useful message before mutation.
- Help/version exit successfully without requiring Git or writing files.
- Resolve relative targets against the invocation directory. The target basename is enough to identify the project; do not add a second project-name prompt.
- Use a fixed private package name of admin for the frontend. Replace only the Go module declaration; do not guess a Git host, organization, or remote URL.
- Document a conservative canonical module-path subset and validate it before writes: a lowercase domain-like first segment, nonempty slash-separated path segments, no scheme, whitespace, control characters, backslashes, dot segments, or leading/trailing slash. Cover ordinary paths and valid /v2-style suffixes. Reject unsupported Go path forms explicitly rather than accepting arbitrary go.mod text.
- Generation requires Node and Git, not an installed Go compiler or pnpm. Go and pnpm are needed later to run the applications.
- No wizard, feature picker, network template fetch, dependency installation, automatic startup, force, merge, add, or update operations.
- Use Node builtins and tsc output; no CLI runtime dependencies, bundler, TypeScript runtime, or native platform packages.
- Emit ESM with NodeNext module resolution and a Node shebang. The single bin points to dist/cli.js. Resolve template assets relative to that installed module, never process.cwd().
- Print correctly quoted next-step paths/commands and distinguish successful generation, skipped Git initialization, and failures.

## Generation, safety, and Git

Sequence: parse inputs → validate target/module/assets/Git availability → prepare output → write source → initialize or reuse Git → print next steps.

1. Accept a missing target or an existing empty directory. Reject a nonempty directory, non-directory, or symlink target before changing it. Empty subdirectories of repositories are valid; .git itself makes a repository root nonempty.
2. Preflight the complete template before writing. Use explicit supported substitutions rather than a template language or global text replacement. Keep ordinary template files runnable, including a valid seed module example.com/temvia/api.
3. Create missing directories as needed and use exclusive file creation. Track this invocation's created files/directories. On a write failure, clean up only owned files and empty directories when safe; never recursively erase preexisting or concurrently added content. Report any retained partial output. Do not claim filesystem-wide transactional guarantees.
4. Discover repository membership relative to the target or its nearest existing ancestor, not the CLI's current directory. Use Git working-tree discovery, supporting both .git directories and worktree .git files. Do not treat an unexpected Git error as proof that no repository exists.
5. In an existing working tree, skip initialization and leave its index, branch, configuration, remotes, and history untouched. Outside a working tree, run git init after writing the starter and respect the user's configured default branch.
6. Invoke Git with a subprocess argument array and explicit cwd, without constructing a shell command from user input. Missing Git fails preflight before output files are written.
7. If Git initialization unexpectedly fails after writing, return nonzero, retain the generated project, and explain how to retry. Do not report complete success or delete useful output to hide the failure.
8. Do not run git add, commit, remote, or push. Git fixture setup and assertions run locally only under the repository's development policy.

Keep the implementation small: separate argument/exit handling, file generation, and Git operations. Allow tests to substitute Git operations without building a general plugin or process framework.

## Template ownership and packing

- Ship static owned assets with the CLI. A release artifact determines its generated content; it never retrieves the latest upstream template on invocation.
- Package allowlist: dist/ and template/. npm also includes its standard metadata files.
- Store the generated ignore file as _gitignore and rename it to .gitignore. Do not copy npm packaging-only ignore metadata into generated projects.
- Exclude template development output and local state from both copying and packing: node_modules/, dist/, bin/, .git/, local lockfiles, build-info files, environment secrets, and temporary artifacts. Use narrow ignore/filter rules and verify them against the real tarball.
- Explicitly assert that go.mod, admin manifests/configurations, source, styles, HTML, README, and the ignore seed survive packing. No special npm exclusion for go.mod was found.
- A prepack build may keep dist current. For controlled validation, build first and use npm pack --json --ignore-scripts.
- The acceptance smoke test must execute the actual installed/extracted tarball away from the checkout and without development dependencies. A dry run or direct source-template test is insufficient.
- Changes belong in template/ and generator source, not just in temporary generated projects.

## Generated API

Keep initialization in api/cmd/server with a small testable handler/mux; no speculative repository/service layers or HTTP framework.

- GET /health returns status 200 and JSON {"status":"ok"} with the JSON content type.
- Default listener: 127.0.0.1:8080. HTTP_ADDR may override it for explicit deployment/testing needs.
- Use standard method routing and bounded server timeouts. Return a clear startup error if binding fails.
- Commands in api/: go run ./cmd/server, go test ./..., go vet ./..., and go build -o bin/server ./cmd/server.
- Set go 1.27.0 in go.mod. No third-party dependency means no fabricated go.sum.
- Use httptest for the health contract and unsupported methods. No database, credentials, authentication, or client setup.

## Generated admin

Use React + TypeScript + Vite with a minimal page and styles. Keep its package.json and browser/Node TypeScript configurations inside admin/.

- Scripts: dev, check (TypeScript), and build (typecheck then Vite build).
- pnpm install creates the independent lockfile; pnpm dev starts the page; pnpm build produces admin/dist/.
- Preferred development listener: 127.0.0.1:5173. Preserve Vite's default port fallback by omitting strictPort; if the preferred port is occupied, use the available port printed by Vite. Expose no service publicly during validation.
- The initial page does not need an API request, CORS/proxy configuration, a router, a state library, or a UI kit.
- A browser smoke check is sufficient for this static page. Do not introduce a UI test framework solely to assert static text.

## Verification and residual risks

Use compiler checks, Node's built-in tests, Go formatting/vet/tests, actual package smoke tests, and a browser check. No separate JavaScript lint tool is introduced in this milestone; TypeScript checks are not described as lint.

All Git operations remain local. CLI checks without Git, Go/admin builds, and service execution run on Centaurus after one-way synchronization. Forward service ports locally for validation. Details and observed environment versions are in implement.md and research/validation-environment.md.

Mac and Linux are available for checks; Windows behavior is not yet verified. Use portable Node APIs and avoid shell-dependent generator behavior without claiming a tested Windows matrix. First-install admin dependency resolution and npm-name availability remain the disclosed release risks. Neither requires broadening initialization into a release system.
