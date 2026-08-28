# Design: official React TypeScript baseline

Status: approved for implementation by the user after the complete final planning summary. Material deviations still require renewed review.

## 1. Boundary and approach

Use the verified create-vite 9.2.0 release as a source snapshot, then apply a small, explicit compatibility layer. Do not reconstruct the official files from memory or invoke an unpinned initializer.

The data flow is:

```text
verified upstream archive
  -> local template/admin (source import + documented adaptations)
  -> Temvia npm tarball
  -> independent generated admin (seed filename materialization)
  -> Centaurus install/check/build and locally forwarded browser validation
```

Importing the upstream template is a contributor-time operation. Generating a user project remains a local bundled-file operation with no upstream fetch, create-vite runtime dependency, package installation, or service startup.

This is one coherent task: template provenance, package contents, and generated behavior must pass together. No parent/child task split is necessary. The Go source, existing generated projects, root application layout, and CLI safety semantics remain unchanged.

## 2. Fixed source and audit trail

- Source: https://registry.npmjs.org/create-vite/-/create-vite-9.2.0.tgz
- Template prefix: package/template-react-ts/
- Expected SHA-512 and archive SHA-256: research/upstream-inventory.json.
- Expected template contents: exactly the 18 paths, byte lengths, and SHA-256 values recorded in that inventory.

Validate the archive before importing. Extract only the selected template files and the template-specific notice from package/LICENSE; do not execute or vendor the initializer's compiled CLI. Reject unexpected paths or entry kinds rather than importing an arbitrary archive tree. Preserve source encoding, newlines, and binary bytes.

Create template/admin/UPSTREAM.md with the release URL, integrity, original source prefix, filename translations, customization list, and the template-specific CC0 declaration/text from that same artifact. Do not describe the template as MIT based on the CLI package metadata or assign a project-wide license to Temvia. Preserve the upstream README unchanged.

For offline regression checks, copy the independently verified inventory into tests/fixtures/react-ts-baseline.json, with a small explicit classification of the two customized files. Tests must not depend on .trellis task paths, a current network response, or production code's own required-file list as their sole oracle. The fixture is test-only and is not published with the CLI.

## 3. File mapping and approved differences

| Upstream path | Stored under template/admin | Generated under admin | Treatment |
| --- | --- | --- | --- |
| _gitignore | _gitignore | .gitignore | Preserve bytes; materialize the nested seed filename |
| _oxlintrc.json | .oxlintrc.json | .oxlintrc.json | Preserve bytes; normalize at import so template-local lint works |
| package.json | package.json | package.json | Apply only the manifest adaptations below |
| vite.config.ts | vite.config.ts | vite.config.ts | Add only the existing development listener contract |
| Other 14 upstream files | Same relative paths | Same relative paths | Preserve byte-for-byte |
| No upstream counterpart | UPSTREAM.md | UPSTREAM.md | Add provenance, delta documentation, and template notice |

The final admin seed therefore contains 18 upstream-derived files plus one provenance document. Sixteen upstream-derived files stay byte-identical after filename translation. Remove the obsolete template/admin/src/style.css; do not retain unused custom-page code or images. Preserve the official main.tsx, App.tsx, App.css, index.css, HTML, all three TypeScript configs, technical README, and all five assets without reformatting.

The user approved the official Get started page and counter. Keep its visible labels, layout, links, and behavior; no Temvia branding changes are part of this task.

### Manifest adaptations

Keep upstream dev, build, lint, and preview commands. Add check = tsc -b to preserve the existing public command. Keep name = admin, private = true, version = 0.0.0, type = module, engines.node = >=24, and packageManager = pnpm@11.24.0.

Use these exact direct versions, all within the verified upstream ranges:

| Dependency | Exact version |
| --- | --- |
| react, react-dom | 19.2.8 |
| @types/node | 24.13.3 |
| @types/react | 19.2.18 |
| @types/react-dom | 19.2.5 |
| @vitejs/plugin-react | 6.1.1 |
| typescript | 6.0.3 |
| vite | 8.2.2 |
| oxlint | 1.80.0 |

All but Oxlint preserve current Temvia pins. Do not add optional type-aware lint peers, React Compiler, a UI test framework, or a root CLI linter. The first admin install still creates its own lockfile; no seed lock or workspace is added. Do not weaken package-manager safety checks to avoid local install metadata.

### Development listener

Starting with upstream vite.config.ts, retain its official React plugin and add server.host = 127.0.0.1 and server.port = 5173. Omit strictPort. Preserve the guidance to use Vite's printed URL when the preferred port is occupied.

Keep the upstream preview script. During acceptance, bind the preview explicitly to loopback on a free port and forward that port; no public service exposure or production deployment is implied.

## 4. Generator and packaging changes

In src/generate.ts, extend the existing _gitignore filename rule to recognize that exact basename in nested directories as well as the root. Do not rename arbitrary underscore-prefixed files. The Oxlint file is already materialized as .oxlintrc.json in the source template and needs no runtime rename.

Update template completeness preflight for the final frontend file set, including all referenced images, the public SVG sprite, nested .gitignore, .oxlintrc.json, upstream README, and UPSTREAM.md. Remove the old src/style.css requirement. Keep exclusive file creation, missing-template failure before writes, conservative cleanup, and all Go/Git validations unchanged. Keep an explicit required-file contract; do not reduce completeness validation to whatever files happen to exist in the template.

Preserve existing pack/copy exclusions and the shared root _gitignore. In addition, align development-artifact exclusions with upstream's dist-ssr output directory, and test its exclusion. Check the root repository ignore rules, template/.npmignore, and generator filters together without weakening environment-secret exclusions. Do not exclude the legitimate .oxlintrc.json or official image assets.

The package allowlist remains dist and template. The actual tarball must include the nested admin/_gitignore seed, and generated output must contain admin/.gitignore instead. No raw admin/_oxlintrc.json or admin/_gitignore may remain in generated output. The root generated .gitignore remains present independently of the admin-local ignore file.

## 5. Documentation and specification scope

- template/admin/README.md: import unchanged from upstream.
- template/admin/UPSTREAM.md: provenance, exact deviations, and the template-specific notice.
- template/README.md: retain API/startup guidance; document admin lint/check/build/preview and the official example without implying a fixed running port.
- src/cli.ts: preserve CLI signatures and startup behavior; only adjust next-step text if needed for consistency with the generated README.
- Frontend quality spec: replace the obsolete no-linter/static-page statements with the actual frontend lint/demo contract and provenance rules.
- Scaffolding contract: document nested seed handling, new completeness/packing expectations, and the distinction between frontend lint and the unchanged root generator toolchain.

The main session owns spec updates and the final review. Do not modify the root English/Chinese READMEs or unrelated bootstrap guidelines.

## 6. Verification and failure cases

### Offline source and package invariants

- Check the 16 unchanged upstream files against the independently recorded hashes, with explicit filename mapping.
- Verify package.json's documented adaptation, the two customized-path exceptions, the added provenance file, and the absence of obsolete style.css or unexplained extra assets. Test expectations must not be silently refreshed from whatever local files currently contain.
- From the actual installed tarball, compare generated bytes to the source payload, including hero.png. Retain the existing unrelated-cwd, no-dev-dependency, npm-bin-mapping, Git, and independent-application checks.
- Add negative cases for a missing frontend asset and missing lint config: preflight must fail before creating output.
- Verify nested .gitignore generation, effective .oxlintrc.json naming, root ignore preservation, and no raw seed-name leaks.
- Contaminate the template with installs, dist/dist-ssr, lockfiles, local workspace metadata, secrets, and other existing blocked artifacts; none may be packed or generated.

### Runtime evidence

Generate a representative application from the real tarball locally, synchronize it one-way to Centaurus, and install/build/test that output rather than a hand-created fixture or only the source template. Check lint, TypeScript, production build, dev page/assets, counter interaction, hot reload, production preview, console errors, and occupied-port fallback through local forwards.

Any temporary source edit used to prove hot reload must originate locally, be synchronized one-way, and be reverted in the disposable sample before final source/hash checks. Never edit remote source directly. The unchanged Go files can be byte-compared with the accepted baseline; repeat Go runtime checks only if their output or behavior changes.

## 7. Risk and rollback

- A bad import can omit binary/public assets or misname dotfiles while still looking plausible in source. Hash checks, real tarball tests, and browser asset checks cover different parts of this risk.
- Direct pins do not freeze transitive first-install resolution. Record the tested generated lockfile separately; do not promise that future installs resolve identically.
- The official template and the declared Node engine are not a universal platform guarantee. Windows remains outside tested coverage.
- If Centaurus is unavailable, report the blocker; do not switch to resource-intensive local application builds without permission.
- Before implementation, inspect the dirty tree and preserve all non-task edits. Roll back only task-owned changes with targeted reverse edits or saved file snapshots, never a repository reset. Do not touch pre-existing generated projects.
- No commits, pushes, publication, release automation, or task archive are part of planning approval; use the later workflow and authorization for closeout actions.
