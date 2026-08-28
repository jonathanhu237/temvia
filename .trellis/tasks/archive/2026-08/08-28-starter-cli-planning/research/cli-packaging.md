# CLI Implementation and Packaging Survey

Checked: 2026-08-28. After reviewing the alternatives, the user delegated the decision to the assistant. Selected: TypeScript/Node with npm distribution. Implementation and publication remain unapproved.

## Scope and Repository Evidence

The repository has bilingual READMEs and Trellis setup, but no product `go.mod`, `package.json`, or CLI entry point. The generated backend's Go requirement does not determine the generator's language.

This is a purposive sample of five relevant project generators, not a survey of market share. Official documentation establishes advertised entry points; source and manifests establish implementation and packaging. No sampled generator was installed or executed. Mutable branches are observations on the checked date, not claims about every released version.

## Observed Tools

| Tool | Generator implementation | Documented entry point | Source evidence |
| --- | --- | --- | --- |
| create-vite | TypeScript built to JavaScript for Node | `npm create vite@latest` | [Usage](https://vite.dev/guide/), [manifest](https://github.com/vitejs/vite/blob/main/packages/create-vite/package.json), [TypeScript entry](https://github.com/vitejs/vite/blob/main/packages/create-vite/src/index.ts) |
| create-next-app | TypeScript built to JavaScript for Node | `npx create-next-app@latest` | [Usage](https://nextjs.org/learn/dashboard-app/getting-started), [manifest and TypeScript build entry](https://github.com/vercel/next.js/blob/canary/packages/create-next-app/package.json) |
| create-t3-app | TypeScript built to JavaScript for Node | `npm create t3-app@latest` | [Usage](https://github.com/t3-oss/create-t3-app#readme), [manifest](https://github.com/t3-oss/create-t3-app/blob/main/cli/package.json), [TypeScript entry](https://github.com/t3-oss/create-t3-app/blob/main/cli/src/index.ts) |
| Go Blueprint | Go, with a Node launcher for npm distribution | `go install github.com/melkeydev/go-blueprint@latest`; also npm global installation and Homebrew | [Installation](https://docs.go-blueprint.dev/installation/), [Go entry](https://github.com/melkeydev/go-blueprint/blob/81f56f8c24637d2fd2adb5f37071c6d4cb72b571/main.go), [npm packaging](https://github.com/melkeydev/go-blueprint/blob/81f56f8c24637d2fd2adb5f37071c6d4cb72b571/scripts/create-npm-packages.sh) |
| create-tauri-app | Rust core, with Node bindings for npm distribution | `npm create tauri-app@latest`; also Cargo and shell entry points | [Usage](https://tauri.app/start/create-project/), [Node package](https://github.com/tauri-apps/create-tauri-app/blob/2b8ce19844f37aaae8fd483e5a60ac0add9c2924/node/package.json), [Rust binding](https://github.com/tauri-apps/create-tauri-app/blob/2b8ce19844f37aaae8fd483e5a60ac0add9c2924/node/src/lib.rs) |

## What the npm Entry Point Means

An npm entry point does not prescribe the implementation language. [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/) runs a package command, using a local package or installing missing packages in npm's cache. It does not require a prior global installation. This is still package installation and execution, not an absence of downloaded code or dependencies.

[npm init/create](https://docs.npmjs.com/cli/v11/commands/npm-init/) maps an initializer name to its `create-` package. For example, `npm create vite@latest` and `npx create-vite@latest` address the same initializer. Package execution does not require the generated project to be a Node application or a JavaScript workspace.

## Native Packaging Costs Observed

Go Blueprint's packaging script creates separate OS/CPU packages containing the Go executable. Its main npm package declares these as optional dependencies; a Node launcher selects the platform package and executes its binary. The [release workflow](https://github.com/melkeydev/go-blueprint/blob/81f56f8c24637d2fd2adb5f37071c6d4cb72b571/.github/workflows/npm-publish.yml) publishes both platform packages and the main package. It is not a TypeScript reimplementation, nor merely a claim that npm installation is possible.

create-tauri-app's Node package defines multiple native build targets using N-API tooling. Its Rust binding calls the Rust generator core; the [JavaScript launcher](https://github.com/tauri-apps/create-tauri-app/blob/2b8ce19844f37aaae8fd483e5a60ac0add9c2924/node/create-tauri-app.js) forwards arguments through that binding. This is a real npm entry point backed by native code, not a purely JavaScript generator.

These examples demonstrate feasibility and additional packaging surfaces. They do not establish the maintainers' motivations for their language choices.

## Go with go install

[The official Go module reference](https://go.dev/ref/mod#go-install) documents `go install <package>@<version>` as building and installing an executable on the user's machine. With a version suffix, installation ignores the current project's `go.mod`, so it does not add the CLI to that project's dependencies. The installed command directory must be available on `PATH`.

This route requires a compatible Go toolchain and a local build, but it does not require Temvia to publish an OS/CPU binary matrix. Platform packages and a JavaScript launcher describe the surveyed Go-plus-npm prebuilt distribution approach, not an intrinsic requirement of implementing a CLI in Go.

## Decision for Temvia — Selected Under User Delegation

Use TypeScript for the CLI, built JavaScript running on Node, and npm distribution supporting `npx` / `npm create`. The user asked the assistant to decide rather than selecting a language or installation mechanism personally. This resolves the earlier conditional recommendation; it does not grant implementation or publication approval.

The decision prioritizes the on-demand project-creation entry point and a package containing the CLI and template assets. The reason is product fit and packaging simplicity, not a functional limitation of Go or a claimed market-share majority:

- The initial generator needs file copying, identifier substitution, validation, and next-step output; no native computation or existing Go generator code needs to be reused.
- A React admin is always included, so JavaScript tooling is part of the intended development workflow. The Go backend also requires Go tooling for development. Runtime reuse alone does not decide the CLI language, and React alone does not mandate Node.
- A CLI without native dependencies can ship its JavaScript and template assets in one npm package, without Temvia maintaining its own OS/CPU binary packages. Filesystem and command behavior still need compatibility tests.

Costs: users need a supported Node runtime, the npm package and its dependencies need maintenance, and fetching an uncached package requires registry access. Go with `go install` would also be technically sound and would avoid npm packaging, but is not the selected route. A Go implementation and native-binary npm wrapper are outside this initialization milestone.

This decision leaves the generated backend in Go. The CLI is not a runtime dependency of either generated application, and its own package configuration does not impose a root workspace on generated projects. It does not independently select TypeScript for the admin template.

## Constraints to Carry into Design

- If the Go alternative is revisited later, [go:embed](https://pkg.go.dev/embed) cannot directly cross a nested `go.mod` boundary. A runnable Go starter would need prepared assets or another explicit packaging mechanism. Embed patterns are package-relative; dot and underscore files need deliberate inclusion.
- For npm packaging, validate the actual package archive and generate from that archive so omitted template files are detected. Do not assume a successful source-tree run proves the published package works.
- Follow-up research in initialization-stack.md checks candidate versions and observes a public-registry 404 for create-temvia; it does not reserve the name. The technical proposal, including CLI syntax and tooling, is now recorded in ../design.md for final review. No public command is available from this task.
- Release automation and registry publication remain outside initialization; no publication was performed during research.
