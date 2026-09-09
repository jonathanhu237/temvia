# Shutdown configuration and shared budget

Parent spec: `.scratch/graceful-shutdown/spec.md`

Status: resolved
Triage: ready-for-agent
Blocked by: none

## Scope

Add the single `SHUTDOWN_TIMEOUT` duration configuration with the 30s default, strict positive-duration validation, Compose propagation, and the internal exit-reserve calculation. The application and container must derive their shutdown behavior from this one value without introducing a second user-facing timeout setting.

## Acceptance

- [x] The default and override are accepted as Go durations and invalid/non-positive values fail startup.
- [x] The same `SHUTDOWN_TIMEOUT` value is passed to the API and used by Compose `stop_grace_period`.
- [x] The total budget starts at the first termination signal, reserves bounded cancellation/close time, and remains safe for very short positive durations.
- [x] Configuration, generated `.env`, Compose, and documentation remain synchronized.

## Comments

Implemented the single `SHUTDOWN_TIMEOUT` configuration with a 30s default, strict positive duration validation, Compose environment propagation and `stop_grace_period` interpolation, plus a bounded internal reserve calculation (`min(2s, total/10)`). Configuration tests cover default, override, malformed, zero, and negative values; generated documentation describes the shared source.

Verification: `go test -p 1 ./...`, `pnpm check`, `pnpm test:package`, and `docker compose -f template/compose.yaml config --format json` with `SHUTDOWN_TIMEOUT=7s` all passed; the Compose JSON showed `7s` for both the API stop grace period and API environment.
