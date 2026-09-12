# Automatic create-temvia releases

Every branch push builds, checks and tests the package, retaining artifacts for 30 days.
Only `main` publishes to npm after verification and when unpublished commits warrant a release.
Release also supports `workflow_dispatch` for retries, without a version input or manual acceptance checkbox.

## Version policy

Analyze **all commits since the last successful npm release**, not just the latest push.
Use Conventional Commits; unrecognized titles fail planning instead of silently omitting a change.

| Commits | Result from 0.2.3 |
| --- | --- |
| `feat` (including scoped features) | `0.3.0` |
| `fix`, `perf`, `refactor`, `revert` | `0.2.4` |
| `!` in the header or `BREAKING CHANGE:` footer | `0.3.0`, remaining on 0.x |
| Only `docs`, `test`, `build`, `ci`, `chore`, `style` | Build without publishing |

Minor takes precedence when a batch contains both features and fixes. Multiple changes produce one version.
Ordinary merge commits do not affect the result. Failed builds do not advance the release baseline.
Use `feat` for functional additions, not `chore`. Moving to 1.x requires an explicit policy change.

The workflow updates package.json and `temviaRelease.commit` only in its temporary checkout.
It does not push version commits to main. The source version is a local development baseline;
npm and `v0.x.y` tags identify published versions. No manual package.json version bump is necessary.
The historical manual 0.2.0 release has no source metadata; its successful release source,
`a51c9e5b03e3af98d88f85bf89a5a18f09b9a666`, is the explicit bootstrap baseline.

## Pipeline

1. Plan the version and test release rules.
2. Check/build/test the generator, test Git integration, test/vet/build the API, and lint/check/test/build the admin.
3. Install and generate from the actual tarball; verify its inventory and Go module replacement.
4. Publish that exact tested tarball. Create the source tag and GitHub Release with the tarball and SHA-256.
5. Wait for npm latest and verify the public `pnpm create temvia@latest` entry point.

Runs queue per branch without interrupting an active publication. A stale queued source cannot replace a newer
published version. Registry failures or divergent source histories fail instead of guessing a version.

Automation replaces the previous mandatory per-release manual macOS acceptance confirmation.
It does not claim complete macOS/browser acceptance for each version or execute the database integration tests
that require `TEST_POSTGRES_DSN`. Run additional acceptance for changes affecting installation, deployment or
critical business flows. First-run setup requires four secret configuration values.

## GitHub setup

Enable Actions, retain a valid `NPM_TOKEN` in the `npm` Environment, and grant the publication job
`contents: write` for tags and releases. Required reviewers on the environment still pause publication;
leave that gate unset for fully automatic releases. Only the publication step receives the npm token.
Never place tokens in source or command arguments.

## Recovery

Failed builds/package tests do not publish. npm versions cannot be overwritten.
If npm succeeded but tagging, GitHub Release creation or the public smoke test failed, rerun failed jobs.
The script skips duplicate npm publication only when the version, source commit and SHA-512 match,
then completes the remaining steps. Conflicts fail explicitly. Rerun the entire workflow if artifacts expired.

npm, Git tags, GitHub Releases and Actions logs record publication; CHANGELOG.md retains curated notes.
Generated projects remain independent copies and do not receive upstream changes automatically.
