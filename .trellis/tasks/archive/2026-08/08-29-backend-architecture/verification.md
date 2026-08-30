# Backend setup/login verification

Date: 2026-08-30

Branch: `backend-auth-setup`
State: uncommitted implementation after independent review

## Scope verified

- Generated-project root deployment files, Go API module, migrations, configuration, PostgreSQL/Redis/password/HTTP adapters, and generator copy/pack transformation.
- Existing React admin source was not modified; it was rebuilt only as a preservation check.
- No frontend authentication, password recovery, JWT, ORM/sqlc, MySQL, API-owned migration, or Redis persistence was added.

## Local source gates

Run from `/Users/jonathanhu237/code/temvia` unless noted:

| Command | Result |
| --- | --- |
| `pnpm check` | pass |
| `pnpm build` | pass |
| `pnpm test` | 12 pass |
| `pnpm test:git` | 5 pass; real Git behavior remains local |
| `pnpm test:package` | 2 pass; actual tgz/offline install/generation |
| `cd template/api && mise exec -- go test ./...` | pass |
| `cd template/api && mise exec -- go vet ./...` | pass |
| `git diff --check` | pass after review fixes |
| `git diff -- template/admin` | empty |
| `python3 .trellis/scripts/task.py validate .trellis/tasks/08-29-backend-architecture` | manifests valid |

The package test asserts exact bytes from template to tgz to generated output, with explicit expected transformations for `api/go.mod` and every `.go` seed import. `.env.example` is present while `.env`/other `.env.*`, dependencies, build output, Git data, and PostgreSQL/Redis data directories are excluded.

## Actual packaged/generated project

An actual `create-temvia-0.0.0.tgz` was installed offline into an isolated consumer and invoked through its npm `bin` mapping. It was repacked and regenerated after the final test fix:

```sh
npm install --offline --ignore-scripts --no-audit --no-fund ../create-temvia-0.0.0.tgz
npm exec --offline --no -- create-temvia /tmp/temvia-generated-final.TH1wMr/generated-latest \
  --module example.com/centaurus/temvia-api
```

Assertions:

- generated `api/go.mod` starts with `module example.com/centaurus/temvia-api`;
- no generated Go file contains `example.com/temvia/api`;
- generation initialized an unstaged local Git repository;
- generator installed no application dependencies and started no services.

The generated output was rsynced one way to Centaurus at `/tmp/temvia-backend-auth.F3B6XI/generated`, excluding `.git`, `.env`, dependencies, and build output.

## Centaurus generated-project gates

Centaurus supplied Go 1.27.0, Node 24.20.0, pnpm 11.24.0, Docker 29.1.3, PostgreSQL 18.6, and Redis 8.10.1.

Generated Go API:

```sh
GOPROXY=https://goproxy.cn,direct mise exec go@1.27.0 -- go test ./...
GOPROXY=https://goproxy.cn,direct mise exec go@1.27.0 -- go vet ./...
GOPROXY=https://goproxy.cn,direct mise exec go@1.27.0 -- go test -race ./...
```

All packages passed. Real adapters also passed under the race detector with `TEST_POSTGRES_DSN`, `TEST_REDIS_ADDR`, and `TEST_REDIS_PASSWORD` pointed at isolated task containers. PostgreSQL assertions included token lifecycle, concurrent one-winner completion, UUID version 7, and rejection of dirty, behind, and ahead migration states. Redis assertions included session creation/touch, idle and absolute expiry, delete/touch non-resurrection, concurrent limiter atomicity, refill, hashed keys, and positive finite TTL.

The deployment-target Argon2id benchmark used one iteration of each fixed-profile operation:

```text
BenchmarkHasher-24       37.65 ms/op   67,117,112 B/op
BenchmarkVerifier-24     44.98 ms/op   67,116,680 B/op
```

Both are below the accepted one-second operational threshold on the validation host. Operators must benchmark their actual deployment before raising `PASSWORD_HASH_MAX_CONCURRENCY`.

Generated unchanged admin:

```sh
mise exec node@24.20.0 pnpm@11.24.0 -- pnpm install --no-frozen-lockfile
mise exec node@24.20.0 pnpm@11.24.0 -- pnpm lint
mise exec node@24.20.0 pnpm@11.24.0 -- pnpm check
mise exec node@24.20.0 pnpm@11.24.0 -- pnpm build
```

All passed. The first install created its expected generated-project lockfile; the bundled template admin remains unchanged and lockfile-free by the existing template contract.

## Container and migration verification

An isolated Compose project `temvia_backend_auth_f3b6xi` used loopback host ports 38080 (API), 25432 (PostgreSQL), and 16379 (Redis), with task-only test passwords. PostgreSQL used the named task volume; Redis had no data volume and no AOF/RDB.

Observed sequence:

1. API before migration exited nonzero after a read-only schema check reported missing migration state.
2. The separate `migrate` image applied `1/u auth`; the API then started.
3. `migrate down 1` removed both auth tables on the disposable database.
4. A subsequent `migrate up` recreated `auth_users|auth_setup`; API health returned `{"status":"ok"}`.
5. API image and migration image built successfully; the API runtime used a non-root Alpine user.
6. Compose interpolation propagated custom `POSTGRES_HOST`, `POSTGRES_PORT`, and `REDIS_ADDR` values into API/migration environments.

Migration credentials were supplied through `PG*` environment variables. Normal Compose/Make shutdown paths do not include `-v`.

## HTTP and persistence flow

Real `curl` requests with the configured Origin verified:

- existing `/health` response;
- setup status `required`;
- invalid setup token `403` Problem Details;
- valid setup `201`, then status `complete`;
- setup-token replay `409 setup-complete`;
- byte-identical public `401 invalid-credentials` bodies for wrong known password and unknown email;
- valid login `200` plus opaque session cookie and UUIDv7 public user;
- `/api/auth/me` `200`;
- API-only restart preserved the session and did not log a second setup link;
- logout `204`, followed by `/me` `401`;
- five denied login attempts returned `401`, and the next returned `429` under the configured email bucket;
- stopping Redis made auth return `503` while setup status remained available and the API process stayed running;
- restarting Redis invalidated old sessions and allowed fresh login after recovery;
- removing/recreating the PostgreSQL container with the same volume preserved completed setup and account login;
- PostgreSQL absence made database-backed routes return `503` without killing the already-running API, and recovery restored them.
- after independent fixes and an API-image rebuild, duplicate `Origin` returned `403`, duplicate `Content-Type` returned `415`, and a fresh setup/login/me flow returned `201/200/200`.

Redis restart therefore removes authority but cannot grant access or reopen PostgreSQL setup state.

## Environment constraints

Centaurus could not reach `proxy.golang.org` or Docker Hub directly. Validation used `GOPROXY=https://goproxy.cn,direct` and pulled exact declared image tags through `dockerproxy.net`, then tagged them with the product-declared names. Product defaults remain the official Go proxy and official image names; no environment-specific mirror was hard-coded.

## Residual product boundaries

- The current milestone has no React setup/login page, password recovery, mailbox verification, MFA, active-session UI, or logout-all.
- Redis is deliberately ephemeral and may evict session/limiter state under memory pressure; loss logs users out and may relax only historical rate-limit state, never PostgreSQL setup state.
- Production must expose `APP_PUBLIC_URL` over HTTPS, normally through a TLS reverse proxy; the Go container does not terminate TLS itself.
- Destructive migration rollback is verified only on the disposable test database and is not an automatic production recovery strategy.
- Compose always defines and starts its local PostgreSQL/Redis services even when client addresses are overridden; external-service-only topology is outside this single-host milestone.

## Independent review

The Trellis check agent reviewed the task artifacts, specs, changed code, generated output, and checks. Its mechanical fixes covered Compose environment drift, commented `.env.example` inventory, canonical Base64URL validation, duplicate security-relevant headers, empty query/fragment Origin forms, and Argon2 Hash/Verify benchmark entry points. Main review then added and ran the missing schema mismatch, Redis absolute-expiry/delete-race/concurrent-limiter tests and repeated package, race, container build, and real HTTP checks.
