# Base admin on the official React TypeScript template

Status: implemented and independently verified; all acceptance criteria passed. Product changes committed as e361531 on 2026-08-29 after the user's explicit LGTM/commit approval. See verification.md for artifact, runtime, and closeout evidence.

## Goal

Make Temvia's generated admin frontend derive from an identifiable, fixed release of the official Vite `react-ts` template, with a small, documented set of Temvia customizations. Reduce unexplained configuration differences and make future upstream comparisons possible.

## Background (before migration)

- The current `template/admin/` was directly authored during the initial starter implementation, rather than imported as an official template snapshot. Its nine files were introduced in commit `349fa6f249f5ca980eb22453a7ddbff1789c4ba4`.
- `src/generate.ts:85` reads bundled files; `src/generate.ts:103` enforces a required-file list. `tests/package.test.mjs:7` maintains a corresponding packed-asset list, and `tests/cli.test.mjs:107` checks the exact generated admin directory entries. A template layout change affects all three.
- `template/admin/package.json:6` currently declares Node >=24 and pnpm 11.24.0, exact direct dependency versions, and dev/check/build scripts. It has no linter or frontend test framework.
- Previous application checks and browser validation passed; this request changes the template's provenance and baseline, rather than responding to an established runtime failure. See the archived initialization task's `verification.md`.
- Read-only inspection verified the published `create-vite 9.2.0` artifact and its 18-file `react-ts` template, including Oxlint, dev/build/lint/preview scripts, an interactive demo, image assets, and two initializer filename mappings. See `research/official-react-ts.md` and `research/upstream-inventory.json` for sources, integrity, file hashes, and local compatibility findings.

## Requirements

- R1: Derive the admin starter from the official Vite `react-ts` template in the verified `create-vite 9.2.0` published release, not a moving branch or an unpinned latest invocation.
- R2: Record the upstream source/version, verifiable artifact identity, and all intentional customizations, including any omitted or relocated upstream files.
- R3: Keep the customized starter bundled with Temvia. A given installed generator artifact determines generated source without fetching upstream code during generation.
- R4: Preserve independent Go/API and React/admin applications and established generation safety. Limit generator/test changes to those required by the new template content and packaging.
  - Keep the private admin package identity, Node >=24, pnpm 11.24.0, existing compatible direct dependency pins, and the public `pnpm check` command.
  - Keep loopback-only development with preferred port 5173 and automatic fallback, and report Vite's actual printed URL.
  - Do not introduce a root application workspace, install dependencies or start services during generation, or change existing Git/target-directory protections.
- R5: Ensure the real published-package shape includes all required frontend configuration, source, assets, and applicable upstream notices, while excluding local installs, build output, secrets, and template-development state.
- R6: Validate the actual generated frontend with the upstream-provided checks and Temvia's existing typecheck/build contract. Keep application validation on Centaurus after one-way synchronization; keep all source edits and Git operations local.
- R7: Keep the official demonstration page, counter, HTML, React entry points, styles, assets, TypeScript settings, and Oxlint configuration unchanged apart from documented filename materialization. The user explicitly approved replacing the Admin ready page with this demo; Temvia-specific visual customization is deferred.

## Acceptance criteria

- [x] AC1 (R1, R2, R7): A reviewer can identify the exact upstream release/artifact and explain each difference. Unmodified upstream files match their recorded hashes, including the demo and binary assets; only the documented package/listener customizations and provenance addition differ.
- [x] AC2 (R3, R4): The installed, packed CLI generates independent `api/` and `admin/` from an unrelated directory without network template retrieval, automatic dependency installation, or a generator runtime dependency.
- [x] AC3 (R5): Package/generation tests verify the complete new frontend asset set and byte preservation, generated nested ignore/lint filenames, failure before writes when required assets are missing, and continued exclusion of development artifacts and secrets.
- [x] AC4 (R4): Existing argument, target safety, Go module, and Git behavior tests continue to pass; no unrelated API changes are introduced.
- [x] AC5 (R4, R6, R7): An application generated from the actual tarball installs and passes lint/typecheck/build on Centaurus. Through local forwards, the official page and assets render without console errors, the counter increments, development hot reload and production preview work, and an occupied preferred dev port leads to successful fallback.

## Out of scope

- New business features, routing, UI kits, authentication, i18n, database work, React Compiler, type-aware lint extensions, a new frontend testing framework, or Temvia-specific page design.
- Dynamic upstream fetching during generation, automatic template-update machinery, or new CLI options.
- Retrofitting existing generated projects, npm publication, Git push, or production deployment.
- Changes to the Go starter unrelated to preserving package/generation regression coverage.
- Generator dependency upgrades or changes to the repository-level English/Chinese READMEs.

## Risks and deferred items

- The official page intentionally replaces the previous visual appearance. Source provenance does not imply an automatic upstream-update service or a guarantee of defect-free upstream code.
- As before, the first admin installation resolves transitive dependencies and creates its own lockfile; the seed does not contain a lockfile. Preserve the tested lock separately with validation evidence.
- Windows runtime behavior remains unverified. If Centaurus is unavailable, report it and do not substitute resource-intensive local application validation without permission.
