# Your project

An independent Go API and React admin. This source is yours to change or remove.

## First run

Copy the environment inventory and fill both secret values before starting the
containers:

```sh
cp .env.example .env
chmod 600 .env
# edit .env and set POSTGRES_PASSWORD and REDIS_PASSWORD
make build
make migrate-up
make up
```

The API prints a temporary setup link in its logs while initialization is
incomplete. The link contains a one-time fragment token. The frontend is not
included in this backend milestone, so the setup and login endpoints can be
exercised with `curl` (the exact Origin header is required):

```sh
docker compose logs api
curl -i http://127.0.0.1:8080/api/setup/status
curl -i -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  --data '{"token":"TOKEN_FROM_THE_SETUP_LINK","name":"Ada Lovelace","email":"ada@example.com","password":"a long first password"}' \
  http://127.0.0.1:8080/api/setup
curl -i -c cookies.txt -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  --data '{"email":"ada@example.com","password":"a long first password"}' \
  http://127.0.0.1:8080/api/auth/login
curl -i -b cookies.txt http://127.0.0.1:8080/api/auth/me
curl -i -b cookies.txt -c cookies.txt -H 'Origin: http://localhost:5173' \
  -X POST http://127.0.0.1:8080/api/auth/logout
```

Setup creates no session. Login is required before `/api/auth/me` succeeds.
Redis is intentionally ephemeral: restarting it logs out all users, while the
PostgreSQL volume keeps the account and completed setup state. `make down`
does not remove that PostgreSQL volume.

For an application upgrade, stop the API, back up PostgreSQL, run the new
migration explicitly, then start the new API:

```sh
docker compose stop api
make migrate-up
make up
```

## Requirements

- Go 1.27 or later for `api/`.
- Node.js 24 or later and pnpm 11.24.0 for `admin/`.

## API

```sh
cd api
go run ./cmd/server
```

`GET http://127.0.0.1:8080/health` returns `{"status":"ok"}`. Set `HTTP_ADDR`
to override the listener; it defaults to local access only.

When running the API outside Compose, export the values in `.env` into the
process environment and use hosts reachable from the host machine. The Go API
reads process environment variables only; it does not parse `.env` files.

```sh
go test ./...
go vet ./...
go build -o bin/server ./cmd/server
# Benchmark the fixed Argon2id profile on the deployment target before release.
go test -bench='Benchmark(Hasher|Verifier)$' -benchtime=1x ./internal/auth/adapter/password
```

## Admin

In another terminal, from the project directory:

```sh
cd admin
pnpm install
pnpm dev
```

Open the URL printed by Vite (by default http://127.0.0.1:5173). If that port is
in use, Vite automatically tries the next available port.
The official Vite React TypeScript demo includes a working counter and does not
require the API. See [admin/UPSTREAM.md](admin/UPSTREAM.md) for its fixed upstream
version, intentional Temvia customizations, and template-specific license notice.
The first install creates `admin/pnpm-lock.yaml`; keep it in version control.

```sh
pnpm lint
pnpm check
pnpm build
pnpm preview --host 127.0.0.1
```

`pnpm lint` runs Oxlint; `pnpm check` runs TypeScript. After a successful build,
the preview command serves the production output locally. Open its printed URL.
The unchanged [admin/README.md](admin/README.md) describes the upstream tooling.

Each application owns its dependencies and configuration. There is no root
workspace or runtime dependency on Temvia, and no dependencies are installed by
the generator.
