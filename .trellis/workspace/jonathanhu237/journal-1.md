# Journal - jonathanhu237 (Part 1)

> AI development session journal
> Started: 2026-08-28

---



## Session 1: Initialize Temvia starter

**Date**: 2026-08-28
**Task**: Initialize Temvia starter
**Branch**: `main`

### Summary

Implemented and accepted the initial TypeScript CLI generating independent Go api and React admin applications. Committed the work locally and archived the task; no push or publication.

### Main Changes

- Added bundled templates, safe generation, Go module substitution, and Git initialization or reuse.
- Preserved Vite default port fallback and updated startup guidance; recorded executable contracts and verification evidence.
- Stopped owned temporary preview servers and tunnels after acceptance; left the user project and Bootstrap Guidelines task unchanged during closeout.

### Git Commits

| Hash | Message |
|------|---------|
| `349fa6f249f5ca980eb22453a7ddbff1789c4ba4` | (see git log) |

### Testing

- [OK] CLI TypeScript check/build and all 16 tests passed: 9 CLI, 5 Git, 2 actual-package tests.
- [OK] Actual generated Go/admin applications passed Centaurus checks/builds and forwarded HTTP/browser validation; occupied ports 5173 and 5174 fell back successfully to 5175.

### Status

[OK] **Completed**

### Next Steps

- Discuss admin i18n with English primary and Chinese secondary; CLI localization and locale-selection policy remain undecided.


## Session 2: Official React TS template baseline

**Date**: 2026-08-29
**Task**: Official React TS template baseline
**Branch**: `main`

### Summary

Vendored the verified create-vite 9.2.0 react-ts template with only documented manifest/listener customizations and provenance. Updated nested seed handling, asset completeness, packing exclusions, regression coverage, and frontend/scaffolding specs. Independent review, all 19 local tests, and actual generated-app lint/check/build plus browser/HMR/preview/port-fallback validation on Centaurus passed. Final pre-commit checks confirmed the reviewed artifact and all 30 packed files were unchanged. Committed after explicit user LGTM and archived only this task; Bootstrap Guidelines remains active. No push or publication.

### Git Commits

| Hash | Message |
|------|---------|
| `e361531` | (see git log) |

### Status

[OK] **Completed**


## Session 3: Implement backend setup and login
<!-- trellis-session: v=2 fp=bd69093426a95d02 -->

**Date**: 2026-08-30
**Task**: Implement backend setup and login
**Branch**: `backend-auth-setup`

### Summary

Implemented and verified the generated Go API initial-admin setup and email/password login with PostgreSQL migrations, Redis sessions and rate limits, Argon2id hashing, RFC 9457 errors, Compose infrastructure, generator packaging, backend specs, and Centaurus integration coverage; React admin remained unchanged.

### Git Commits

| Hash | Message |
|------|---------|
| `8b474a0` | feat(template): add backend setup and login |
| `a5f323d` | docs(trellis): clean verification formatting |

### Status

[OK] **Completed**


## Session 4: Admin authentication frontend
<!-- trellis-session: v=2 fp=f20d436c6896e575 -->

**Date**: 2026-08-31
**Task**: Admin authentication frontend
**Branch**: `main`

### Summary

Implemented and verified the generated React setup/login/session UI, i18n, shadcn Sidebar shell, typed HTTP boundary, Caddy delivery, generator contracts, tests, and documentation on main.

### Git Commits

| Hash | Message |
|------|---------|
| `b243273` | feat(template): add admin authentication frontend |

### Status

[OK] **Completed**


## Session 5: Polish generated admin interfaces
<!-- trellis-session: v=2 fp=c3a4bf4b574fc530 -->

**Date**: 2026-09-01
**Task**: Polish generated admin interfaces
**Branch**: `main`

### Summary

Removed temporary runtime branding, simplified setup and login Cards, preserved conditional accessible validation, moved the responsive language menu into the Card header, removed the Sidebar brand header, updated generator/spec contracts, and verified the packed generated app plus real Centaurus authentication and visual flows.

### Git Commits

| Hash | Message |
|------|---------|
| `356ad91` | feat(template): simplify admin authentication UI |

### Status

[OK] **Completed**


## Session 6: Localize client validation errors
<!-- trellis-session: v=2 fp=dad88a1fe8211a62 -->

**Date**: 2026-09-01
**Task**: Localize client validation errors
**Branch**: `main`

### Summary

Mapped client-side authentication validation codes through the shared i18n field-message table, preserved server-error handling and ARIA wiring, added bilingual regression tests, and verified the generated admin in Chromium on Centaurus.

### Git Commits

| Hash | Message |
|------|---------|
| `33b057e` | fix(admin): localize client validation errors |

### Status

[OK] **Completed**


## Session 7: Revise administrator password policy
<!-- trellis-session: v=2 fp=04bd61294e3d8e0b -->

**Date**: 2026-09-01
**Task**: Revise administrator password policy
**Branch**: `main`

### Summary

Separated new-password policy from login verification, enforced the accepted 8-128 ASCII composition rule across Go and React, preserved legacy-password login compatibility, localized distinct errors, and verified packed generated containers and Chromium flows on Centaurus.

### Git Commits

| Hash | Message |
|------|---------|
| `adef2d4` | feat(auth): revise password policy |

### Status

[OK] **Completed**
