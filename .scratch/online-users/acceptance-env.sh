#!/usr/bin/env bash
# Disposable acceptance services only. All source edits stay in the local repo.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
project=temvia-online-acceptance
env_file=/tmp/temvia-online-acceptance.env
compose() {
  docker compose --project-name "$project" --env-file "$env_file" -f "$repo_dir/template/compose.yaml" "$@"
}
if [[ "${1:-up}" == down ]]; then
  compose down --volumes --remove-orphans
  rm -f "$env_file"
  exit
fi
umask 077
cat > "$env_file" <<ENV
APP_ENV=development
APP_PUBLIC_URL=http://127.0.0.1:36173
POSTGRES_DB=online_acceptance
POSTGRES_USER=temvia
POSTGRES_PASSWORD=online-acceptance-only
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_HOST_PORT=26432
POSTGRES_SSLMODE=disable
REDIS_PASSWORD=online-acceptance-only
REDIS_ADDR=redis:6379
REDIS_PORT=27379
ADMIN_PORT=36173
API_PORT=39090
PASSWORD_RESET_TOKEN_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
INVITATION_TOKEN_KEY=ERERERERERERERERERERERERERERERERERERERERERE
EMAIL_SETTINGS_ENCRYPTION_KEY=IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI
SESSION_IDLE_TIMEOUT=${ONLINE_IDLE_TIMEOUT:-30m}
SESSION_ABSOLUTE_TIMEOUT=2h
LOGIN_RATE_LIMIT_GLOBAL_CAPACITY=100
LOGIN_RATE_LIMIT_GLOBAL_REFILL_INTERVAL=100ms
LOGIN_RATE_LIMIT_EMAIL_CAPACITY=50
LOGIN_RATE_LIMIT_EMAIL_REFILL_INTERVAL=100ms
ENV
if [[ "${1:-up}" == idle ]]; then
  compose up -d --no-deps api
else
  compose build api admin migrate
  compose up -d postgres redis
  compose --profile tools run --rm migrate
  compose up -d api admin
fi
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:39090/health >/dev/null && curl --fail --silent http://127.0.0.1:36173/api/setup/status >/dev/null; then
    printf 'Acceptance ready: frontend http://127.0.0.1:36173; API http://127.0.0.1:39090\n'
    exit
  fi
  sleep 1
done
compose logs --tail=25 api
exit 1
