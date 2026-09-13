# Review 2 — changes requested

Fixed baseline/spec unchanged. Direct parent verification on dedicated PostgreSQL18.6, migrations1–12, Go1.27.0, `TEST_POSTGRES_DSN=<dedicated DB> go test -p 1 ./... -count=1`.

R1 and R2 remain blocked after their first delegated fix. HTTP package now passes, and new integration coverage exists, but four PostgreSQL tests fail:

1. `TestStoreIntegrationMailTaskWorkerPolicyAndMaterial`, mail_tasks_integration_test.go:330: stale credential was not composed by the worker.
2. `TestStoreIntegrationMailTaskConcurrencyAndRetention`, mail_tasks_integration_test.go:431: SQLSTATE23514 auth_mail_outbox_lease_after_available. Fixture time mutations must satisfy production constraints, not weaken them.
3. `TestPersonalSettingsStoreIntegrationEmailAuthorities`, personal_settings_integration_test.go:78: replacement changed authority creation timestamp (observed replacement time ~2seconds before original expected time after fixture time mutation).
4. `TestStoreIntegrationPasswordRecoveryOutboxAndVersionedSessions`, store_integration_test.go:387: claimed reset job assertion still fails (safe summary kind=password_reset,attempts1,round1,roundAttempts1). Diagnose remaining projection/retention assumptions against new protected material model.

Evidence: dedicated remote go-tests-r2.log (parent owns remote operations). Fix all analogous fixture/expectation defects, not just first failure; keep substantive authority validation and original-content resend assertions. Do not label DSN-less Go test passing as database verification. Parent is separately preparing enabled generated-project browser acceptance.

Next fresh Luna is fix attempt TWO for R1/R2. After two delegated fixes any surviving issue is parent-owned for direct repair. No spec edits. No further nested delegation. No remote or heavy local work. Review rounds used:2/3.
