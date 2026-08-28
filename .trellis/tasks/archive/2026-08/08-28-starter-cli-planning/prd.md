# Initialize Temvia

Status: the user accepted the initial milestone, including Vite's default port fallback, and approved the local commit/archive/journal plan on 2026-08-28. Work commit: 349fa6f249f5ca980eb22453a7ddbff1789c4ba4. Publication and pushes are not authorized; i18n remains a separate follow-up discussion.

## Goal

Provide a CLI that generates runnable, independent Go API and React admin skeletons so a new application can begin with source it owns.

## Background

- The repository currently contains Trellis setup and concise bilingual READMEs, with no product implementation. Existing backend/frontend specs are bootstrap placeholders, not selected framework conventions.
- Generated business models will diverge between projects. Copying owned source avoids imposing compatibility with a shared business library.
- Only the admin frontend is guaranteed to exist. Keeping its configuration independent avoids designing shared frontend infrastructure before another client exists.
- The user delegated the CLI language and distribution decision to the assistant; the selected TypeScript/Node/npm route is recorded in research/cli-packaging.md. The technical choices in design.md were reviewed with the final summary and approved for this first implementation.

## Requirements

| ID | Requirement |
| --- | --- |
| R01 | Temvia is a starter generator. Generated source belongs to the consuming application and may be freely changed or deleted; it is not a shared business library, submodule, or dependency on the generator at runtime. |
| R02 | Generate into a user-selected target directory, including an eligible subdirectory of an existing repository. This is not integration with arbitrary existing application code. |
| R03 | Generate peer application directories named api/ and admin/ by default. |
| R04 | api/ is the main Go backend for the application. Future business logic, server-side authorization, and data access belong there; it is not limited to serving the admin client. |
| R05 | admin/ is a React administration frontend. Future application data is accessed through backend APIs; initialization itself needs only a basic page. |
| R06 | Each application owns its dependencies, configuration, build, and test boundaries. Go configuration belongs to api/; frontend configuration belongs to admin/. |
| R07 | The applications may share a Git repository while remaining separately buildable and deployable. Separate repositories or servers are not required. |
| R08 | Do not generate web/ by default. Projects may add and name other websites or clients later. |
| R09 | Do not require a root frontend package, pnpm workspace, shared frontend configuration/lockfile, or cross-application packages. Consumers may introduce sharing later. |
| R10 | Generate one complete starter without feature selection; consumers remove or change source themselves. The eventual business capability set is deferred. |
| R11 | This milestone is initialization only, not implementation of business capabilities. |
| R12 | Include a Go health endpoint and a basic React page. Both generated applications must start without a database or business setup. |
| R13 | Implement the CLI in TypeScript compiled to JavaScript on Node, packaged for npm with npx/npm create entry points. Keep the Go backend in Go; do not add a native binary wrapper. Preparing and testing the package does not authorize public publication. |
| R14 | Generate only into a new or empty directory. Reject a nonempty target without altering existing contents. No force or merge mode; an existing repository root containing .git or other files is nonempty. |
| R15 | After successful generation, initialize Git for a standalone project. If the target is already inside a Git working tree, reuse that repository and do not create a nested one. Never stage, commit, configure a remote, or push automatically. |
| R16 | Use a parameter-driven command with target directory and Go module path. Print installation/startup instructions afterward; do not add an interactive wizard or automatically install dependencies/start services. |
| R17 | Keep the committed English and Chinese project READMEs concise and unchanged in this task. Keep planning in this Trellis task; do not restore a separate docs/ directory. A generated starter README may document its own startup commands. |

## Exclusions

- Authentication, users, roles, permissions, audit, uploads, storage, jobs, notifications, and other business features.
- Database selection/access, detailed business module layers, admin workflows/UI libraries, API client generation, and other frontend applications.
- Updating generated code, adding modules to existing applications, nonempty-directory merging, and forced overwrite.
- Release automation, registry publication, production deployment, and native platform-binary distribution.
- Per-feature selection is excluded, not an implicit follow-up commitment.

## Acceptance Criteria

All runtime criteria below passed; commands, artifact identities, and preview details are recorded in verification.md.

| Done | ID | Observable outcome | Requirements |
| --- | --- | --- | --- |
| [x] | A01 | A command with valid target/module inputs creates api/ and admin/ with the requested Go module path, without feature questions. | R02, R03, R10, R13, R16 |
| [x] | A02 | Invalid arguments and a nonempty target fail clearly without changing existing files; an empty directory is accepted. | R02, R14, R16 |
| [x] | A03 | An actual packed npm artifact generates the complete starter away from the Temvia source checkout and without generator development dependencies. | R01, R13 |
| [x] | A04 | The generated API passes its checks, builds, starts, and returns a successful JSON health response. | R04, R11, R12 |
| [x] | A05 | The generated admin passes its checks, builds, starts, and visibly renders its basic page. | R05, R11, R12 |
| [x] | A06 | api/ and admin/ are installable/buildable independently, require no generator runtime or database, and do not require web/, a root frontend workspace, or shared packages/configuration. | R01, R06–R09, R12 |
| [x] | A07 | A standalone generated project has a Git repository. A target inside an existing working tree has no nested repository and leaves existing repository settings/history/index unchanged. Neither path stages files, commits, adds remotes, or pushes. | R07, R15 |
| [x] | A08 | Generation prints usable next steps but does not install dependencies, start services, or fetch additional template source. | R13, R16 |
| [x] | A09 | Changes stay within initialization and preserve the committed bilingual READMEs; planning is held in this task rather than docs/. | R11, R17 |

## Technical Notes

- design.md defines the proposed repository layout, command/failure contracts, template toolchain, and packaging choices.
- implement.md defines ordered implementation and verification steps, including local-only Git operations and Centaurus builds/services.
- Research establishes candidate version compatibility, not successful builds. Package-name availability is provisional; public npm commands must not be advertised as already released.
- The final planning review gate is satisfied by the user's subsequent request: “你先做一版，我们根据结果去看”.

## Follow-up Discussion: Internationalization

The user has requested English as the primary language and Chinese as a secondary language, and asked whether the current implementation needs changes. This is a follow-up discussion; the completed initialization criteria above remain historical evidence, not approval for new i18n implementation.

Current evidence: CLI help, errors, and next-step text are English literals in src/; the generated admin has English literals and html lang=en; the repository READMEs already have English and Chinese versions.

Confirmed follow-up scope: the generated admin must support i18n, with English primary and Chinese secondary. The user has separately asked whether the CLI should also be bilingual; CLI localization remains undecided. The current recommendation is to keep this small developer-facing CLI in English for the first version and prioritize admin i18n; this recommendation is not yet a user-approved scope decision.

Admin locale selection and persistence remain to be defined. No i18n library, command option, or template change has been selected or implemented yet.

## Acceptance Follow-up: Vite Port Fallback

Approved on 2026-08-28: use Vite's default port fallback. The generated admin must try another available port when 5173 is occupied, instead of exiting because the template sets strictPort: true.

Change boundary: remove strictPort from the template and the user's current my-app/admin/vite.config.ts; preserve the loopback host and preferred port. Make the CLI's next steps and the generated README direct users to Vite's printed URL. Apply the same startup guidance to the current acceptance project's README if it still matches the generated text. No changes to API ports, dependencies, root bilingual READMEs, i18n, or Git behavior.

Verify the actual generated admin on Centaurus with an occupied preferred port, forward the selected port locally, and confirm that it serves the page. Existing projects are not automatically updated by Temvia; the current my-app correction is a one-time local acceptance fix.
