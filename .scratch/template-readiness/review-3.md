# Review 3 — final cumulative review

Baseline: ae41e85cfde580e5bffea74937680590a3d875aa (unchanged)
Spec: .scratch/template-readiness/spec.md (unchanged)
Scope: cumulative tracked working-tree diff plus new acceptance runner, first-run browser case and acceptance/upgrade-guide tests.
Outcome: passed for the agreed task scope

## Standards

0 actionable findings. Existing public services/CLI/browser seams are retained, the domain glossary's email configuration management boundary is restored, source modifications and Git operations remain local, and no unrelated UI or business feature was introduced. The operational rsync incident is separately documented and is not erased by this code-review result.

## Spec

0 remaining actionable findings.

- Migration image includes all SQL files; generated preflight requires current lifecycle migrations. Actual v10 initialization and a deliberately missing-v10 negative tarball both exercised the gate.
- Saved SMTP credentials are bound to unchanged trimmed host, port, and case-preserving username. Save and test share resolution; replacement/clear/no-auth and stale-revision behavior are covered. Encrypted storage and existing transport policy remain intact. Settings-page regression verifies actionable feedback and successful retry.
- Git absence yields successful generation and guidance; other Git errors and repository/data protections remain tested.
- Prepublish verification uses the tested tarball, independent generation, real image builds/migrations and mandatory browser setup/login/reload. Inherited deployment routing is stripped. Existing checksum/upload/publish chain retains the same artifact. R1 resolved.
- Upgrade docs now stop on every failed step, create protected persistent backups outside the project and rebuild all images. Both language examples have executable success/failure regressions; real database sentinel/backup and all-three-image rebuild check passed. R2 resolved directly after two delegated attempts.
- Full current Go suite executed against an isolated actual-image-migrated PostgreSQL with explicit DSN. Settings component and SMTP send tests added and passing. R3 resolved; evidence in verification.md.
- No login-timing change, SMTP encryption-policy change, warning restoration, automatic upgrade, push or publication.

## Validation summary

Generator/acceptance/guide cases: 24; Git: 5; release: 10; package: 2 — all pass. Admin: 136 tests, lint/typecheck/build pass (one pre-existing lint warning). All 8 Go packages pass with real PostgreSQL, vet/build pass. Exact-tarball positive/negative gates and real upgrade verification pass. Local forwarded API/admin checks pass. Scoped fixture resources and port forwards cleaned; no --delete synchronization used by parent.

Standards findings: 0. Spec findings: 0. Three reviews completed; ready for task-only Conventional Commit and user acceptance. GitHub-hosted CI itself has not been triggered; that requires a separately authorized push.
