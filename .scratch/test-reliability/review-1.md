# Review 1 — changes requested

Baseline: a71eb8ce5157be5cbbbfdcfef3929b69a9a7c28e. Original spec fixed. Direct parent review; no delegated reviewers.

## Standards

Report parsers must establish actual behavior, not package-level success or a fabricated zero-skip count. Ordinary lightweight checks are not full acceptance evidence. Parent exclusively handles remote validation.

## Blocking findings

### R1 / P1 — critical Go runner rejects every legitimate two-run suite

`runCriticalGoAcceptance` uses `go test -count=2` but calls `summarizeGoTestJSON` with `minimumRuns: suite.tests.length * 2`. The parser interprets minimumRuns PER test. Thus the14-test suite requires28 passes per test while only2 occur. Parent reproduced with two tests each passing twice: current caller threshold4 rejects both. Pass2 as the per-test threshold and add a regression exercising caller/report coordination, not only parser defaults. Also validate the fixed manifest against real discovery.

### R2 / P1 — skipped mandatory Go subtests are silently reported as zero skips

The parser examines skip/fail actions only for exact top-level expected names. Parent reproduction: events skip Required/critical-boundary then pass Required return `{total:1,passed:1,skipped:0,runs:1}`. A critical assertion hidden behind a skipped subtest therefore makes the mandatory gate green. Reject skipped/failing descendants of selected mandatory tests and misleading package/error streams; cover top-level and subtest skip/fail and repeated runs. Report passing executions accurately (top-level runs versus subtests), not by counting every pass event indiscriminately.

### R3 / P1 — fresh browser recovery phase lacks saved SMTP bootstrap

After setup/login, critical runner immediately runs password-recovery browser acceptance. Neither first-run setup test nor runner saves SMTP configuration before it. Saved SMTP is now required; integration fixtures explicitly delete auth_email_settings and must not be relied upon to provision an application. Configure mailpit through the real authenticated settings interface after admin setup and before requesting recovery, using in-memory private fixture credentials. Verify language/recipient/password handoff and auth retry quotas across later personal/mail phases. A fresh complete run must succeed without database-test residue. Test the phase prerequisites/order as well as missing dependencies.

## Validation plan

Parent already reproduced R1/R2 with bounded node invocations and inspected missing bootstrap for R3. Dedicated remote verification root created at /home/jonathanhu237/temvia-reliability-verify-20260913-r1; any actual resource work remains parent-owned. Requirement remains TWO complete runs in fresh automatic environments plus negative-gate evidence.

Fix counters before delegation: R1=0,R2=0,R3=0. Next fresh Luna is attempt1. Do not edit spec or review record to match code. No nested agents, remote operations, heavy local runs, commits or publication.
