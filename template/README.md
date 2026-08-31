# Your project

An independent Go API and React admin. The admin uses Vite during development
and a pinned Caddy runtime in the production Compose stack. This source is
yours to change or remove.

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
incomplete. Open that link in the browser-visible admin origin. The token is
kept in the URL fragment only until the admin removes it before rendering; it
is sent only in the setup request body. Setup creates no session, so sign in
after the administrator form succeeds.

```sh
docker compose logs api
```

Open `http://localhost:5173` after the first setup, or use the URL printed by
`pnpm dev` when developing the admin separately. The browser always calls the
relative `/api` path through Vite or Caddy, so `APP_PUBLIC_URL` must match the
origin in the address bar exactly.

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
pnpm install --ignore-scripts
pnpm dev
```

Open the URL printed by Vite (by default http://127.0.0.1:5173). If that port is
in use, Vite automatically tries the next available port. The first install
creates `admin/pnpm-lock.yaml`; keep it in version control.

The API's `APP_PUBLIC_URL` must equal that exact printed origin, including the
selected port. If Vite falls back to another port, update `APP_PUBLIC_URL` in
the root `.env`, restart the API, and use the new setup link from its log. The
Vite proxy reads `API_PORT` from the same root `.env`.

```sh
pnpm lint
pnpm check
pnpm build
pnpm preview --host 127.0.0.1
```

`pnpm lint` runs Oxlint; `pnpm check` runs TypeScript; `pnpm test` runs unit and
component tests. The preview command only inspects a local build. Production
serving is provided by the Caddy image in `make up`, with `/api` proxied to the
private API and navigation paths falling back to `index.html`.

Each application owns its dependencies and configuration. There is no root
workspace or runtime dependency on Temvia, and no dependencies are installed by
the generator. The generic Compose file does not assume public DNS or TLS;
configure direct Caddy TLS or an external ingress and keep `APP_PUBLIC_URL`
equal to the public HTTPS origin. Nginx can replace Caddy if it preserves the
same exact API proxy and SPA fallback behavior.
