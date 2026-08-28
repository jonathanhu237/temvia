# Official React TypeScript Baseline Verification

Validation date: 2026-08-28. Implementation and independent review are complete; all five PRD acceptance criteria passed. Product changes were committed locally on 2026-08-29 after explicit user approval; see the closeout record below.

## Environment and boundaries

- Local macOS arm64 and Centaurus Linux amd64 used Node 24.20.0 and pnpm 11.24.0, selected explicitly through mise. No new tools or global-default changes were needed.
- All product edits, real Git operations/tests, actual package tests, and CLI generation ran locally. The shell's unrelated default Node 26.7.0 was not used.
- Local validation root: `/tmp/temvia-react-ts-validation.5MFvzu` (canonical `/private/tmp/temvia-react-ts-validation.5MFvzu`).
- Centaurus validation root: `/tmp/temvia-react-ts-validation.MHR6hz`, with separate source/ and project/ directories.
- Source and generated files were rsynced one way without Git metadata, dependencies, build outputs, or secrets. Frontend install/lint/check/build and services ran only on Centaurus.
- Generated lock/workspace files were retrieved only as validation artifacts, not imported into the template or used as remote product-source edits.

## Provenance and source invariants

- Baseline: verified create-vite@9.2.0 archive, prefix package/template-react-ts/. No initializer JavaScript was executed.
- Upstream archive SHA-256: `c370c3eafa839d8b16b51fbf28bf521b5beffab816ee236de5fa7e0c513a2eb4`. Both SHA-256 and SHA-512 were independently checked by the implementer and reviewer.
- All 18 upstream files are retained; 16 preserve exact bytes/hashes after filename translation. Only package.json and vite.config.ts are customized; UPSTREAM.md is the sole addition (19 final admin files).
- The template-specific CC0 section is exactly 6,797 bytes, SHA-256 `554474361d3cef192e40710acf7fdfd58151ee187d907fb461e90b6106b2b5e4`. No CLI-specific or bundled-dependency license content was imported.
- Offline fixture SHA-256: `0f99e70df4d0d92756e43a7e23250eee372bc6d49f0cc8097ba41980a163d25a`. Upstream entries match the independent research inventory, not hashes refreshed from modified local files.
- Obsolete handwritten template/admin/src/style.css was removed; its original remains recoverable from Git. No official upstream files were omitted.

## Automated checks

Local commands used `mise exec node@24.20.0 pnpm@11.24.0 --`; Centaurus used the same selection via `/home/jonathanhu237/.local/bin/mise`.

| Location | Commands / assertions | Result |
| --- | --- | --- |
| Local generator, implementer and reviewer | pnpm check; pnpm build | Pass |
| Local generator, both agents | pnpm test | 12/12 pass |
| Local generator, both agents | pnpm test:git | 5/5 pass, real disposable local repositories |
| Local generator, both agents | pnpm test:package | 2/2 pass, actual tarballs and offline installs |
| Local repository | git diff --check; untracked-inclusive whitespace scan (22 new files); task context validation | Pass |
| Centaurus synchronized generator | pnpm install --frozen-lockfile; pnpm check; pnpm build; pnpm test | Pass; 12/12 tests with substituted Git operations |
| Centaurus actual generated admin | pnpm install; pnpm lint; pnpm check; pnpm build | Pass; Oxlint 0 warnings / 0 errors |
| Source -> installed package -> generated project | Exact inventories and raw-byte equality, including binary assets | Pass |
| Local and Centaurus sample after HMR restoration | All 24 original source hashes | Pass |

Coverage includes independent baseline hashes/customizations, exact 19-file admin shape, nested exact _gitignore mapping without arbitrary underscore renames, active .oxlintrc.json, missing asset/config/provenance preflight failures before writes, and polluted-template exclusions including dist-ssr. Existing argument, module, target, cleanup, Git, offline-bin, and independent-app safety tests remain intact.

Root package/lock, bilingual READMEs and all three Go seed files were byte-compared with accepted commit `349fa6f249f5ca980eb22453a7ddbff1789c4ba4`. The CLI/Git implementation and shared root ignore seed remain unchanged. Generated Go bytes match the seed with only the requested module identity substituted, so prior accepted Go runtime evidence remains applicable. No fresh Go runtime test or root JavaScript lint is claimed.

## Actual artifact and generated sample

The main session ran npm pack --json --ignore-scripts after the verified CLI build, installed the tarball into isolated consumer/ with npm install --offline --ignore-scripts --omit=dev --no-audit --no-fund --package-lock=false, then invoked its mapped bin:

```sh
npm exec --offline --no -- create-temvia /tmp/temvia-react-ts-validation.5MFvzu/project --module example.com/temvia-official/api
```

- Tarball: `/tmp/temvia-react-ts-validation.5MFvzu/artifacts/create-temvia-0.0.0.tgz`.
- SHA-256: `c3409651e45468a155f2bf697e1c55de161b473ccbc2c61e5ade435b1790ac31`.
- npm SHA-1: `b13dce42f2a3c98e35d85c2c27ecb4488a85d997`.
- 30 packed entries, 37,654 bytes compressed / 83,973 bytes unpacked.
- Inventory: `/tmp/temvia-react-ts-validation.5MFvzu/artifacts/pack.json`.
- 24-file source manifest: `/tmp/temvia-react-ts-validation.5MFvzu/artifacts/generated-source-manifest.json`.
- All 30 installed files match current source/build. All 24 generated files match the installed template after exact ignore-name mapping and Go-module substitution.
- Generation created no root application package/workspace, raw admin seed names, seed lock, or installed admin dependencies.

The actual admin install resolved 70 dependency entries and added 27 packages. Normal pnpm supply-chain checks passed. It created an admin-local pnpm-workspace.yaml with minimumReleaseAgeExclude for @vitejs/plugin-react@6.1.1; no safety checks were disabled and no root application workspace was introduced.

Retained installation artifacts:

- `/tmp/temvia-react-ts-validation.5MFvzu/artifacts/tested-admin-pnpm-lock.yaml`; SHA-256 `f3ee5337dd9dc185803d0182db7ce3bdd933acc39dcc63df6a4a7ba4e3dddf1d`.
- `/tmp/temvia-react-ts-validation.5MFvzu/artifacts/tested-admin-pnpm-workspace.yaml`; SHA-256 `5ca8e2ef40cb5c5ea5466ef72629007b485eb52e21301914888ba595a1702da9`.

These are evidence, not template additions. Direct pins do not guarantee identical future transitive resolution before the consuming application has a lockfile.

## Browser, HMR, and port acceptance

| Service | Actual Centaurus listener | Local forward |
| --- | --- | --- |
| Plain pnpm dev, no overrides | 127.0.0.1:5175 | http://127.0.0.1:15180/ |
| pnpm preview --host 127.0.0.1 --port 4173 | 127.0.0.1:4173 | http://127.0.0.1:14180/ |

- Existing user listeners occupied 5173 and 5174. Vite reported both conflicts, selected 5175, and printed its actual URL. Existing services were not interrupted.
- Both dev and production preview returned HTTP 200 and rendered Get started, documentation/community links, images and icons. Screenshots were visually inspected.
- All five image elements loaded with nonzero natural sizes on both pages; hero.png was 343 x 361. Preview used emitted hashed asset filenames.
- /icons.svg and /favicon.svg returned HTTP 200 on both services; six SVG symbol references were present and visible.
- On both pages, clicking Count is 0 changed it to Count is 1. Browser warning/error logs were empty.
- HMR was tested without navigation/reload: a temporary local disposable-sample heading change to Get started — HMR verified was rsynced one way and appeared in the open tab while Count is 1 remained intact.
- The local heading was restored and resynced. Get started returned with counter state retained; Vite logged both HMR updates. All 24 local/remote source hashes then matched the original manifest. No product template source was changed for this probe.

## Independent review and specs

The native trellis-check agent reviewed all changed product/test/spec files and the task requirements, reran all local gates, and independently validated upstream provenance. No product defects, unexplained baseline changes, or product-source fixes were found.

One documentation-only finding was fixed: the scaffolding spec initially equated repository ignores with stricter pack/copy exclusions. Main narrowed the wording; the reviewer verified it. Product source stayed frozen throughout acceptance.

Frontend quality and scaffolding specs now capture source provenance, the two-file customization boundary, actual frontend lint, nested seed/config names, artifact exclusion rules and generated-output runtime checks. Durable review: project Trellis channel official-react-ts-baseline, events 4–6.

## Cleanup and limitations

- Stopped only task-owned dev session 83337, preview session 67507, and SSH forwarding session 62565 using Ctrl-C. Their termination exits are intentional cleanup, not failed acceptance.
- Socket checks confirmed remote 5175/4173 and local 15180/14180 were released; existing remote 5173/5174 listeners remained. Temporary browser tabs were closed.
- Isolated source and artifacts remain for review/reproducibility; no broad deletion was performed.
- Windows runtime is unverified; future unlocked transitive resolutions may differ. This is a fixed bundled baseline, not automatic upstream updates or a guarantee of defect-free upstream code.
- Before final LGTM/commit approval, no staging, commit, archive, or journal auto-commit occurred. No push, npm publication, production deployment, or retrofit of existing generated projects is part of closeout.

## Approved commit and closeout

- On 2026-08-29, the user explicitly approved the completed change with LGTM and permission to commit.
- Work commit: e3615317a5882dd1de40d4d1c364c9e537f52f69, refactor(template): base admin on official Vite react-ts.
- Final pre-commit checks passed: staged whitespace validation, the verified tarball's unchanged SHA-256, byte equality of all 30 installed package files with current source/build, and the independently reviewed upstream fixture's unchanged SHA-256. The existing full test and Centaurus/browser acceptance results above remain applicable; no fresh application build is claimed for closeout.
- The work commit contains only the 32 planned product, regression-test, and specification files. Task archive and developer journal are separate subsequent Trellis bookkeeping commits.
- The unrelated Bootstrap Guidelines task remains active and untouched. No push or publication was performed.
