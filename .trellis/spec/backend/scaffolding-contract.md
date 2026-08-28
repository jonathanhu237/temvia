# Scaffolding and Health Contracts

## 1. Scope / Trigger

Temvia crosses three boundaries: owned template files, the npm tarball, and the generated application. Changes to src/, template/, or package metadata must preserve these contracts. This documents the initial implementation, not a framework for future business features.

## 2. Signatures

- create-temvia <directory> --module <go-module-path>
- create-temvia --help / -h; create-temvia --version / -v
- src/cli.ts: parseArguments(args), run(args, cwd, git)
- src/generate.ts: generate(options, git), validateModulePath(modulePath)
- src/git.ts: Git.inspect(directory) returns existing/new; Git.init(directory)
- template/api/cmd/server/main.go: GET /health

The npm bin is dist/cli.js. Build TypeScript with NodeNext; resolve template assets relative to import.meta.url, not the invocation directory.

## 3. Contracts

- Generated peers: api/ (Go module) and admin/ (private React package). No root package.json, frontend workspace, web/, or generator runtime dependency.
- Only new/empty targets are accepted. Symlink/file targets and nonempty directories fail before writes. Use exclusive file creation and conservative cleanup of owned output.
- A standalone target gets git init; a target inside an existing working tree does not. Preserve the existing index, branch, configuration, remotes, and history.
- Git discovery uses the target's nearest existing ancestor, supports linked worktrees, and clears location-overriding Git environment variables. It never stages, commits, adds remotes, or pushes.
- Module paths use the documented conservative subset: lowercase domain-like host and ordinary ASCII path segments. Windows reserved-name checks apply to the host as well as later segments. gopkg.in's special syntax is unsupported.
- Generation does not install dependencies or start services. Missing Git fails preflight; a later git init failure retains output with a nonzero exit and recovery instructions.
- GET /health returns 200, application/json, and status=ok. POST /health returns 405; unknown routes return 404.
- HTTP_ADDR overrides the default 127.0.0.1:8080. The initial API has no third-party dependencies or database.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing, duplicate, unknown, or extra CLI argument | Exit 1, useful error, no output files |
| Help/version alone with Git unavailable | Exit 0, no file mutation |
| Nonempty target | Exit 1; existing bytes remain unchanged |
| Invalid module, including con.example/api | Exit 1 before generation |
| Git reports ordinary ancestor-search absence | Treat as standalone and initialize after writing |
| Git reports malformed/missing .git pointer, unsafe repo, bare metadata, or process failure | Fail preflight; do not reinterpret as absence |
| Unexpected git init failure after writes | Exit 1; retain generated source and explain retry |
| Template missing required assets | Fail before writes; explain package/template problem |

Set LC_ALL=C for Git diagnostics. The normal absence message starts with “fatal: not a git repository (or any …”. A colon-form diagnostic such as “fatal: not a git repository: (null)” can mean a broken .git pointer and must not enable nested initialization.

## 5. Good / Base / Bad Cases

- Good: a new standalone directory with module example.com/team/project/api produces both apps and an unstaged Git repository.
- Base: an empty subdirectory of an existing linked working tree produces both apps without a nested .git.
- Bad: a nonempty target, malformed Go path, or broken ancestor .git pointer fails without overwriting files.
- Development artifacts in template/ must not affect output. Pack/copy filters exclude node_modules, builds, secrets, temporary files, template lockfiles, and pnpm-workspace.yaml.
- Store the output ignore file as template/_gitignore and rename it on generation. Packaging-only .npmignore must not be copied.

## 6. Tests Required

- tests/cli.test.mjs: input validation, help/version without Git, module paths, target safety, template completeness/filtering, conservative cleanup, and Git error classification.
- tests/git.test.mjs: real standalone/existing/linked repositories, default branch, preserved index/config/history, inherited Git context, missing Git, and malformed/broken metadata.
- tests/package.test.mjs: actual npm pack, offline install without dev dependencies, npm bin mapping from an unrelated directory, complete generated files, and deliberately contaminated template exclusions.
- template/api/cmd/server/main_test.go: health JSON/content type/status, unsupported method, and missing route.
- Run pnpm check and pnpm build before Node tests. No separate JavaScript linter is configured.
- All real Git tests run locally. After one-way rsync, run CLI unit tests with fake Git and generated Go/admin checks on Centaurus; forward service ports for HTTP/browser verification.
- Verify the actual packed output, not just the original template. If a later generator-only fix leaves template output unchanged, compare all generated source hashes before reusing application verification evidence.

## 7. Wrong vs Correct

Wrong: infer a standalone target from any Git status 128 or from every “not a git repository” message.

Correct: accept only Git's normal ancestor-search absence diagnostic; fail on broken pointers and other unexpected errors.

Wrong: validate Windows reserved names only after the host.

Correct: apply the same reserved-name restriction to every module-path component, including con.example.

Wrong: run the CLI from source and assume npm assets are complete.

Correct: install the actual tarball offline in an isolated consumer, invoke its mapped executable, and verify generated files and applications.
