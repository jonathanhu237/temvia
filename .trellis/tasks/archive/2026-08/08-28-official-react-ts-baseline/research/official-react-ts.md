# Research: official React TypeScript baseline

Date: 2026-08-28. Scope: read-only upstream artifact inspection and repository comparison; no generator execution, dependency installation, builds, or product-code edits.

## Question and conclusion

Which exact official Vite React TypeScript template should Temvia use, and what changes are required to vendor it without breaking the generator's contracts?

The proposed fixed baseline is **create-vite 9.2.0**, specifically `package/template-react-ts/` in its published npm archive. The registry's latest endpoint returned 9.2.0 during this inspection. Use the immutable release URL and verified integrity below during implementation, not a moving GitHub branch or a future latest lookup.

The artifact contains **18 template files**, including an interactive example page, five image/icon assets, two CSS files, an Oxlint config, and a frontend README. This is materially more than the current nine-file handwritten template. After this research, the user approved retaining the official demo and replacing the current Admin ready page.

## Evidence and reproducibility

- [Versioned package metadata](https://registry.npmjs.org/create-vite/9.2.0).
- [Published archive](https://registry.npmjs.org/create-vite/-/create-vite-9.2.0.tgz).
- SHA-512 integrity: `sha512-Fra5Zj1DLdjGn7qG0R33bRq60da4sKjWZjrJIRtpKWJJtQEAhl7vQ3/snPjheqY7Ryzqi3pJsozIG1JRWbG3ig==`.
- Archive SHA-256: `c370c3eafa839d8b16b51fbf28bf521b5beffab816ee236de5fa7e0c513a2eb4`.
- [Official template directory](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) and [Vite scaffolding documentation](https://vite.dev/guide/#scaffolding-your-first-vite-project) are useful browsing references, but the published archive—not main—is the baseline authority.
- The archive was fetched into memory and checked against the registry's SHA-512 before inspection with tar's list/stdout extraction modes. No upstream JavaScript was executed.
- `upstream-inventory.json` records each upstream file's path, length, and SHA-256, including binary/image assets. It is research evidence, not a runtime network dependency.

## Official template inventory

| Area | Archive-relative files |
| --- | --- |
| Package and scripts | package.json |
| TypeScript | tsconfig.json, tsconfig.app.json, tsconfig.node.json |
| Vite and HTML | vite.config.ts, index.html |
| Lint and ignore seeds | _oxlintrc.json, _gitignore |
| Documentation | README.md |
| React and styles | src/main.tsx, src/App.tsx, src/App.css, src/index.css |
| Imported images | src/assets/hero.png, src/assets/react.svg, src/assets/vite.svg |
| Public assets | public/favicon.svg, public/icons.svg |

The example renders Get started and a working counter. Its imported PNG/SVGs, HTML favicon, and SVG symbol references all need to survive packing and generation if that example is retained. Merely checking that App.tsx exists is not sufficient.

### Package and checks

The released manifest contains:

- Scripts: dev = vite; build = tsc -b && vite build; lint = oxlint; preview = vite preview.
- Runtime ranges: react and react-dom ^19.2.8.
- Development ranges: @types/node ^24.13.3, @types/react ^19.2.18, @types/react-dom ^19.2.4, @vitejs/plugin-react ^6.1.0, oxlint ^1.79.0, typescript ~6.0.2, vite ^8.2.2.
- Oxlint enables react, typescript, and oxc plugins, with rules-of-hooks and only-export-components rules. The template does not install type-aware linting.

The currently pinned direct versions in Temvia fit these upstream ranges. Preserving those pins is therefore a low-churn option, with their deliberate differences recorded. For the new linter, [oxlint 1.80.0 metadata](https://registry.npmjs.org/oxlint/1.80.0) was checked: its Node engine is ^20.19.0 || >=22.12.0, and its vite-plus and oxlint-tsgolint peers are optional. An exact 1.80.0 pin fits the official ^1.79.0 range and the current Node >=24 contract. This metadata check is not a successful installation/build claim.

Temvia can preserve its additional check = tsc -b command without replacing official lint or preview commands. No root CLI linter or new UI test framework is implied.

### Configuration differences

Only the current tsconfig.json is byte-identical to the upstream file at the same path. The upstream application/Node configs and entry points should be imported coherently, rather than reconstructing selected settings:

- Upstream main.tsx imports App.tsx with the extension and loads index.css.
- Upstream TS configs include allowImportingTsExtensions, moduleDetection, and erasableSyntaxOnly; the application config includes allowArbitraryExtensions.
- The upstream Node config uses nodenext, while the current handwritten Node config uses ESNext/Bundler.
- Upstream vite.config.ts configures the official React plugin and has no explicit server block.
- The current source uses style.css, which the official layout does not contain.

These are differences, not proof that the existing application is broken. The previous successful build/browser verification remains valid for its old snapshot, not for the proposed migration.

### Filename transformations

The published initializer's dist/index.js contains explicit mappings:

- _gitignore -> .gitignore
- _oxlintrc.json -> .oxlintrc.json

Temvia currently renames only the root-relative _gitignore in src/generate.ts:96. Copying raw upstream files into template/admin without adapting this rule would leave nested _gitignore and _oxlintrc.json names unprocessed. Plan an explicit packaging/materialization policy and test the resulting nested dotfiles. Do not assume upstream archive seed names are already runnable output names.

The current template/.npmignore and generator filters intentionally exclude .gitignore, installs, build output, secrets, local lockfiles, and pnpm-workspace.yaml. Preserve those protections; verify that valid new lint/dotfiles and image assets are not accidentally excluded.

### Upstream notice scope

The archive's package/LICENSE separately identifies the CLI code as MIT and the files in template-* directories (and generated files) as CC0 1.0 Universal. The [upstream license file](https://raw.githubusercontent.com/vitejs/vite/main/packages/create-vite/LICENSE) confirms that distinction. Record the template-specific notice/provenance instead of labeling the template MIT based solely on the npm package's license field. Do not copy the CLI's bundled dependency code or assign a license to the entire Temvia project as part of this migration.

## Proposed minimum customizations, pending final planning approval

1. Keep the private frontend package name admin, Node >=24, and pnpm 11.24.0.
2. Keep existing exact direct dependency pins where they fit the upstream ranges; add the validated exact Oxlint pin. Record this policy as an intentional manifest difference.
3. Preserve the existing pnpm check entry point in addition to official dev/build/lint/preview.
4. Preserve loopback-only development, preferred port 5173, and automatic port fallback. Do not reintroduce strictPort or promise a fixed running port.
5. Add concise source-version/difference documentation and the template-specific upstream notice, without replacing the upstream technical README unnecessarily.
6. Keep the current shared root ignore/security rules while correctly materializing the selected upstream admin ignore/lint files.
7. Keep the upstream demo unchanged for the initial rebased baseline; the user has approved this visible UI change.

This list is a recommendation for review, not an implementation authorization. No official auto-update feature, runtime create-vite dependency, or upstream code fetch during generation is needed.

## Affected local contracts and files

| File or area | Required planning consideration |
| --- | --- |
| template/admin/ | Coherent source/config/asset import, selected UI treatment, documented package/listener customizations |
| src/generate.ts:96 | Nested seed filename materialization |
| src/generate.ts:103 | Required assets currently include the removed upstream-nonexistent src/style.css |
| tests/package.test.mjs:7 | The packed/generated inventory must include every chosen new asset, dotfile, and notice |
| tests/cli.test.mjs:98 | Update generated-directory assertions at line 107; preserve pollution and incomplete-template failure coverage |
| template/.npmignore and root .gitignore | Check new upstream output/ignore names without weakening secret/build/install exclusions |
| template/README.md and src/cli.ts | Keep check/dev instructions, document new commands where useful, and preserve printed-port guidance |
| .trellis/spec/frontend/quality-guidelines.md | Record upstream provenance, real frontend lint, and the selected demo behavior after implementation |
| .trellis/spec/backend/scaffolding-contract.md | Update exact file/materialization contracts without changing CLI safety semantics |

The root package.json belongs to the generator and does not need a dependency upgrade simply because the frontend template changes. Existing generated projects are outside scope.

## Planned validation boundary

Once the user approves the completed plan:

- Verify pristine baseline hashes and document all local deviations; retain an offline audit trail without requiring tests to fetch upstream.
- Run existing generator check/build, CLI tests, Git tests, and actual npm package tests. Keep all real Git operations local.
- Expand packaging/generation checks for binary-byte preservation, nested config names, missing required assets, and contaminated template filtering.
- Generate from the actual tarball locally, then one-way rsync the source and generated output to isolated Centaurus locations.
- On Centaurus, install the generated admin and run lint, check, and build; validate dev and production-preview assets through local port forwards.
- Browser-check the agreed page, interaction if retained, console errors, and successful asset loads. Preserve occupied-port fallback verification when editing the listener config.
- No installs, builds, generation, rsync, remote services, commits, or publication were performed during this research.

## Planning resolution

The user approved the official demo in the follow-up message OK. Its source, styles, and assets will remain unchanged; Temvia-specific page design is deferred. The finalized design and execution plan capture the minimum non-UI adaptations. Final planning-summary approval is still required before implementation.
