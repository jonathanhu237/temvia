# Validation environment and execution boundaries

Checked: 2026-08-28. These are read-only observations and a proposed execution plan, not completed validation.

## Repository policy

The user requires local source edits and local Git operations, one-way rsync synchronization to Centaurus, execution there, tools managed by mise, and service ports forwarded locally. If Centaurus is unavailable, report it before attempting resource-intensive local alternatives.

This policy also applies to Git commands used by generator acceptance tests. Real Git tests and real CLI generation therefore run locally; remote unit tests substitute the Git operation.

## Observed availability

Centaurus responded successfully to a noninteractive SSH probe and reported Linux.

| Tool | Local | Centaurus |
| --- | --- | --- |
| mise | 2026.8.9 | 2026.7.18 |
| Node | 26.7.0 active | 22.22.3 active |
| pnpm | 11.14.0 active | Shim present; no active version; installed choices included 10.34.5 and 11.14.0 |
| Go | 1.26.5 darwin/arm64 | Shim present; no active version; installed choices included 1.26.1, 1.26.3, and 1.26.5 |
| Git | 2.55.0 local | Not needed for the planned remote validation commands |

These observations do not establish availability of the proposed Node 24.20.0 / pnpm 11.24.0 / Go 1.27.0 pins. Provision/select them with mise in project scope after implementation approval; do not change global tool configuration.

## Validation arrangement

1. Edit source locally. Run lightweight CLI compile/package checks and real Git integration fixtures locally.
2. Generate the representative application using the actual packed CLI locally, not by copying the source template by hand.
3. Use rsync to copy source and the generated application one way to fresh isolated Centaurus locations, excluding .git, node_modules, build output, secrets, and unrelated files.
4. On Centaurus, check/build the CLI and run unit tests with substituted Git operations. Install/check/build the generated admin; format-check/vet/test/build the generated Go API.
5. Run generated services on Centaurus loopback and forward available ports to local loopback. Inspect the API with an HTTP client and the admin in a browser.
6. Save command/results evidence locally. Do not copy remote code edits back; the local repository remains authoritative.

No installs, product builds/tests, service startup, or rsync of product code have happened during planning. SSH connectivity is verified; toolchain readiness and application behavior are not.
