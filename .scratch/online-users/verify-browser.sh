#!/usr/bin/env bash
# Run on Centaurus after preparing the isolated acceptance accounts.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
mode="${1:-normal}"
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:36173
export E2E_ONLINE_USERS=1
export E2E_ONLINE_READONLY_EMAIL=online-reader@example.com
export E2E_ONLINE_READONLY_PASSWORD='ReadOnly1!x'
export E2E_ONLINE_NOREAD_EMAIL=online-no-read@example.com
export E2E_ONLINE_NOREAD_PASSWORD='NoRead1!x'
if [[ "$mode" == idle ]]; then
  ONLINE_IDLE_TIMEOUT=45s bash "$repo_dir/.scratch/online-users/acceptance-env.sh" idle
  trap 'bash "$repo_dir/.scratch/online-users/acceptance-env.sh" idle' EXIT
  export E2E_ONLINE_IDLE_TIMEOUT_MS=45000
  filter=(--grep 'background checks')
else
  bash "$repo_dir/.scratch/online-users/acceptance-env.sh" idle
  filter=(--grep-invert 'background checks')
fi
# Invalidate only these disposable browser fixture accounts' older sessions.
docker exec -i temvia-online-acceptance-postgres-1 psql -v ON_ERROR_STOP=1 -U temvia -d online_acceptance <<'SQL'
UPDATE auth_users SET auth_version = auth_version + 1
WHERE email IN ('online-manager@example.com', 'online-super-admin@example.com');
SQL
cd "$repo_dir/template/admin"
node node_modules/@playwright/test/cli.js test e2e/online-users.spec.ts --project=chromium --workers=1 --reporter=line "${filter[@]}"
