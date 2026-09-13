# Temvia

English | [简体中文](README.zh-CN.md)

A Go API and React admin starter, distributed as the `create-temvia` CLI.
Includes administrator setup, login and password recovery, invitations, roles
and permissions, user deactivation and deletion, online users and force sign-out, operation history, email and
system identity settings, Chinese/English interfaces, and light/dark themes.

## Quick start

Install Node.js 24 or later, pnpm 11.24.0, Docker with Compose v2, and Make.
On macOS, Make is available through Xcode Command Line Tools (`xcode-select --install`).
Start your Docker engine before continuing. Go is only needed for development
outside containers. Git is optional; the generator initializes a repository
when Git is available and the target is outside an existing repository.

```sh
pnpm create temvia@latest my-project --module github.com/your-name/my-project/api
cd my-project
```

Use a new or empty directory. Replace the module path with your own Go module
identity. The generator does not install dependencies, generate secrets, run
migrations, start services, or create commits.

Continue with the generated [first-run guide](template/README.md#first-run):
configure four secret values, build containers, run migrations, start the stack,
then use the setup link from the API logs to create an administrator and log in.
Docker Compose is the main first-run route; the same guide covers development
and production configuration separately.

The release and non-publishing quality workflows exercise the exact tarball
through a fresh Compose, PostgreSQL, Mailpit, and Chromium critical acceptance
route on an Ubuntu runner. The fixed gate covers setup/login, password recovery,
persisted personal settings, asynchronous mail delivery and controlled repair;
it also runs the selected real PostgreSQL/HTTP integration tests twice under the
race detector. It is one CI route, not a general Linux/WSL2 or production
compatibility claim. The local complete first-run route has been tested on
macOS; native Windows PowerShell is not a supported first-run route. Component
tests do not constitute a full installation check.

## Ownership and maintenance

Generated projects are independent source copies with no Temvia runtime
service or automatic upgrade mechanism. You own your added code and maintain
your project's dependencies and changes. Review [release notes](CHANGELOG.md)
and important fix guidance to decide which upstream changes to apply manually.

Report bugs and suggestions through [GitHub Issues](https://github.com/jonathanhu237/temvia/issues).
For vulnerabilities, use the private channel in [SECURITY.md](SECURITY.md).
Maintenance is best effort, without a fixed response time or long-term support
for old versions.

## Contributing and releases

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
pnpm test:git
mkdir -p .release
export TEMVIA_TEST_TARBALL="$PWD/.release/create-temvia-quality.tgz"
pnpm test:package
node scripts/critical-acceptance.mjs "$TEMVIA_TEST_TARBALL"
```

The final command is the canonical mandatory acceptance entry point. It creates
its own temporary consumer, generated project, Compose project name, random
loopback ports, PostgreSQL volume, Mailpit instance, credentials, and browser
fixtures, then removes only those resources. Docker Compose v2, Make, Go 1.27,
Node.js 24, pnpm 11.24.0, and a network-accessible Chromium download are
required. Missing dependencies, a missing DSN/Mailpit/browser, a skipped or
zero-test selection, a timeout, a failed child command, or cleanup failure is a
failure; a regular DSN-less `go test ./...` is not a substitute for this gate.
Diagnostics redact credentials, security links/tokens, verification codes, and
mail content. Every push builds and verifies the package. Features and fixes on main automatically
bump the version and publish to npm after verification. See the [release procedure](docs/releasing.md).

## License

Temvia's original generator and template code is [MIT licensed](LICENSE),
including commercial and closed-source use with the required notices retained.
The generated license covers the supplied Temvia code, not ownership of code
you add. Preserve [third-party notices](template/admin/UPSTREAM.md) and the
licenses of dependencies used by your application.
