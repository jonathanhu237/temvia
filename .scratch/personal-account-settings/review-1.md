# Review 1 — changes requested

Baseline: `7056aba0c1b339ed0257ac02f13323b32ef07e78`
Spec: `.scratch/personal-account-settings/spec.md` (unchanged)
Direct parent review; implementation-reported checks are not independent acceptance evidence.

## Spec findings

- **R1 / P1: request endpoint bypasses the per-account 60-second send interval.** `postgres/personal_settings.go:174-245` locks the existing request but reads only its revision, deletes it, and inserts a fresh request/outbox task without checking `resend_after`. Repeated POST request calls (including changed target addresses) can issue multiple codes within 60 seconds; actor/recipient token buckets are not the fixed cooldown. Enforce cooldown atomically across request/replacement/resend, including exhausted requests, without making an already-created request depend on auth_version. Add real PostgreSQL sequential and concurrent regression coverage.
- **R2 / P2: avatar crop cannot reach the full non-square image.** `personal-account-settings-page.tsx` renders an already object-cover-clipped square, then transforms it, and clamps both axes exclusively by zoom. At zoom 1 pan is always zero even for wide/tall images. At larger zoom the hidden source outside the initial object-cover square remains inaccessible. Use source dimensions and a shared preview/export transform, with aspect-aware pan bounds. Verify wide/tall images can reach both edges and preview matches exported crop; preserve cancel/save semantics.
- **R3 / P1: required behavioral acceptance coverage is missing.** No new PostgreSQL personal-settings integration tests or Playwright personal-settings scenarios were delivered. Fake-store/application/component tests cannot establish transaction locking, migration/outbox constraints, real session revocation, locale initialization races, or browser crop behavior. Add durable focused integration and browser tests matching spec testing section (lines 173–190), including email lifecycle independence, concurrent attempt/resend/consume/uniqueness/invitation races, old-recipient mail, avatar authenticated conditional requests and preference isolation. Use existing real database and Mailpit patterns, controllable database timestamps rather than 10-minute waits, and avoid secrets in logs/traces. Parent will execute heavy checks remotely. Generated-project smoke and exact-tarball gate remain required.
- **R4 / P2: avatar read adds authorization beyond agreed scope.** `httpapi/personal_settings.go:personalAvatarRead` requires users-read or online-users-read for a different user's avatar. Spec line 117 explicitly chooses authenticated reads rather than a new per-user avatar authorization system. Keep valid-session verification for all reads and existing list permissions; remove this additional avatar permission check and cover authenticated non-admin reads, anonymous/revoked denial.

## Standards / validation

Keep source/Git local. Remote operations exclusively parent-owned; no deletion sync. Do not weaken existing tests, contracts, migration readiness, or release gates to get green checks. No final commit until independent validation and review succeed.

Fix attempt counts before delegation: R1=0, R2=0, R3=0, R4=0. Next fresh Luna invocation is fix attempt 1 for each.
