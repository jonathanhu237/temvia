# Independent verification — test reliability

Fixed baseline: a71eb8ce5157be5cbbbfdcfef3929b69a9a7c28e. Original spec unchanged. Three direct parent reviews; final review resolution verified after bounded fixes. Initial implementation self-checks were not counted as actual PostgreSQL/browser evidence.

## Two complete fresh runs

Parent synchronized source one-way with nondeleting rsync to the literal dedicated `/home/jonathanhu237/temvia-reliability-verify-20260913-r1` on Centaurus, excluding Git, dependencies/build output, environment secrets and unrelated scratch files. Tools via mise: Node24.20.0,pnpm11.24.0,Go1.27.0. Packed actual create-temvia tarball then invoked the canonical runner twice without modifying code or artifact between runs.

Each invocation automatically created a distinct mkdtemp root, installed that tarball, generated a new project, built Compose images, initialized a fresh PostgreSQL18.6 volume and migrations, ran mandatory tests, started API/admin/Mailpit, created its administrator and browser state, and tore down its resources. No old database or browser session was reused.

Both `critical-run-9.log` and `critical-run-10.log` report:

- PostgreSQL/HTTP:18 selected top-level tests,36 passing executions (`-race -count=2`,serial package execution).
- Browser:5 selected tests, all passed (first-run setup/login,password recovery/stale sessions,personal profile/preferences/avatar,mail success,mail failure/repair/retry/bulk/delete).
- Skipped:0.
- Success emitted only after teardown completed, including owned read-only Go module-cache cleanup.

Network environment used explicit HTTP_PROXY/HTTPS_PROXY through existing healthy mihomo at loopback7890, NO_PROXY for localhost/127.0.0.1/::1, and GOPROXY=https://goproxy.cn,direct with normal checksum verification retained. Parent verified Playwright and Go upstream reachability through mihomo (HTTP200); did not restart it. Earlier missing proxy environment, not an unavailable core, caused direct CDN failures.

## Negative evidence and supporting checks

- Actual mandatory-mode Go invocation without TEST_POSTGRES_DSN failed immediately with the required-DSN error; not skipped.
- Actual critical CLI invocation without a tarball failed.
- Root40/40 tests passed, including strict report selection, top-level/descendant fail/skip, repeated-count coordination, malformed/missing reports, command failure/timeout/unavailable dependency, safe redaction, owned read-only cleanup/symlink boundaries, bootstrap cookie propagation and hung response handling.
- Actual tarball package tests2/2, release logic10/10, Git fixture tests5/5 passed. No publication occurred.
- Frontend144/144 tests across23 files passed; typecheck and production build passed.
- Lint:0errors,6warnings; warnings were not suppressed or represented as absent.
- Ordinary Go unit suite, vet and build passed. DSN-less ordinary Go results are not the basis for the real database claim; that evidence is the required critical runner above.
- Root typecheck/build and local diff checks passed.

## Failures that were genuinely caught

Early actual runs failed rather than silently passing: insufficient PostgreSQL startup grace (isolated probe took72s), unavailable direct Go/CDN network downloads, read-only module-cache teardown, pnpm implicit reinstall rejecting ignored MSW builds, and missing Cookie on SMTP settings PUT. Fixes preserve real readiness, durability, authenticated writes, dependency script restrictions and failure exit codes. Isolated directories from successful runs were removed. Parent used the ownership-checked cleanup helper to remove only the specifically identified failed-run `/tmp/temvia-first-run-cI80Qw` root left by the earlier cleanup defect.

## Scope and limitations

This establishes a fixed, repeatable critical acceptance gate, not universal correctness. Broader optional two-account/browser lifecycle and system-identity permutations, dedicated process-kill/network-partition chaos testing, and capacity/long-duration load validation remain explicit blind spots in coverage-matrix.md. Existing lease/worker adapter recovery and real database races are exercised; they are not claimed to be a complete production chaos campaign.

Non-publishing quality CI and release verification now invoke the same canonical gate. Workflow definitions were inspected and their underlying commands run on Centaurus; no GitHub workflow was triggered during implementation, so this is not a claim of an observed GitHub Actions run.

Logs in the dedicated remote root: critical-run-9.log,critical-run-10.log,unit-final.log,package-final.log,release-final.log,git-final.log,admin-final.log,lint-final.log,build-final.log,go-unit-final.log,required-db-negative.log,missing-artifact-negative.log. No passwords,tokens,mail bodies or private credentials are copied into these committed notes. Existing unrelated scratch/incident files are preserved; no push/publication authorized for this task.
