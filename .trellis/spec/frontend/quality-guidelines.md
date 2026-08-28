# Frontend Quality Guidelines

## 1. Scope / Trigger

These rules cover the vendored React starter in template/admin/ and its generated admin/ output. The root package.json belongs to the generator; it is not a frontend workspace. Template updates cross upstream-source, npm-package, and generated-application boundaries.

## 2. Signatures

- Run pnpm install inside admin/; its packageManager field pins the package manager.
- pnpm dev = vite; pnpm lint = oxlint; pnpm check = tsc -b; pnpm build = tsc -b && vite build; pnpm preview = vite preview.
- Node >=24 and pnpm@11.24.0 remain the application toolchain contract. Validation uses the repository's pinned Node 24.20.0.

## 3. Contracts

### Upstream and customization boundary

- The baseline is the published create-vite@9.2.0 archive's package/template-react-ts/ directory, not a moving branch or a fresh latest invocation.
- template/admin/UPSTREAM.md records the artifact URL/integrity, filename translations, exact customizations, and the artifact's template-specific CC0-1.0 notice. Do not confuse the initializer CLI's MIT license with the template license or assign a project-wide license here.
- Retain all 18 upstream files. Sixteen remain byte-identical after filename translation; only package.json and vite.config.ts are customized. UPSTREAM.md is the sole added admin file. Preserve the official README, demo, counter, CSS, HTML, TypeScript settings, lint config, and all five image/icon assets.
- package.json keeps the private admin identity, toolchain fields, exact compatible direct pins, and extra check script. vite.config.ts keeps the official React plugin and adds only the development listener below. Additional customizations require an explicit scope decision.
- tests/fixtures/react-ts-baseline.json is the independent, offline upstream inventory. Do not refresh its hashes from modified template files or make tests fetch upstream or depend on task artifacts.
- Keep _gitignore inert in the source; generation materializes admin/.gitignore. Import upstream _oxlintrc.json as .oxlintrc.json so template-local lint also works. Do not rename arbitrary underscore-prefixed files.

### Application boundaries

- Browser and Vite/Node TypeScript settings are separate configs inside admin/.
- Keep React dependencies, configuration, and the application's lockfile within admin/. Do not introduce a root workspace or shared frontend package without a later requirement.
- The official Get started page has a client-side counter. It requires no API fetch, router, UI kit, data store, database, or credentials. No React Compiler or optional type-aware lint extension is enabled.
- Vite binds to 127.0.0.1 and prefers port 5173. Omit strictPort to preserve Vite's default fallback to an available port; the starter has no requirement for a fixed admin port.
- CLI next steps and the generated README must direct users to the URL printed by Vite, not promise that 5173 is always the actual port. Port forwards must target the selected port.
- Bind acceptance preview explicitly to loopback, for example pnpm preview --host 127.0.0.1 --port 4173 after checking that port is available.

### Installation and template artifacts

The initial seed contains no lockfile. The first install resolves transitive dependencies and generates the application's own pnpm-lock.yaml; keep that generated lockfile in the consuming project.

pnpm 11 can also create an admin-local pnpm-workspace.yaml containing minimumReleaseAgeExclude for an explicitly pinned recent dependency. This is local package-manager configuration, not a generated root workspace. Do not disable its safety checks to suppress the file.

When developing the template, exclude its local lockfile and pnpm-workspace.yaml from Git, generation, and npm packing. Also exclude node_modules/, dist/, dist-ssr/, build-info files, and secrets. Test pollution explicitly; a pristine source tree alone will not reveal these mistakes.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Uncustomized upstream file changes, including binary assets | Offline hash assertion fails; explain or reject the drift |
| Required image, lint config, or other frontend file is absent | Generator fails preflight before creating output |
| Source/package contains an inert admin/_gitignore | Generated output contains admin/.gitignore with identical bytes, no raw seed leak |
| Preferred dev port is occupied | Vite starts on another available port and prints its actual URL |
| Template contains local build/install/secret artifacts | Neither tarball nor generated project includes them |
| Centaurus is unavailable | Report the blocker; do not substitute a heavy local application build without permission |

## 5. Good / Base / Bad Cases

- Good: the installed tarball produces the documented official demo, with images intact, working lint/check/build, and an interactive counter.
- Base: 5173 is already occupied; plain pnpm dev chooses a free port and the forwarded printed URL works.
- Bad: copying only App.tsx, reconstructing assets, leaving _oxlintrc.json inactive, or retaining obsolete src/style.css breaks the coherent upstream baseline.

## 6. Tests Required

- Source and package regressions check the full 18-file upstream inventory plus provenance, the deliberate two-file customization allowlist, and all 16 unchanged hashes. Compare packed/generated bytes, not decoded text, including hero.png.
- Cover missing asset/config preflight failures, root and nested ignore names, the effective lint filename, and contaminated-template exclusions. See tests/cli.test.mjs and tests/package.test.mjs.
- Perform application install/lint/check/build on Centaurus after one-way rsync, using output generated locally by the actual npm tarball. Preserve the tested application's resolved lock separately; exact direct pins do not freeze future transitive resolution.
- Through local forwards, confirm Get started, loaded image/icon assets, Count is 0 -> Count is 1, no console errors, hot reload, and the production preview. HMR probe edits originate in the disposable local sample, are synchronized one-way, and are restored before final hash comparison.
- For dev-listener changes, test plain pnpm dev under occupied-port conditions and inspect its actual URL. Do not replace this runtime check with assertions that merely restate config text.
- Do not add a UI test framework just for the demo. Frontend lint is Oxlint; root generator TypeScript checking is not a lint command.

## 7. Wrong vs Correct

Wrong: regenerate with create-vite@latest or update the fixture from whatever template/admin currently contains, then call it an upstream audit.

Correct: verify a fixed upstream artifact, preserve its independent inventory, and document each intentional difference before updating the baseline.

Wrong: pass TypeScript checks on the source template and assume the npm payload and generated browser page work.

Correct: install the actual packed CLI offline, generate locally, verify exact bytes, then run the resulting frontend checks and browser acceptance on Centaurus.

## Related contract

See [Scaffolding and Health Contracts](../backend/scaffolding-contract.md) for CLI signatures, failure behavior, packing rules, test locations, and the local-only Git boundary.
