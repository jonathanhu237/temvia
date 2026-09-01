#!/usr/bin/env bash

set -euo pipefail

: "${API_BASE:?API_BASE is required}"
: "${APP_ORIGIN:?APP_ORIGIN is required}"
: "${MAILPIT_BASE:?MAILPIT_BASE is required}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL is required}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${INVITEE_EMAIL:?INVITEE_EMAIL is required}"
: "${INVITEE_PASSWORD:?INVITEE_PASSWORD is required}"

smoke_dir="$(mktemp -d)"
trap 'rm -rf "${smoke_dir}"' EXIT

admin_cookies="${smoke_dir}/admin.cookies"
invitee_cookies="${smoke_dir}/invitee.cookies"
response_file="${smoke_dir}/response.json"

api_call() {
  local expected_status="$1"
  local method="$2"
  local path="$3"
  local cookie_jar="$4"
  local body="${5:-}"
  local status
  local -a curl_args=(
    --silent --show-error
    --output "${response_file}"
    --write-out '%{http_code}'
    --request "${method}"
    --cookie "${cookie_jar}"
    --cookie-jar "${cookie_jar}"
    --header "Origin: ${APP_ORIGIN}"
  )

  if [[ -n "${body}" ]]; then
    curl_args+=(--header 'Content-Type: application/json' --data "${body}")
  fi

  status="$(curl "${curl_args[@]}" "${API_BASE}${path}")"
  if [[ "${status}" != "${expected_status}" ]]; then
    printf 'Expected %s for %s %s, got %s\n' "${expected_status}" "${method}" "${path}" "${status}" >&2
    sed -n '1,80p' "${response_file}" >&2
    return 1
  fi
}

login() {
  local email="$1"
  local password="$2"
  local cookie_jar="$3"
  local payload
  payload="$(jq -cn --arg email "${email}" --arg password "${password}" '{email: $email, password: $password}')"
  api_call 200 POST /api/auth/login "${cookie_jar}" "${payload}"
}

login "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" "${admin_cookies}"
admin_id="$(jq -er '.user.id' "${response_file}")"

role_name="RBAC Auditor $(date +%s)"
role_payload="$(jq -cn --arg name "${role_name}" '{name: $name, description: "Centaurus RBAC acceptance role", permissions: ["users.read", "roles.read"]}')"
api_call 201 POST /api/roles "${admin_cookies}" "${role_payload}"
auditor_role_id="$(jq -er '.role.id' "${response_file}")"
auditor_revision="$(jq -er '.role.revision' "${response_file}")"

invite_payload="$(jq -cn --arg email "${INVITEE_EMAIL}" --arg role "${auditor_role_id}" '{name: "Invited Auditor", email: $email, locale: "en", roleIds: [$role]}')"
api_call 201 POST /api/user-invitations "${admin_cookies}" "${invite_payload}"

invitation_token=''
for _ in $(seq 1 30); do
  message_ids="$(curl --silent --show-error "${MAILPIT_BASE}/api/v1/messages?limit=200" | jq -r '.messages[]?.ID // empty')"
  while IFS= read -r message_id; do
    [[ -n "${message_id}" ]] || continue
    message="$(curl --silent --show-error "${MAILPIT_BASE}/api/v1/message/${message_id}")"
    if jq -e --arg email "${INVITEE_EMAIL}" 'tostring | contains($email)' >/dev/null <<<"${message}" &&
       jq -e 'tostring | contains("accept-invitation")' >/dev/null <<<"${message}"; then
      invitation_token="$(grep -Eo 'v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}' <<<"${message}" | head -n 1 || true)"
      [[ -n "${invitation_token}" ]] && break
    fi
  done <<<"${message_ids}"
  [[ -n "${invitation_token}" ]] && break
  sleep 1
done

if [[ -z "${invitation_token}" ]]; then
  printf 'Invitation token was not delivered to Mailpit\n' >&2
  exit 1
fi

accept_payload="$(jq -cn --arg token "${invitation_token}" --arg password "${INVITEE_PASSWORD}" '{token: $token, password: $password, locale: "en"}')"
api_call 204 POST /api/auth/invitations/accept "${invitee_cookies}" "${accept_payload}"

login "${INVITEE_EMAIL}" "${INVITEE_PASSWORD}" "${invitee_cookies}"
invitee_id="$(jq -er '.user.id' "${response_file}")"
api_call 200 GET /api/users "${invitee_cookies}"
api_call 200 GET /api/roles "${invitee_cookies}"
api_call 403 POST /api/roles "${invitee_cookies}" "${role_payload}"

replace_role_payload="$(jq -cn --arg name "${role_name}" --argjson revision "${auditor_revision}" '{name: $name, description: "Users-only acceptance role", permissions: ["users.read"], revision: $revision}')"
api_call 200 PUT "/api/roles/${auditor_role_id}" "${admin_cookies}" "${replace_role_payload}"

api_call 401 GET /api/users "${invitee_cookies}"
login "${INVITEE_EMAIL}" "${INVITEE_PASSWORD}" "${invitee_cookies}"
api_call 200 GET /api/users "${invitee_cookies}"
api_call 403 GET /api/roles "${invitee_cookies}"

api_call 409 DELETE "/api/roles/${auditor_role_id}" "${admin_cookies}"

api_call 200 GET /api/users "${admin_cookies}"
admin_auth_version="$(jq -er --arg id "${admin_id}" '.users[] | select(.id == $id) | .authVersion' "${response_file}")"
remove_last_super_payload="$(jq -cn --arg role "${auditor_role_id}" --argjson version "${admin_auth_version}" '{roleIds: [$role], authVersion: $version}')"
api_call 409 PUT "/api/users/${admin_id}/roles" "${admin_cookies}" "${remove_last_super_payload}"

api_call 200 GET /api/roles "${admin_cookies}"
super_role_id="$(jq -er '.roles[] | select(.system == "super_admin") | .id' "${response_file}")"
api_call 200 GET /api/users "${admin_cookies}"
invitee_auth_version="$(jq -er --arg id "${invitee_id}" '.users[] | select(.id == $id) | .authVersion' "${response_file}")"
grant_super_payload="$(jq -cn --arg auditor "${auditor_role_id}" --arg super "${super_role_id}" --argjson version "${invitee_auth_version}" '{roleIds: [$auditor, $super], authVersion: $version}')"
api_call 200 PUT "/api/users/${invitee_id}/roles" "${admin_cookies}" "${grant_super_payload}"

api_call 200 GET /api/users "${admin_cookies}"
admin_auth_version="$(jq -er --arg id "${admin_id}" '.users[] | select(.id == $id) | .authVersion' "${response_file}")"
transfer_payload="$(jq -cn --arg role "${auditor_role_id}" --argjson version "${admin_auth_version}" '{roleIds: [$role], authVersion: $version}')"
api_call 200 PUT "/api/users/${admin_id}/roles" "${admin_cookies}" "${transfer_payload}"

login "${INVITEE_EMAIL}" "${INVITEE_PASSWORD}" "${invitee_cookies}"
jq -e '.superAdmin == true' "${response_file}" >/dev/null

printf 'RBAC real-stack acceptance passed: invitation, permission enforcement, session invalidation, role deletion conflict, last-super protection, and super-admin transfer.\n'
