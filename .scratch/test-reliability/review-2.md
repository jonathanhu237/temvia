# Review 2 — actual cold-start reliability blocker

Fixed baseline/spec unchanged. Parent reviewed R1/R2/R3 fixes: per-test minimumRuns2, descendant skip/fail rejection and explicit saved SMTP bootstrap are now implemented with additional regressions. Complete-run verification still blocked before those phases.

## R4 / P1 — generated PostgreSQL cold start is declared unhealthy before legitimate initialization completes

Two independent runs of the official critical runner, each creating a new isolated Compose volume, failed at `make migrate-up`: PostgreSQL logs stop at post-bootstrap initialization and Compose reports unhealthy. Existing generated healthcheck has interval2s/retries15 and no startup grace period.

Parent isolated reproduction with a newly created standalone postgres18.6 container on the same host reached readiness after72seconds, then logged normal ready-to-accept-connections. This is a real slow cold-start, not missing credentials or a broken database. Probe container and its anonymous volume were explicitly removed; no other resources touched.

Provide an adequate bounded startup grace/readiness policy for the generated database (or a documented equivalent that preserves real health failure). Keep normal healthchecking meaningful after startup. Do not disable fsync/durability, use dummy health success, add unbounded waits, reuse an existing volume, or simply retry the whole test until green. Ensure initial migration invocation genuinely waits for readiness within the overall acceptance deadline. Add focused regression coverage and document cold-start allowance. Parent will rerun actual cold-start full gate twice.

Evidence: /home/jonathanhu237/temvia-reliability-verify-20260913-r1/critical-run-1.log and critical-run-2.log. Parent observed72sec standalone probe. Remote operations remain parent-owned.

R4 first delegated fix attempt (counter0). R1/R2/R3 have1 fix each and require full positive-run verification. Review rounds2/3; no spec edits or publication. Existing source changes must be preserved.
