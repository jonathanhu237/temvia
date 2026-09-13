# Review 3 — passed after direct residual repairs

Fixed baseline: `9cf55a4441c6964e7a34621d6e694053333a81b8`.
Original spec unchanged. Third and final direct parent review of cumulative changes and new files; no reviewer subagents.

## Standards

No remaining blocking documented-standard violations identified. Source/Git stayed local for parent verification; remote work used literal isolated paths and nondeleting sync. Six frontend lint warnings remain, zero errors; not represented as warning-free. Existing compact JSX and optional compatibility interfaces are maintainability concerns, not evidence of failed product behavior.

## Spec

R1/R2 received two delegated fixes. Parent then repaired remaining issues directly:

- Password-recovery store test incorrectly expected an empty queue while a separately retained replacement email was still claimable. It now asserts the other retained task can be claimed while the first task remains unavailable until its retry deadline; credential invalidation assertions remain.
- Race test incorrectly rejected legal serialization of SMTP acknowledgement followed by deletion of the now-terminal task. It now rejects deletion before acknowledgement and accepts safe post-completion deletion.
- Browser test matched both toast and inline submitted-status text. Scoped the assertion to notifications, ran scenarios serially, and disabled trace/screenshots/video at file level.
- Actual browser acceptance exposed stale mail task status: SMTP had accepted a task while the page continued showing Pending. Added bounded three-second list/detail query refresh, stopping interval retries on query errors. Browser assertions now observe actual state changes without manual page reloads.
- Repeated disposable browser runs consumed test-email rate buckets. Reset only those fixture buckets in the explicitly owned browser database before the final full scenario run; production limits were not changed or disabled. A fresh suite stays within the configured budget.

## Resolution evidence

Real PostgreSQL full Go suite passes. Mail-task HTTP/store suites pass with race detector for three repetitions. Enabled Playwright/Mailpit scenarios pass on the regenerated application, covering successful asynchronous delivery and failure → saved SMTP repair → retry → bulk partial result → physical deletion, plus unsaved-settings feedback. Root/package/release tests, frontend tests/typecheck/lint/build and actual final tarball first-run gate all pass. The interrupted SSH connection did not invalidate results: reconnect verified complete final logs.

R1 and R2 resolved; no fourth review round. Verification scope, commands, isolation and limitations are recorded in verification.md. No publication or push performed.
