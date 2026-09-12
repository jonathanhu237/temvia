# Personal account settings — independent verification

Baseline: `7056aba0c1b339ed0257ac02f13323b32ef07e78`. Original spec preserved. Three direct parent review rounds; findings and fix counts in review-1/2/3.md. R3 residual fixture/acceptance defects were corrected directly after two delegated fixes. R5 received a fresh bounded deployment fix, then independent resolution verification (not a fourth review).

## Isolation

Source edits and task Git operations performed locally. Parent alone synchronized to literal dedicated `/home/jonathanhu237/temvia-personal-verify-20260913-r1` on Centaurus using nondeleting rsync. No destination was read from a temporary path variable. Unrelated `.scratch/template-readiness` incident/upgrade files were excluded and preserved.

Tools: mise Node 24.20.0, pnpm 11.24.0, Go 1.27.0. Dedicated PostgreSQL 18.6 container `temvia-personal-pg-20260913-r1`, host port 26483; serial package tests (`-p 1`) avoid shared-fixture package conflicts. Separate generated Compose project `temvia-personal-browser-20260913-r1`, database 26484, API 26485, frontend 26486, Mailpit 26487. Frontend/API/Mailpit ports forwarded locally; local HTTP frontend returned 200. Browser seeding used real setup, SMTP settings, roles, invitation mails and acceptance, creating two users without settings management permission. Private ephemeral passwords/keys/codes are not included here or in committed artifacts.

## Passed checks

- All migrations 1–11 applied to real PostgreSQL.
- `TEST_POSTGRES_DSN=<isolated DSN> mise exec go@1.27.0 -- go test -p 1 ./... -count=1`: all eight packages passed, including real HTTP and PostgreSQL integration tests. No missing-DSN skip substituted for acceptance.
- `go vet ./...`, `go build ./...`: passed.
- `go test -race -p 1 ./internal/auth/adapter/postgres ./internal/auth/adapter/httpapi -run 'PersonalSettings.*Integration' -count=3` with isolated DSN: both packages passed. Coverage includes persisted cooldown/replacement, exhausted attempts, concurrent resend/attempt/consume, competing addresses/invitations, authenticated avatar reads, security lifecycle/session revocation and mail-recipient snapshots.
- Frontend `pnpm check`, `pnpm test` (142/142 across 22 files), production `pnpm build`: passed.
- Frontend `pnpm lint`: zero errors, six warnings (React effect dependencies/state-in-effect and existing TanStack React Compiler incompatibility). Not represented as warning-free.
- Root typecheck/build; `pnpm test`: 24/24 passed.
- `pnpm test:package`: 2/2 passed, actual tarball installation/generation and artifact exclusion/strict inventory; rerun after Compose forwarding change.
- `pnpm test:release`: 10/10 passed (publication logic tested with fixtures; no actual publish).
- `node scripts/first-run-acceptance.mjs <actual create-temvia-0.2.0.tgz>`: passed migration/Compose/setup/login acceptance, rerun on final packed artifact after R5.
- All three enabled Playwright personal-settings scenarios passed twice, including final API recreation with explicit email-change key forwarded. No optional credential/Mailpit skip: profile and theme/language changes; wide/tall crop movement to both source edges with preview/export pixel assertions; avatar removal/refresh; two-browser preference isolation; received six-digit Mailpit code, logout/relogin continuation, email change, new-address login and old-address notification. Trace/video/screenshots disabled for these credential-bearing scenarios.
- Upgrade probe: initialized schema 10 with a legacy account, migrated to 11 and verified account retained with null locale; safe empty-feature downgrade to 10 and re-upgrade passed. Transactional downgrade with an initialized locale correctly refused and retained data.
- Local `git diff --check`: passed.

## Parent test repairs

Initial real tests exposed invalid cooldown timestamps/cleanup order, fixed by Luna. Parent repaired remaining R3 issues: backend integration files absent from expected package inventory; browser name-save assertions racing response completion; Chinese account-language locator mismatch; pointer dragging before crop preview was scrolled into viewport. Assertions remain strict and production constraints were not weakened.

## Evidence locations

Dedicated remote workspace contains `go-tests-final.log`, `personal-race-tests.log`, `admin-tests.log`, `admin-build.log`, `root-tests-final.log`, `package-tests-final.log`, `release-tests-final.log`, `first-run-final.log`, `browser-tests-final.log`, and `downgrade-refusal.log`. These are verification artifacts, not published assets. Throwaway stack/bootstrap helpers remain local scratch files, excluded from the task commit. No push or publication authorized/performed.
