# Remove Redis and verify the generated application

Parent spec: `.scratch/remove-redis/spec.md`

Status: resolved
Triage: ready-for-agent
Blocked by: 01, 02

## Scope

After the PostgreSQL session/online-user and limiter paths are resolved, remove Redis completely from the generated application and its verification surface. Delete the Redis service and health dependency, Redis environment/configuration requirements, client dependency, adapter, generator/package inclusion, and active deployment/documentation/test references. Ensure a fresh generated project needs PostgreSQL and the existing required application components only, and that its dependency graph and core checks remain valid.

Preserve unrelated PostgreSQL outbox, task lease/retry, application lifecycle, UI, and domain behavior. Do not add migration support, dual backends, caching, new limits, multi-instance behavior, or graceful-shutdown changes.

## Acceptance

- [x] This ticket remains blocked until tickets 01 and 02 are resolved and their verification is recorded.
- [x] Generated projects contain no Redis service, health dependency, address/password/memory configuration, client dependency, adapter, or active Redis startup requirement.
- [x] Generator file manifests, package/dependency metadata, Compose topology, environment examples, and current run documentation are synchronized.
- [x] Existing history/change-log references are changed only when required by the active generated-project contract.
- [x] Fresh generation is complete, Go dependencies resolve, PostgreSQL-only core flow is usable, and no generated file references Redis.
- [x] Existing generator, package, template, and frontend baseline tests pass without broadening scope.
- [x] Repository-wide searches and generated-project checks confirm Redis is removed from active code/configuration/deployment paths.

## Verification notes

Record exact generation, dependency, test, and search commands plus any environment limitation in the comments when resolving.

## Comments

Resolved after deleting the Redis adapter and client dependency, moving all runtime state wiring to PostgreSQL, removing Redis configuration and Compose topology, updating migrations/generator inventories/tests/docs, and retaining only the historical changelog mention permitted by the parent spec.

Verification:

- `pnpm check`: passed.
- `pnpm test`: 12/12 passed.
- `pnpm test:package`: 2/2 passed, including tarball generation and fresh-project inventory checks.
- `POSTGRES_PASSWORD=x PASSWORD_RESET_TOKEN_KEY=x INVITATION_TOKEN_KEY=x EMAIL_SETTINGS_ENCRYPTION_KEY=x docker compose -f template/compose.yaml config --quiet`: passed.
- `out=$(mktemp -d /tmp/temvia-generated-XXXXXX); node dist/cli.js "$out/app" --module example.com/generated/api; (cd "$out/app/api" && go test ./... -count=1); POSTGRES_PASSWORD=x PASSWORD_RESET_TOKEN_KEY=x INVITATION_TOKEN_KEY=x EMAIL_SETTINGS_ENCRYPTION_KEY=x docker compose -f "$out/app/compose.yaml" config --services`: generated successfully; API tests passed; services were exactly `postgres`, `api`, and `admin`; active `Redis`/`REDIS_` search returned no matches.
- `git grep`/`rg` active-code/configuration/deployment search returned no Redis references (historical `CHANGELOG.md` and unrelated `redistribute` prose excluded).

No unresolved ticket-specific limitation. Full browser deployment remains environment-dependent and was not claimed here.

Continuation verification (fresh implementation invocation, 2026-09-09):

- `pnpm check && pnpm test && pnpm test:package` passed (`tsc`, 12 CLI tests, and 2 package tests).
- Fresh generation with `node dist/cli.js "$out/app" --module example.com/generated/api`, followed by `(cd "$out/app/api" && go test ./... -count=1)`, passed; generated Compose services were exactly `postgres`, `api`, and `admin`.
- `POSTGRES_PASSWORD=test-password PASSWORD_RESET_TOKEN_KEY=test-reset-key INVITATION_TOKEN_KEY=test-invitation-key EMAIL_SETTINGS_ENCRYPTION_KEY=test-email-key docker compose -f "$out/app/compose.yaml" config --services` passed. A repository active-path search for `\bredis\b|REDIS_` returned no matches; unrelated `redistribute` prose was excluded by the word boundary.
