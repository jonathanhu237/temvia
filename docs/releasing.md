# Releasing create-temvia

The release workflow is a maintainer-triggered GitHub Actions workflow. It
runs only when a maintainer selects **Run workflow** for `.github/workflows/release.yml`
from `main`; ordinary pushes do not publish to npm. The input version must
match `package.json` exactly. The first public release is `0.1.0`.

## Preflight before Run workflow

Complete the macOS first-run acceptance against the exact tarball built from
the source commit you intend to publish. In a fresh directory, generate the
project from that tarball, fill the five documented secret values, run
`make build`, `make migrate-up`, and `make up`, open the setup link from the API
logs, create the first administrator, and sign in. Record the tarball SHA-256
and the full source SHA from `git rev-parse HEAD` after checking out that
source. This is the release gate; component checks on another machine do not
replace it.

Before dispatching, also check that the English and Chinese setup and release
documents, the root and generated-project MIT licenses, the upstream notice,
and `CHANGELOG.md` are complete for that same source commit. In **Run
workflow**, enter that full lowercase SHA in `verified_commit_sha`, select both
`macos_acceptance` and `release_readiness`, and enter the package version. The
workflow compares the SHA with `GITHUB_SHA` and stops before packaging or
publishing when either acknowledgement is missing or the evidence belongs to a
different commit.

## First publish: npm token bootstrap

The first release uses an npm granular access token because no npm trusted
publisher has been configured yet.

1. Confirm that the npm account which owns `create-temvia` can publish it and
   that the GitHub repository is public. Create a granular access token from
   npm's access-token settings with the minimum package and scope access
   available for this first publish, read and write package permission, a short
   expiry, and `Bypass 2FA` only if npm's publishing policy requires it. Keep
   the token in a password manager. npm recommends trusted publishing whenever
   it is available; the token is a bootstrap credential for this release.
2. In the repository's **Settings → Environments**, open the `npm` environment
   and add an environment secret named `NPM_TOKEN`. The GitHub CLI equivalent
   is `gh secret set NPM_TOKEN --env npm`, which reads the value interactively;
   never put the token in a command argument, source file, issue, or log.
3. Optionally add required reviewers and a `main` deployment branch rule to
   the `npm` environment. The publish job cannot read `NPM_TOKEN` until its
   environment protection rules have passed.
4. From the Actions tab, choose **Release → Run workflow**, select `main`, and
   enter the version, `verified_commit_sha`, and the two preflight confirmations
   described above. Do not rerun a successful publish for the same version; npm
   versions are immutable.

The token is exposed only to the publish steps. The verification job runs
without it and must finish before the environment job starts. If a required
check fails, the publish job is skipped. The workflow does not create a Git
commit or tag.

## What the workflow verifies

Before publishing, the workflow checks the package name, version, public
metadata and MIT license, then runs the generator type check, build, CLI tests,
Git integration tests, API Go tests/vet/build, and generated-admin lint,
TypeScript check, unit tests and build. The package acceptance test creates the
tarball, installs that tarball without development dependencies, generates a
project from it, and checks the generated inventory and module replacement.

That same tested tarball is copied to the workflow artifact and protected by a
SHA-256 checksum. The publish job downloads and checks the artifact before
running `npm publish`. After npm propagation, it runs
`pnpm create temvia@latest` against the public registry in a fresh temporary
directory and checks the generated README, Chinese README, license and Go
module. This last check is release evidence, not a substitute for the local
macOS first-run acceptance described by the project documentation.

## Moving to npm trusted publishing later

npm supports GitHub Actions trusted publishing through OIDC. It is optional
for this first release; do not remove `NPM_TOKEN` until the replacement has
been configured and tested.

1. In the npm package settings, add a **Trusted Publisher** for GitHub Actions
   with organization or user `jonathanhu237`, repository `temvia`, workflow
   filename `release.yml`, and environment name `npm`. npm expects only the
   filename, while the workflow lives under `.github/workflows/`.
2. Update the publish job's permissions to include `id-token: write`, remove
   the `NPM_TOKEN` requirement and `NODE_AUTH_TOKEN` environment, and publish
   the exact downloaded tarball with provenance enabled. Keep the `main`
   source check, environment protection, checksum check, and public smoke test.
3. Run a new version and confirm the npm provenance attestation before removing
   the old environment secret.

See the [npm trusted publishing guide](https://docs.npmjs.com/trusted-publishers/),
[npm access-token guidance](https://docs.npmjs.com/about-access-tokens/), and
[GitHub environment and secret documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
for the platform rules behind these steps.

## After a release

Record the Actions run URL, published version, tested tarball SHA-256, npm
package URL and the public `pnpm create` smoke result in the release notes.
Update `CHANGELOG.md` before the next version. Generated projects are
independent copies and do not receive these changes automatically.
