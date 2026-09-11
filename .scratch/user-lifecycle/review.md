# User lifecycle review

Baseline: 0b40ce10f61ffe7077daa2d4a33f0e89c2ab5a0b
Spec: original user-lifecycle/spec.md, fixed
Status: historical review findings; subsequent direct implementation awaiting user acceptance

后续用户要求继续后，主代理直接补齐功能并执行了新的集成、并发、浏览器与打包测试。见 [verification.md](verification.md)。下列内容保留原审查时状态；未将自测冒充新一轮独立审查。

## Review 1 — Standards

S1: UI lifecycle controls in users-page use hardcoded English, native window.confirm/prompt, and an unstyled native select rather than the existing localized dialog/select and feedback patterns. No success feedback, target protections, or complete query invalidation. This violates confirmed localized, consistent confirmation/feedback requirements and existing UI conventions.

## Review 1 — Spec

F1 (critical): lifecycle store counts available Super Admins without locking a shared scope; delete does not lock target before deciding, and existing role-removal checks still count disabled users. Concurrent mutations can remove all available administrators. Actor authorization is checked outside mutation transactions; lifecycle endpoints have no expected revision. Fix common lock order/actor revalidation/target concurrency for lifecycle and role changes, including correct handling of deleting a disabled Super Admin when one active admin remains.

F2 (critical): only authentication lookup and session deletion have been changed; session creation, principal lookup, reset issuance/completion, and mail races remain unguarded against disabled users. Deleting sessions also loses the trusted association needed for the specified disabled-session feedback. Implement the complete disabled authentication boundary without anonymous enumeration or revival on restore, with concurrency coverage.

F3 (high): identity columns are written but not exposed/read through operation-history APIs or UI. Original-ID filtering and deleted actor/target labels are not implemented; history inserts racing deletion are unaddressed. Invitation creation snapshots are not generally populated/exposed. Implement end-to-end immutable identity retention, deleted labels, invitation validity and email-reuse separation.

F4 (high): lifecycle handlers never record successful operations or ordinary business failures; principal failures use generic users.lifecycle instead of actual action. Missing distinct self/invalid target/stale lifecycle errors and corresponding localization. UUID inputs reach SQL without proper validation. Provide one actual action result record and existing error/feedback conventions.

F5 (high): no new tests or documentation were added; no real PostgreSQL or browser E2E was executed. Existing 126 tests do not cover this feature. Docker is reachable (docker info succeeds); no concrete environmental blocker was given. Implement and execute the agreed seams, migrations and concurrency tests; update template/docs and packaging baselines as required.

Fix attempts before review: none. First fix delegation must address S1/F1/F2/F3/F4/F5; count 1 each.

## Review 2

All S1/F1/F2/F3/F4/F5 remain unresolved after fix attempt 1. Versioned interfaces and request type were added but handlers still invoke unversioned paths, so revision protection is unreachable. UI still uses native confirm/prompt and only partial localization. No new feature tests. Added session JOIN selects unqualified auth_version (present on both users and sessions), and reset outbox INSERT SELECT uses unqualified created_at (present on both joined tables): real PostgreSQL will reject these with ambiguous-column errors. Treat SQL regressions as part of F2/F5. Fix attempt 2 is the last delegated attempt for each finding.

## Direct takeover after two failed fix attempts

No more Luna delegation was used. Parent directly:
- Replaced unsafe lifecycle transactions with a shared roles-before-users mutation scope, locked actor authorization checks, mandatory expected revision, correct active Super Admin counting, and coordination with role removal.
- Fixed invitation nullable creator schema and missing CTE snapshot column.
- Wired application versioned methods and frontend request bodies; replaced lifecycle handlers with validated, revision-required action-specific audited handlers.
- Corrected deletion confirmation to controlled React state (previous DOM traversal prevented deletion), prevented pending dialog closure, and fixed duplicate i18n keys that full TypeScript checking caught.
- Added real PostgreSQL lifecycle regression coverage for stale revisions, global writer authority, self protection, concurrent deactivation of the last two admins, deletion of disabled Super Admins, role removal not counting disabled holders, restore, and disabled actor authorization.
- Added pending security-mail cancellation on deactivation; retained sessions as non-authorizing records rather than destroying the only possible trusted deactivation association.

Actual independent verification:
- Pulled postgres:18.6-trixie and created disposable temvia-lifecycle-direct-pg on localhost:26543. Applied all SQL migrations and schema version 10. Docker was usable; no environment blocker was present.
- Real PostgreSQL adapter suite passed with TEST_POSTGRES_DSN, including the new lifecycle concurrency test. Existing session fixtures were aligned to the now-authoritative account version.
- go test ./... passed; go vet ./... passed before final handler extraction; handler extraction was followed by another passing go test ./....
- Frontend pnpm check, pnpm test (20 files / 126 tests), and pnpm build passed after duplicate i18n keys were fixed.
- git diff --check passed.
- Disposable PostgreSQL container stopped; original preview was not rebuilt, migrated, or reset. No commit created.

## Review 3 — final cumulative review: NOT PASSED

### Standards

S1 remains partially unresolved: status filtering still uses a native select rather than the established component, success feedback and target-specific disabled affordances are incomplete, and old unversioned lifecycle compatibility methods remain unnecessarily alongside the required versioned contract.

### Spec

F1 substantially improved and tested, but the full required HTTP-level race matrix and post-commit response/snapshot races are not yet proven.
F2 remains: trusted disabled-session reason is not propagated through authentication/HTTP/session-monitor UI. Session/reset lock-order and mail-in-flight coverage are incomplete.
F3 remains: stored original identity columns are not consumed by history read/filter APIs or rendered with deleted actor/target labels; concurrent history insertion versus deletion remains unresolved, and invitation snapshots are not fully exposed.
F4 partly fixed: action-specific success/failure audit records and UUID/revision validation now exist. Distinct self-operation errors, snapshot completeness under writer-only authority, and complete lifecycle audit localization remain unfinished.
F5 remains: database adapter testing is now genuinely executed, but lifecycle HTTP integration, browser E2E, frontend feature-specific tests, documentation, migration-down semantics after deleted creators, and generator packaging coverage are incomplete.

Three reviews reached. This is unfinished work, NOT ready for user acceptance or deployment. Keep original spec open and do not describe passing baseline tests as feature completion.
