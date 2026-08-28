# Initialization Implementation Plan

Status: first implementation, independent checks, and the Vite port-fallback correction are complete and accepted by the user on 2026-08-28. The user approved the local commit/archive/journal plan; work commit: 349fa6f249f5ca980eb22453a7ddbff1789c4ba4. See verification.md for completed commands and preview details. No push or publication performed.

## Before activation

- [x] User reviewed the complete planning summary and explicitly approved implementation in a subsequent message.
- [x] Both JSONL context manifests contain validated spec/research paths.
- [x] Rechecked the working tree; preserve unrelated work, the separate bootstrap-guidelines task, and the committed bilingual READMEs.
- [x] Activated this task after approval and loaded the relevant Trellis development guidelines. Existing spec placeholders did not establish framework/tooling choices.

This is one integrated deliverable: a packed CLI generating two verified applications. Do not split it into independently released packages or child tasks.

## Ordered work

1. **Contributor toolchain and CLI package.** Add project-scoped mise pins, root package metadata/private publishing guard, separate NodeNext TypeScript config, and the generator lockfile. Build ESM to dist/ with a single executable. Use pnpm for development and the selected Node's bundled npm for packing.
2. **Owned starter.** Add the Go health skeleton/tests and React TypeScript Vite page under template/. Add its short startup README and ignore seed. Keep normal source files runnable and preserve application independence. Do not add business modules or a default web/.
3. **Generation path.** Implement argument validation, module substitution, safe target handling, installed-location asset resolution, and next-step output. Handle directory names containing spaces. Reject invalid inputs/nonempty targets without mutation.
4. **Git integration.** Add target-relative working-tree detection, standalone initialization, and clear missing-Git/init-failure handling. Inject a narrow Git adapter for remote unit tests; do not add staging/commit/remote/push behavior.
5. **Package and regression checks.** Add tests using node:test against compiled JavaScript. Test the actual npm tarball, asset inclusion/exclusion, .gitignore renaming, changed working directory, and no runtime/development dependency on the source checkout.
6. **Generated application verification.** Generate from the real tarball locally, sync those exact output files to Centaurus without .git, then run the API and admin checks/builds/services there. Forward ports locally and inspect the health response and rendered page.
7. **Final check and handoff.** Run the full Trellis check against all affected layers and the acceptance criteria. Review/capture any new executable conventions through the normal spec workflow without expanding this milestone into a general spec bootstrap. Record exact commands/results and remaining limitations. Do not commit, push, publish, or archive without the appropriate later user/workflow approval.

For the later implementation/check subagents, follow the Trellis dispatch guard and load this task's artifacts/manifests. Assign source/tests/template ownership explicitly; they are not alone in the codebase and must preserve other agents' and the user's edits. The main session owns cross-environment orchestration and the final review.

## Implemented command surface

These scripts are implemented and their completed checks are recorded in verification.md.

| Location | Commands | Purpose |
| --- | --- | --- |
| Generator root | pnpm check; pnpm build | TypeScript checks and emitted CLI |
| Generator root | pnpm test | Node unit tests with substituted Git operations; safe to run on Centaurus |
| Generator root, local only | pnpm test:git | Real Git integration tests in disposable local fixtures |
| Generator root, local only | pnpm test:package | Build/pack actual tarball and execute it away from source; real generated Git behavior |
| Generated api/ on Centaurus | gofmt check; go vet ./...; go test ./...; go build -o bin/server ./cmd/server | Formatting, static checks, behavior, and binary |
| Generated admin/ on Centaurus | pnpm install; pnpm check; pnpm build | First independent install and production build |
| Generated apps on Centaurus | API binary; pnpm dev | Runtime acceptance through local port forwarding |

A repeat admin install after its first generated lockfile exists can use --frozen-lockfile. The root generator install uses its own committed lockfile. Do not use --frozen-lockfile for the template's first installation, since this design intentionally has no seed lock.

The package test must preserve a representative generated output or generate one again from the same tarball for remote application verification. Do not substitute hand-written fixture apps or only verify the original template. Test the local npm executable mapping as well as direct entry invocation, without accessing an unpublished registry package.

## Required regression coverage

| Area | Cases |
| --- | --- |
| CLI | Help/version without Git or writes; missing/unknown/duplicate arguments; accepted/rejected module paths; useful nonzero errors |
| Files | New and empty target; nonempty sentinel unchanged; file/symlink target rejected; paths with spaces; no accidental overwrites; conservative cleanup on simulated write failure |
| Git | Standalone init; inside existing working tree; inside a linked worktree; target outside caller's repo; missing executable before writes; init failure retains output; no staged files/commits/remotes or existing-repo changes |
| Packaging | Required assets in real .tgz; no node_modules/build output/secrets; ignore seed rename; module override; installed-location resolution; executable works without dev dependencies/source checkout |
| API | JSON health response, content type, expected status, unsupported method; built server responds through tunnel |
| Admin | Independent dependency install/typecheck/build; page renders through tunnel without startup errors |
| Scope | No root frontend workspace, web/, database, business modules, automatic installs/startup, or generator runtime dependency |

Use meaningful cases in a small existing-or-new suite; avoid a test file per assertion. Do not add a separate browser test framework for the static page.

## Local / Centaurus execution split

- Source edits and all Git operations occur locally. This includes disposable Git fixtures and invoking the real CLI when it may run git init.
- Lightweight local CLI compilation and package/Git smoke tests are permitted; do not perform resource-intensive Go/frontend builds locally.
- Provision missing versions with mise in project scope after approval. Do not silently use the currently active mismatched runtimes or modify global defaults.
- Sync local code one way via rsync into a fresh isolated Centaurus directory. Exclude .git, dependency directories, local builds, secrets, and unrelated user files. Never use blanket --delete against an unverified existing destination.
- Run CLI checks with fake Git and application installation/builds on Centaurus. Remote output is validation state, not a second editable source tree.
- Sync the actual generated output separately, excluding its .git; do not run the real Git-initializing CLI remotely.
- Bind services to remote loopback and forward available ports to local loopback. Suggested mappings: local 18080 to remote 8080 for API, local 15173 to remote 5173 for admin. Check availability and track/stop only processes and tunnels created for this task.
- If Centaurus becomes unavailable, report it; do not substitute heavy local work without permission.

## Risks and rollback boundaries

- Target safety and package completeness are the highest-risk paths. Do not weaken failure semantics to make a smoke test pass.
- Any discovered user-visible contract change returns to planning review. Routine implementation detail fixes do not require another architecture discussion.
- The admin's first install resolves transitive dependencies; record the resulting tested lockfile with validation evidence, without implying all future resolutions were tested.
- Never run cleanup against arbitrary user paths. Remove only task-owned temporary artifacts, and preserve output on unexpected Git-init failure as designed.
- Acceptance results are populated from completed checks recorded in verification.md, including final reviewed-package output equivalence.
