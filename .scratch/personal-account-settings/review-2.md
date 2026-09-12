# Review 2 — changes requested

Fixed baseline/spec unchanged from review 1. Direct parent review of cumulative implementation plus independent Centaurus validation.

## Resolved implementation findings

R1 now checks persisted cooldown while holding the account/request locks before replacement; R2 now uses aspect-aware shared crop geometry; R4 removes the extra read-permission check while retaining session authentication. R2 browser execution remains pending (not represented as passed).

## R3 remains — fix attempt 1 did not deliver executable passing acceptance coverage

Independent isolated PostgreSQL 18.6, all migrations 1–11 successfully applied; `TEST_POSTGRES_DSN=<dedicated database> mise exec go@1.27.0 -- go test -p 1 ./... -count=1`:

- HTTP integration package passed (5.213s).
- PostgreSQL integration FAILED `TestPersonalSettingsStoreIntegrationEmailAuthorities`, line 71: SQLSTATE 23514, `auth_email_change_time_check`. Tests change `resend_after` to now minus one second but leave fresh `created_at` later than that; shift the full relevant authority clock consistently with production constraints. Same pattern at line 128 needs correction. Do not weaken production constraints or skip coverage.
- Cleanup reports `sql: database is closed`: `defer db.Close()` runs before `t.Cleanup(reset...)`. Correct lifecycle ordering.
- Further scenarios in this test have not executed yet; inspect all test-time mutations for analogous errors.

Independent root `pnpm build && pnpm test` failed two CLI inventory tests: `tests/react-ts-baseline.mjs` missing the new `e2e/personal-account-settings.spec.ts` entry. Update exact expected inventory, not the assertion.

Frontend: `pnpm check`, all 142 Vitest tests, and production build passed independently on Centaurus. Root typecheck also passed. Package/release/browser gates not yet established.

Next fresh Luna is R3 fix attempt 2 (R1/R2/R4 have one delegated fix). If R3 persists after this, parent must fix and verify directly per implement-loop. Local-only implementation restrictions remain unchanged.
