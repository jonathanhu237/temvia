# Online users implementation review

Baseline: `a1e7af26102e9b3e3d1c3b0d618fd4b2542d458d` to the complete working tree, including new files.
Spec: `.scratch/online-users/spec.md`.
Standards: `AGENTS.md`, `docs/agents/domain.md`, `CONTEXT.md`, and the code-review smell baseline.
Workflow: implement-loop; parent reviews directly, same Luna implementer handles fixes; no commits.

## Review 1

Standards: no findings.

Spec: three findings returned for fixes.

1. **P2 — Delivery inventory is incomplete.** `tests/react-ts-baseline.mjs` omits the browser acceptance file and the HTTP integration file. Both real package tests failed on Centaurus because the packed template contains files absent from the expected inventory. This violates the required generator/template delivery checks.
2. **P2 — Integration fixture cleanup uses a canceled context.** In `online_integration_test.go`, deferred context cancellation runs before `t.Cleanup`. Database/session deletion then fails silently, retaining test fixtures. Give cleanup an independent bounded context and remove the fixture's operation logs.
3. **P2 — Concurrent old-session creation lacks required verification.** Sequential kick/relogin and fake version mismatch tests do not cover a login that captured the old version before revocation and writes its session afterward. Add a deterministic blocked-login integration case using real PostgreSQL/Redis and verify old credentials cannot access protected endpoints or reappear online.

Additional verification: the first browser idle run used 12 seconds, shorter than the 30-second session poll. Parent is rerunning with 45 seconds and assertions that successful background checks/list refreshes occurred before expiry.

## Review 2

### Standards

No findings. The fixes remain within the existing test and template organization; source changes and Git operations stayed local.

### Spec

No remaining findings. The inventory now contains both acceptance files, and both real npm package tests pass. Cleanup uses an independent bounded context, checks errors and verifies removal. The deterministic concurrent-login test passes against real PostgreSQL/Redis and proves a late old-version session cannot regain access or appear online; fresh login succeeds.

The parent also verified all four real Chromium flows on Centaurus, including a 45-second idle run with successful background requests before expiry. All 117 frontend tests, full Go unit packages, three adapter packages with real integration dependencies, and 19 generator/Git/package tests pass.

Final findings: Standards 0; Spec 0. Implementation loop passed after two reviews and one fix round. No commit created.
