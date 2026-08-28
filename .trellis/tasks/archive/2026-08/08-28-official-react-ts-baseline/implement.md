# Implementation plan: official React TypeScript baseline

Status: implementation, runtime acceptance, and independent review complete. Product changes committed as e361531 on 2026-08-29 after explicit user approval. See verification.md; no source or artifact scope expansion was needed.

## Approval and dispatch gate

- [x] Receive explicit approval of the latest complete planning summary, not merely the earlier task-creation or page-choice approval.
- [x] Recheck task state and the worktree. Verify prd.md, design.md, implement.md, and the curated manifests; then load Phase 1.4 and run task.py start only after the review gate passes.
- [x] If a material scope change becomes necessary, return to planning and obtain a fresh review before proceeding.

Use one implementation agent for the coupled template/generator/tests change, followed by an independent check agent. No agent is dispatched during planning. Use the Phase 2.1 native context-injection protocol with child-side loading only as a fallback. Every dispatch prompt begins with Active task: followed by the resolved current task path.

Ownership:

- Implementation agent: template/admin/, template/README.md, src/generate.ts, narrowly necessary src/cli.ts guidance, tests and test fixtures, and corresponding artifact-filter changes in template/.npmignore and root .gitignore.
- Main session: requirements/design, curated context, external source verification, Centaurus synchronization/services/forwards, browser acceptance, spec updates, integration decisions, and user handoff.
- Check agent: independent full-scope review and authorized self-fixes after implementation is frozen; no concurrent edits to files owned by a still-running implementer.

Tell both agents they are not alone in the codebase and must preserve others' edits. Follow the Trellis channel skill when actually starting live agent collaboration. The accepted PRD/design supersedes historical spec statements that the frontend has no linter or that its demo is static; do not remove upstream tooling to satisfy those obsolete statements.

## 1. Import the verified baseline

- [x] Read the curated specs, official-react-ts research, and the 18-file inventory; search all references to style.css, _gitignore, requiredAssets, template/admin, and the old page text.
- [x] Confirm Centaurus availability before beginning application installation/build work. Use mise for any missing development tools; do not change global tool defaults.
- [x] Fetch the fixed 9.2.0 artifact into an isolated temporary location or memory, verify its recorded SHA-512 and SHA-256, and inspect expected paths/types before importing.
- [x] Import the exact 18 template files, preserving unmodified text and binary bytes. Materialize _oxlintrc.json as .oxlintrc.json in the source; keep _gitignore as an inert seed for npm packing.
- [x] Apply only the package.json and vite.config.ts adaptations specified in design.md. Keep the upstream UI, assets, README, and TypeScript/lint configuration unchanged.
- [x] Add UPSTREAM.md with accurate source identity, delta inventory, filename mapping, and the artifact's template-specific CC0 notice/text. Do not copy the initializer CLI or unrelated bundled-dependency notices.
- [x] Remove only the obsolete task-owned style.css file and confirm it has no remaining imports. Preserve any overlapping user edits before removal.
- [x] Create the offline tests/fixtures/react-ts-baseline.json from the verified inventory, not from the modified local template. Keep a deliberate two-file customization allowlist and the provenance addition.

## 2. Integrate generation, packing, and guidance

- [x] Extend the exact _gitignore basename mapping to nested directories; preserve the existing root mapping and reject/retain unsafe file situations through current behavior.
- [x] Update the explicit frontend completeness list to cover all final source/config/assets/documentation. Remove the obsolete style.css requirement.
- [x] Update copy/pack/repository-ignore filters coherently for upstream dist-ssr output while preserving existing exclusion behavior.
- [x] Preserve .oxlintrc.json and all binary/public assets in the npm artifact; keep the template's development installs, secrets, local lockfiles, and pnpm-workspace.yaml out.
- [x] Update generated README guidance for official demo and lint/check/build/preview. Preserve printed-port guidance and existing CLI signatures; change CLI text only if needed.

## 3. Add meaningful regression coverage

- [x] Check unchanged official source hashes against the offline fixture; verify the allowed customizations and absence of obsolete/unexplained files.
- [x] Update package inventory assertions and generated-directory assertions to the new exact shape.
- [x] Assert raw packed-source to generated-output byte equality, including hero.png and SVG assets, with explicit dotfile translations.
- [x] Add failures for missing required frontend asset/config files and confirm no target writes occur.
- [x] Verify both root/admin .gitignore, .oxlintrc.json, and the absence of raw nested seed names.
- [x] Extend contaminated-template checks with dist-ssr; retain all previous node_modules, build, secret, lock, local workspace, and temporary-file exclusions.
- [x] Keep existing argument validation, Go module, target protection, cleanup, Git, npm-bin, unrelated-cwd, and no-dev-dependency tests intact.

Use the existing Node test runner and test entry points. Reuse test helpers where useful, but do not make tests derive every expected asset from the production completeness list. Do not add a frontend framework solely to assert the demo text or counter.

## 4. Verify locally and on Centaurus

Run each applicable command from its owning package. Keep all Git operations, including tests that initialize disposable repositories, local.

| Location | Commands / checks | Evidence |
| --- | --- | --- |
| Local root generator | pnpm check; pnpm build | CLI TypeScript remains valid |
| Local root generator | pnpm test; pnpm test:git; pnpm test:package | Full source/generation/Git/real-package regressions |
| Local isolated consumer | npm pack --json --ignore-scripts into a fresh destination; offline installation and actual mapped CLI generation | Exact tarball plus independent generated project |
| Centaurus source copy | pnpm install --frozen-lockfile; pnpm check; pnpm build; pnpm test | Remote CLI validation without real remote Git operations |
| Centaurus generated admin | pnpm install; pnpm lint; pnpm check; pnpm build | Actual generated frontend passes all configured checks |
| Centaurus generated admin, local forward | pnpm dev; occupied-port fallback; loopback-bound pnpm preview | Correct runtime, assets, and listener behavior |
| Local browser through forwards | Official page, count 0 -> 1, loaded assets, no errors, hot reload, production preview | Recorded browser/HTTP evidence |

Do not run a frozen-lockfile install on the fresh generated admin: it intentionally has no seed lock. Preserve the resulting tested lockfile as a separate validation artifact. Do not disable package-manager safety controls to suppress local generated metadata.

Use fresh isolated local/remote directories, one-way rsync from the local source of truth, and task-specific path variables. Do not reuse prior tasks' temporary paths, synchronize .git or secrets, edit remote source, or run broad deletion commands. Keep a list of only this task's services/forwards so they can be stopped safely after acceptance.

For port fallback, keep the actual generated pnpm dev command without a strictPort override, occupy the preferred port in a controlled task-owned setup, and forward the port Vite actually chooses. Do not disturb pre-existing listeners. For production preview, bind explicitly to 127.0.0.1 and use a verified free port.

If proving hot reload with a temporary source edit, edit only the disposable local generated sample, sync it one-way, observe the browser update, and restore the sample before recording final hashes. Never modify remote source directly. Do not claim unchanged source hashes while retaining the hot-reload probe edit.

If Centaurus is unavailable, report it first and pause application validation instead of using a resource-intensive local fallback. The prior browser/build results do not substitute for validating this new baseline.

## 5. Review, capture, and hand off

- [x] Freeze implementation and run the independent Trellis check across the PRD, design, template, generator, package, and tests. Address verified findings without widening scope.
- [x] Update the frontend quality and backend scaffolding specs through the normal main-session spec workflow, including provenance, actual lint, demo behavior, nested ignore handling, and packing invariants.
- [x] Re-run the affected gates after any fix. If output bytes are unchanged, record that evidence before reusing runtime results; otherwise repeat the relevant Centaurus/browser checks.
- [x] Record verification.md with exact commands/results, artifact/hash information, tested install resolution, source-to-generated correspondence, and remaining platform limitations. Do not label metadata research as a passed runtime test.
- [x] Confirm only planned product/spec/task files changed; root READMEs, root dependency versions, Go source, and existing generated projects remain untouched.
- [x] Stop only task-owned temporary processes/forwards and report their cleanup. Preserve evidence needed for review.
- [x] Hand off the completed result. Follow later authorization/workflow for commit/archive/journal actions; no push or npm publication. Any suggested or authorized commit uses Conventional Commits.

## Rollback checkpoints

1. Before import: save enough exact local state to reverse only task-owned edits, and record pre-existing changes.
2. Before runtime checks: retain the verified tarball and generated-source manifest so evidence can be attributed to a specific artifact.
3. On import/config regression: reverse the affected local task edits and regenerate a fresh sample; never patch a remote copy as the fix.
4. If implementation requires extra customizations outside the two upstream files or a different toolchain baseline, stop and revise the plan for review before making them.
