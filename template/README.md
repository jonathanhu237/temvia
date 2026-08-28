# Your project

An independent Go API and React admin. This source is yours to change or remove.

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

```sh
go test ./...
go vet ./...
go build -o bin/server ./cmd/server
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
