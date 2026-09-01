# Backend Quality Guidelines

## Required Patterns

- Format Go with `gofmt`; use standard-library APIs (`net/http`, `database/sql`) at the accepted boundaries.
- Keep configuration typed, validated before network clients/listeners, and sourced only from process environment.
- Keep all request bodies bounded and strict; reject duplicate and unknown JSON keys.
- Keep credentials out of database/Redis keys and HTTP/log output except the deliberately issued setup fragment in trusted startup logs; reset credentials are held in memory only until completion or typed SMTP delivery.
- Make Redis authorization state finite and fail closed on uncertain results.
- Preserve `GET /health` and keep frontend/API/deployment template inventories synchronized for cross-layer auth changes.
- Keep required-template inventories synchronized across generator preflight and independent tests.

## Forbidden Patterns

- Automatic migrations during API startup.
- JWT, ORM/sqlc, MySQL compatibility, Redis persistence, MFA, or new hardening added without a reviewed task. Password recovery is permitted only through the reviewed transactional-outbox contract.
- Arbitrary Argon2 parameters parsed from stored PHC values.
- Unbounded Argon2 queues or waiting work.
- Raw setup/session credentials or canonical emails in Redis keys.
- Permissive credentialed CORS or Origin suffix matching.
- Tests that skip exact generated-byte comparison for transformed Go files.

## Testing Requirements

Local source gates:

```sh
pnpm check
pnpm build
pnpm test
pnpm test:git
pnpm test:package
cd template/api && go test ./... && go vet ./...
```

For a release-affecting template change, install the actual npm tarball offline and generate with a non-seed module path. On Centaurus, run generated `go test ./...`, `go vet ./...`, `go test -race ./...`, build, Compose/integration tests, and unchanged-admin lint/check/build. Real Git behavior remains local.

Integration evidence must cover migration up/down, exact schema readiness, concurrent setup, complete setup/login/me/logout, API restart, PostgreSQL persistence, Redis restart/outage/recovery, finite keys, rate-limit denial, and no setup reopening.

## Review Checklist

- [ ] Domain/application source dependencies point inward.
- [ ] All new functions and changed error paths have proportionate tests.
- [ ] No secret, `.env`, database data, dependency, or build artifact enters the npm tarball/generated project.
- [ ] Docker image versions, Go dependencies, `.env.example`, README, Compose, and tests agree.
- [ ] API never migrates and Redis is not a startup gate.
- [ ] Recovery requests are enumeration-resistant, completion invalidates `auth_version`, and outbox SMTP delivery is leased/retried outside request transactions.
- [ ] Unexpected dependency behavior fails closed and public errors remain stable.
- [ ] `git diff --check`, `go mod tidy` cleanliness, admin diff, and generated module substitution are verified.

## Wrong vs Correct

Wrong: verify only files under `template/`.

Correct: compare source to packed tarball to generated output, then compile and test the generated result.

Wrong: add a security abstraction because it may be useful later.

Correct: implement only the reviewed threat/behavior contract and open a new task when evidence requires more.
