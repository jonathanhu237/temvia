# Backend Error Handling

## Overview

Each boundary owns a different error vocabulary:

- domain: `ValidationErrors` with stable field/code pairs;
- application: sentinel business/dependency errors independent of HTTP;
- adapters: map technology-specific expected conditions into application errors;
- HTTP: map public errors to RFC 9457 Problem Details and hide internal causes.

Do not return database, Redis, PHC parser, filesystem, or configuration details in HTTP JSON.

## Error Types and Propagation

Application sentinels include setup complete/invalid token, account not found, invalid credentials, unauthenticated, rate limited, dependency unavailable, password hash busy, and duplicate email. Unexpected adapter errors are wrapped as dependency-unavailable while retaining a safe diagnostic string for operator handling.

Expected branching uses `errors.Is`/`errors.As`; do not compare error strings. Domain validation may contain multiple `FieldError` values:

```go
type FieldError struct {
    Field  string
    Code   string
    Params map[string]any
}
```

## API Error Response

Problem responses use `Content-Type: application/problem+json`:

```json
{
  "type": "/problems/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "code": "validation_failed",
  "errors": [{"pointer": "/email", "code": "invalid_email"}]
}
```

`type`, `code`, `errors[].pointer`, `errors[].code`, and `params` are the machine/i18n contract. English `title` and optional `detail` are fallback diagnostics and must not be used as localization keys.

Unknown email and wrong password must produce byte-equivalent public fields. A dependency that prevents an authoritative answer returns `503`; it must not be downgraded to `401`, treated as an empty record, or expose the dependency name.

## Validation and Precedence

- Unsafe-route Origin authorization runs before body or credential work.
- A declared/read body above 64 KiB is `413`.
- Unsupported JSON media type is `415`.
- Invalid JSON shape/syntax is `400`; well-shaped invalid domain fields are `422`.
- While setup is open, malformed token authority is `403`; after durable completion, setup is `409` without validating old authority.
- Wrong known-path methods are `405` with `Allow`; unknown paths are `404`.

## Common Mistakes

- Wrong: a universal `{success,data,message}` envelope. Correct: endpoint-specific success payloads plus centralized Problem Details errors.
- Wrong: translate English server messages in the frontend. Correct: localize stable problem and field codes.
- Wrong: turn every adapter error into `500`. Correct: distinguish invalid authority, domain validation, dependency uncertainty, and true internal defects at the HTTP boundary.

## Tests Required

HTTP table tests assert exact status, content type, public fields, headers, and absence of internal text for every mapping. Tests must cover Origin/body/media precedence, invalid setup token types, unknown versus wrong credentials, limiter denial, dependency outages, and idempotent logout behavior.
