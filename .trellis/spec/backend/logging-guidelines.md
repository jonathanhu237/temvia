# Backend Logging Guidelines

## Overview

The generated API currently uses Go's standard `log` package for operator-facing process logs. Do not introduce a logging framework until request correlation or deployment ingestion creates a concrete need. Logs are diagnostics, never an API contract.

## What to Log

- Fatal configuration, PostgreSQL startup/schema, setup initialization, and listener failures with enough context to identify the stage.
- The listen address after dependencies and schema checks succeed.
- A clear development warning when `APP_PUBLIC_URL` is HTTP on a non-loopback host.
- The initial setup link only when durable setup remains incomplete and token persistence succeeded.

The setup link is an intentional bootstrap secret delivered through trusted deployment logs. It is the sole credential-value exception; operators must protect log access and allow the 30-minute default expiry to limit exposure. Password-reset links are never logged: they are sent only through the typed SMTP adapter after an outbox claim.

## What Not to Log

- PostgreSQL or Redis passwords, DSNs containing passwords, `.env` contents, cookies, session IDs, setup request bodies, password values/hashes, or full account records.
- Raw canonical email in limiter/Redis diagnostics.
- Reset selectors, verifiers, reset tokens, password-reset request bodies, outbox message bodies, recipient addresses, SMTP credentials, and raw SMTP protocol text.
- Expected invalid credentials, invalid setup token, or unauthenticated requests as noisy security events in the current milestone.
- Dependency details in HTTP responses.

## Levels and Format

Standard `log.Printf` is used for informational/warning lines; `log.Fatalf` is used only when the process cannot safely start or continue. The warning text begins with `WARNING:`. Do not call `Fatal*` from reusable packages or request handlers.

If structured logging is later adopted, preserve these redaction rules and add stable event names rather than changing Problem Details or application errors to suit a log sink. Outbox diagnostics may include only job ID, kind, attempt number, and bounded classes such as `temporary`, `permanent`, `expired`, or `superseded`; job IDs must not be combined with recipient data.

## Common Mistakes and Tests

- Wrong: log a generated connection URL to debug migration startup. Correct: log only the failing stage and keep credentials in `PGPASSWORD`/process environment.
- Wrong: log request JSON after decoding fails. Correct: log a safe request classification, if needed, without body values.
- Capture startup/smoke logs in tests and assert secrets, session credentials, passwords, reset credentials, SMTP credentials, recipient addresses, message bodies, and normal API response bodies are absent. Setup-link extraction tests may inspect the deliberate fragment only in the isolated test log.
