# Your project

An independent Go API and React admin. The admin uses Vite during development
and a pinned Caddy runtime in the production Compose stack. This source is
yours to change or remove.

## First run

Copy the environment inventory and fill all four secret values before
starting the containers:

```sh
cp .env.example .env
chmod 600 .env
# edit .env and set POSTGRES_PASSWORD, REDIS_PASSWORD, PASSWORD_RESET_TOKEN_KEY, INVITATION_TOKEN_KEY, and EMAIL_SETTINGS_ENCRYPTION_KEY
# openssl rand -base64url 32  # use the output for PASSWORD_RESET_TOKEN_KEY
# openssl rand -base64url 32  # generate a separate value for INVITATION_TOKEN_KEY
# openssl rand -base64url 32  # generate a separate value for EMAIL_SETTINGS_ENCRYPTION_KEY
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

Password recovery is handled by the API's PostgreSQL transactional outbox.
The request endpoint only commits reset state and returns; the in-process mail
dispatcher claims jobs with a short lease and sends them over SMTP afterwards.
There is no message broker or separate worker. Delivery is at-least-once: a
process interruption after SMTP accepts a message can produce a duplicate, and
the stable Message-ID plus idempotent reset authority make that safe. Temporary
failures retry with bounded exponential full-jitter backoff; expired jobs and
old sent/canceled/dead rows are cleaned automatically.

`make up` enables the development-only Mailpit profile. Inspect reset and
security-notification messages at [http://127.0.0.1:8025](http://127.0.0.1:8025)
(or the `MAILPIT_UI_PORT` you configure). Mailpit SMTP is private to the
Compose network on `mailpit:1025`; it is never published to the host. A normal
`docker compose up` without `--profile development` does not start Mailpit.
The API does not wait for SMTP readiness, so a provider outage leaves durable
outbox work to retry.

In production, configure SMTP security (`starttls` or `tls`), a real sender
address, and paired credentials when required by the provider in the System
settings page. Keep `EMAIL_SETTINGS_ENCRYPTION_KEY` stable and back it up
separately from PostgreSQL; it protects the stored SMTP password. Keep
`PASSWORD_RESET_TOKEN_KEY` stable across restarts. Deliberate key rotation
invalidates pending reset-mail jobs (already delivered links remain consumable
because PostgreSQL stores their digest); affected users can request a fresh
link. Keep `INVITATION_TOKEN_KEY` stable as well; it is intentionally separate
from the reset key. Invitation links expire after 72 hours by default and may
be configured with `INVITATION_LINK_TTL` up to seven days. Run the current
migrations, including migration 6 which adds immutable actor snapshots to
operation history,
before deploying this API. To roll back, stop the new API, apply one
migration down, then deploy the previous API; passwords already changed by the
feature are not reverted.

For an application upgrade, stop the API, back up PostgreSQL, run the new
migration explicitly, then start the new API:

```sh
docker compose stop api
make migrate-up
make up
```

## Operation history

Administrators with the `operation-logs.read` permission can open Operation
history from the authenticated navigation. The page supports time, actor UUID,
action, result, object type, and object ID filters, cursor pagination, and a
localized detail view. Successful and failed in-scope actions each produce one
best-effort result record; a storage outage can leave a gap, and the home page
shows the recorder state when the current user can read it. History is retained
for 180 days by default. Super Admins or users with `settings.write` can change
the value between 1 and 3650 days in System settings; cleanup runs hourly and
uses a bounded database operation.

`Source IP` records the direct peer address by default. In a reverse-proxy
deployment, set `TRUSTED_PROXY_CIDRS` to the proxy's immediate peer network so
the API can safely use its `X-Forwarded-For` or `X-Real-IP` value. Headers from
untrusted peers are ignored. Never include a public client network in this
setting.

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

The recovery API accepts `POST /api/auth/password-reset/request` with an email
and returns the same `202 {"status":"accepted"}`
for known and unknown accounts. The reset email opens
`/reset-password#token=...`; the browser removes the fragment before React
mounts. Completion accepts the token and a policy-compliant password,
returns `204`, clears any presented session cookie, invalidates all old
sessions, and requires an explicit login with the new password.

After setup, the first administrator is assigned to the immutable `Super
Admin` role. The Users, Invitations, and Roles pages are grouped under the
authenticated Users & Access navigation. The live permission catalog uses
independent `resource.read` and `resource.write` grants for users, roles,
invitations, and settings. Feature combinations (for example, invitation
creation plus `roles.read`) are shown in the role editor and validated by the
API. Super Admins retain full access, while delegated managers may create,
resend, renew, or revoke only invitations whose roles fit their own effective
permissions.
Custom roles must retain at least one permission, users and invitations at
least one role, and a role cannot be deleted while assigned to a user or
invitation. The API refuses any change that would leave zero usable Super
Admin accounts.

Invitations are separate from activated users. A one-time link opens
`/accept-invitation#token=...`; the admin removes the fragment before render,
acceptance creates the account and assignments atomically, and the recipient
must explicitly log in afterwards.

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

### Online users

The **System monitoring → Online users** page lists users with at least one valid
sign-in session, grouped by account. A session remains online while it is valid
even when its browser page is closed or it has had no recent activity. The page
shows the user's name, email, valid session count, and last activity. The list
refreshes every 15 seconds; open authenticated pages check their session every
30 seconds. Browsers may throttle these checks when suspended.

Grant `online-users.read` to view the list and `online-users.write` to force sign
users out. The write permission can force sign out any user, including a Super
Admin or the current user; the read permission remains independent. Force sign
out revokes all
existing sessions using the PostgreSQL account version, including inactive
devices; users may sign in again. Revoked sessions are denied on their next
request, and open pages show a localized expiry message before returning to
login after a session check. Successful and failed force sign-out actions appear
in operation history.

`GET /api/online-users` returns `{ users: [{ id, name, email, lastSeenAt,
sessionCount }] }`. `POST /api/online-users/{id}/kick` requires a same-origin
request and returns 204. Session credentials are never exposed in these APIs.
