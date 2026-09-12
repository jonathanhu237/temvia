# Review 1

Baseline: ae41e85cfde580e5bffea74937680590a3d875aa (fixed; cumulative working-tree diff plus untracked implementation files)
Spec: .scratch/template-readiness/spec.md (fixed)
Outcome: needs changes

## Standards

No hard documented-standard violation or actionable smell finding. Preserve the task-related Email configuration management glossary addition that was present before implementation: it is unexpectedly absent from CONTEXT.md now. Restore that existing decision rather than silently dropping it.

## Spec

### R1 [P1] Acceptance inherits deployment environment rather than guaranteeing isolation

scripts/first-run-acceptance.mjs constructs compose.env with all of process.env. Compose shell environment overrides generated .env. A caller exporting POSTGRES_HOST/POSTGRES_DB/POSTGRES_PASSWORD, COMPOSE_FILE, or APP_PUBLIC_URL can redirect migrations to an existing database or use a different Compose definition, contrary to the spec's isolated project/database guarantee. The script is also documented as a locally usable command, not only on a clean CI runner. Sanitize configuration-routing env values or explicitly override the complete generated Compose configuration surface, preserving required tool PATH/proxy support. Cover adversarial inherited configuration without touching real services. Ensure actual-tarball CLI generation and browser configuration cannot be redirected by inherited deployment settings either.

### R2 [P2] New backup example leaves sensitive database dumps Git-trackable and broadly readable

template/README.md and Chinese counterpart now create backups/*.sql under the generated Git project, while template/_gitignore does not exclude backups. SQL dumps contain account and operational data and encrypted secrets; routine git add . can publish them. Default umask may also make dumps readable to other local users. Use protected backup location/permissions and ensure generated backup output is excluded from Git, with bilingual guidance and a regression check. This follows the spec's secret/data protection and safe upgrade requirement, not a request to implement backup infrastructure.

### R3 [P2] Agreed behavior-level verification is incomplete

Spec Testing Decisions explicitly asks for settings-page component testing of the error and successful retry, and real PostgreSQL integration verification with an explicit DSN. Changes only add a problem-message mapping test (not form behavior); verification.md lists go test ./... without TEST_POSTGRES_DSN, and release docs expressly say it is not enabled. Add the focused settings component regression at the existing seam, and perform/document current full Go integration tests against isolated fully migrated PostgreSQL. This does NOT require making every database/browser test a new CI gate. Record exact commands and bounded evidence, not just generic passed claims. Include actual SMTP test-send success with explicitly supplied replacement credentials and unchanged-identity password omission, if not already covered by existing tests.

## Summary

Standards: 0 ranked findings (plus restore pre-existing task glossary change). Spec: 3 findings, worst R1 (P1). Initial implementation complete; fix-attempt counts before delegation: R1=0, R2=0, R3=0; glossary restoration=0. No commit until resolved and verified.
