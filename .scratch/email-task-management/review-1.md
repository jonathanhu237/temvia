# Review 1 — changes requested

Fixed baseline: `9cf55a4441c6964e7a34621d6e694053333a81b8`.
Fixed spec: `.scratch/email-task-management/spec.md` (unchanged).
Direct parent review; initial coordinator and nested-agent reports are not independent acceptance evidence.

## Standards

No passing-verification claim may count missing-DSN skips as exercised PostgreSQL coverage. Tests must preserve production security invariants and avoid dumping full MailJob structures containing protected credential material. Local source authoritative; parent exclusively owns nondeleting literal-path Centaurus synchronization and heavy tests.

## Spec / blocking findings

### R1 — P1: full real-database suite fails; fixture isolation and changed authority/outbox semantics are not coherent

Parent created a NEW literal workspace `/home/jonathanhu237/temvia-mail-verify-20260913-r1`, NEW PostgreSQL18.6 container/database, applied migrations1–12 successfully, and ran Go1.27.0 `TEST_POSTGRES_DSN=<dedicated DB> go test -p 1 ./... -count=1`. Five tests failed:

- HTTP `TestPersonalSettingsHTTPPostgresIntegration`, personal_settings_integration_test.go:163: verification message not delivered.
- PostgreSQL `TestPersonalSettingsStoreIntegrationEmailAuthorities`, personal_settings_integration_test.go:78: replacement changed authority creation timestamp (got replacement time rather than previous request time expected by fixture).
- `TestStoreIntegrationPasswordRecoveryOutboxAndVersionedSessions`, store_integration_test.go:351: 2 retained reset outbox rows, zero canceled, old assertion expects1canceled.
- `TestStoreIntegrationRBACAndInvitationLifecycle`, store_integration_test.go:644: ClaimMail returns an unrelated email-change-code job left by prior tests rather than invitation.
- `TestUserLifecycleIntegration`, user_lifecycle_integration_test.go:169: expected leased reset mail before deactivation.

Diagnose fixture vs implementation defects explicitly. Mail history no longer cascades away with user/authority deletion, so old cleanup helpers must isolate ALL mail task/attempt state. Seed/reset helpers must fail on errors and clean up on failures. Adapt obsolete cancellation assertions to agreed durable-original-mail semantics, but retain real assertions that expired/consumed/replaced credentials cannot authorize login/security changes. Configure matching material encryption/dispatcher keys in actual HTTP fixtures so messages really deliver. Do not silence tests, remove security assertions, or weaken production checks. Stop printing entire MailJob/encrypted material in failures; use safe ID/kind/status summaries.

### R2 — P1: agreed core acceptance scenarios remain unimplemented

New PostgreSQL integration file (74 lines) tests only enqueue/list/detail/delete; HTTP file (94 lines) and browser file (56 lines, one test) are similarly bounded smoke paths. They do NOT establish the mandatory real behavior in the spec: failure → auto retry budget → final failure → manual retry new round with lifetime count retained; current persisted SMTP configuration; bulk partial conflicts; sending-vs-delete mutual exclusion; lease/round fencing; terminal-time retention reset and cleanup race; stale credentials re-mailed unchanged but still rejected by auth; independent settings/test-task observation permissions; protected material not exposed.

Add meaningful durable tests at the already agreed seams, particularly real HTTP/PostgreSQL concurrency, actual worker+SMTP test adapter delivery and enabled Playwright/Mailpit flows. Use existing bounded test clocks/timestamp fixtures (consistent with CHECK constraints), no long sleeps. Browser must exercise failure/retry/delete/settings permissions, not only successful test mail. Do not claim full 68-story acceptance from one smoke scenario or fake-store tests. Provide explicit bootstrap/environment instructions for parent's NEW isolated generated-project run. No private code/password/key dumps in reports or traces.

## Independent checks already passed / pending

Migrations1–12: passed. Root build, root `pnpm test`, package tests and admin typecheck/tests returned success independently; detailed summaries pending capture. Full Go PostgreSQL suite: FAILED above. Browser, race/concurrency, production build/lint, exact-tarball first-run final acceptance remain unestablished.

Per-issue delegated fix attempts before next spawn: R1=0, R2=0. Next fresh Luna is attempt1 for both. Do not change the fixed spec to fit implementation.
