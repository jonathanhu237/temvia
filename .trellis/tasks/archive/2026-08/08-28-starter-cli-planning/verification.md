# Initialization Verification

Date: 2026-08-28. First implementation, independent review, and the Vite port-fallback correction are complete. The user accepted this milestone and approved the local commit/archive/journal plan. Work commit: 349fa6f249f5ca980eb22453a7ddbff1789c4ba4. No push or npm publication was performed.

## Environment

- Local: macOS arm64, Node 24.20.0, npm 11.19.0, pnpm 11.24.0.
- Centaurus: Linux amd64, Node 24.20.0, npm 11.19.0, pnpm 11.24.0, Go 1.27.0.
- New tools were installed with mise without changing global defaults.
- Source changes and all Git operations occurred locally. Code was synchronized one way via rsync into /tmp/temvia-initialization.6wMFK4. No product code was edited remotely.

## Completed checks

| Check | Result |
| --- | --- |
| Local pnpm check / pnpm build | Pass, re-run by the independent reviewer after fixes |
| Local pnpm test | 9/9 pass |
| Local pnpm test:git | 5/5 pass, using disposable local Git fixtures |
| Local pnpm test:package | 2/2 pass, actual npm tarballs and offline consumer installs |
| Centaurus final CLI check/build/unit tests | Pass; 9/9 unit tests with substituted Git operations |
| Generated API gofmt check / go vet ./... / go test ./... | Pass |
| Generated API go build -o bin/server ./cmd/server | Pass |
| Generated admin pnpm install / pnpm check / pnpm build | Pass |
| Forwarded GET /health | HTTP 200, Content-Type application/json, body status=ok |
| Browser smoke | Admin ready. heading and starter content rendered; no warning/error console logs; screenshot visually inspected |
| Committed root README comparison against HEAD | Unchanged |

No separate JavaScript linter is configured. TypeScript checks are not being reported as lint.

## Actual packed output

The main session packed the built CLI, installed it into an isolated consumer with npm --offline --ignore-scripts --omit=dev, and invoked the mapped create-temvia command through npm exec. The generated project has its own Git repository, only untracked starter files, no installed admin dependencies, and no root workspace/package.json.

Final reviewed artifact:

- /tmp/temvia-preview.YP7NOl/reviewed/create-temvia-0.0.0.tgz
- npm-reported SHA-1: 097d2a57d5fa5e4d837af019a6f16a405c3ed8fa
- 20 tarball entries; 8,650 bytes compressed; 22,819 bytes unpacked.
- Pack inventory: /tmp/temvia-preview.YP7NOl/reviewed/pack.json

Final generated sample:

- /private/tmp/temvia-preview.YP7NOl/reviewed/project
- Module: example.com/temvia-preview/api
- 14 source files, excluding Git metadata.
- SHA-256 manifest: /tmp/temvia-preview.YP7NOl/reviewed/project-manifest.json

The initial packed output was synchronized to Centaurus and all 14 source hashes checked before its application builds. The independent review changed only generator validation, not templates. A fresh generation from the final reviewed tarball matches every one of those 14 verified source hashes, so the running applications are byte-identical to the final generated source.

The generated admin's first installation created its own lockfile and pnpm-local minimumReleaseAgeExclude configuration. The tested lockfile was retained as a separate validation artifact at /tmp/temvia-preview.YP7NOl/reviewed/tested-admin-pnpm-lock.yaml; it was not copied into the seed template or imported as a remote source edit.

## Independent review fixes

1. Go module host components must follow the same Windows reserved-name restriction as later components; con.example/api now fails before output.
2. A broken .git pointer can produce a colon-form “not a git repository” diagnostic. It must fail rather than trigger a nested git init.

Both regressions were observed failing before the fixes and passing afterward. Existing unit/Git tests were extended; no new public feature or template behavior was added.

The implementation also avoids import.meta.main, which requires Node 24.2 despite the package's Node >=24 declaration. Entry detection resolves the npm bin symlink using APIs available at the declared minimum.

## Acceptance preview (stopped)

Generated application source on Centaurus: /tmp/temvia-initialization.6wMFK4/project

| Application | Remote loopback | Local forwarding |
| --- | --- | --- |
| API | 127.0.0.1:28080 | http://127.0.0.1:18080/health |
| Admin | 127.0.0.1:25173 | http://127.0.0.1:15173/ |

The default remote 8080/5173 ports were already occupied, so preview-only environment/CLI overrides were used. Template defaults remain unchanged.

The temporary foreground SSH/service sessions used during review were:
- API + forward: exec session 37833.
- Admin + forward: exec session 29941.

After the user accepted and authorized closeout, both task-owned sessions were stopped. Socket checks confirmed that remote 28080/25173 and local 18080/15173 were released. The user's separate my-app services were not stopped. No public hosting, daemon installation, or changes to existing services were made.

## Remaining limitations

- Windows has not been runtime-tested.
- The first admin install resolves transitive versions before creating its own lockfile; future resolutions are not claimed to match this run.
- npm name ownership, licensing/release decisions, publication, database/business features, and production deployment remain outside this task.
- The accepted product and specifications are recorded in work commit 349fa6f249f5ca980eb22453a7ddbff1789c4ba4; task records and the session journal are maintained by the separately authorized Trellis closeout commits.

## Acceptance follow-up: Vite default port fallback

The user approved this correction on 2026-08-28 after a local port conflict. The template and the current my-app acceptance project now omit strictPort while retaining loopback binding and preferred port 5173. CLI and generated README instructions use Vite's printed URL. The artifact and runtime results above describe the earlier initialization snapshot; the following evidence covers this correction.

- Corrected artifact: /tmp/temvia-port-fallback.efJSYM/create-temvia-0.0.0.tgz; SHA-1 3eddb72277f0eb5e07786a2be51dc66568e9b015. Pack inventory and generation output are retained beside it.
- The actual tarball was installed offline without development dependencies and generated /tmp/temvia-port-fallback.efJSYM/project. That output was synchronized one way to Centaurus at /tmp/temvia-port-fallback.gzNrTF/project; no Git metadata was synchronized.
- Template, my-app, packed output, and remote vite.config.ts all have SHA-256 407d16b4c774fd1d01ae84b2f8672e58895c6d37929cf73215b9829dd065bb64.
- Local CLI check/build and all existing tests passed: 9 CLI, 5 Git, 2 actual-package tests. No test was added merely to restate the configuration.
- Independent review found no product issues and repeated CLI check/build, all 16 tests, and git diff --check successfully. The frontend quality specification was updated to preserve default fallback and printed-URL guidance.
- Generated admin pnpm install, pnpm check, and pnpm build passed on Centaurus.
- Plain pnpm dev, without host/port/strictPort overrides, reported that both 5173 and 5174 were occupied and successfully listened at http://127.0.0.1:5175/.
- The selected port was forwarded to local 15174. GET / returned HTTP 200 and the expected Admin HTML. No fresh visual-browser check was needed: all UI source, HTML, dependencies, and TypeScript configs match the previous browser-verified sample; the Go source also remains unchanged.
- Temporary server session 3759 and tunnel session 46184 were stopped. Follow-up socket checks confirmed 5175 and local 15174 were released; existing listeners at 5173, 5174, and the old preview at 25173 were left intact.

No API, dependency, i18n, root bilingual README, commit, push, or publication changes are part of this correction.

## Final acceptance gate

After user acceptance, a full-scope independent review covered the CLI, templates, tests, tooling, applicable specs, and all acceptance criteria. It found no outstanding product issues or required edits. CLI check/build and all 16 tests passed again, as did git diff --check and an untracked-inclusive whitespace scan of the 27 product/tooling files.

All 20 files in the corrected tarball match the current source/build. All 14 generated template files match the corrected sample after normalizing its Go module identity. The retained Centaurus checks therefore remain applicable; unchanged Go and UI behavior did not require repeat builds or browser checks. The user subsequently approved the commit/archive/journal plan, and the accepted source is recorded in work commit 349fa6f249f5ca980eb22453a7ddbff1789c4ba4. The separate Bootstrap Guidelines task is not part of this closeout.
