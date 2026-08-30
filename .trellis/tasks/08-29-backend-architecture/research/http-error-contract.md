# HTTP error response contract

## Question

Should the first backend milestone invent a project-specific JSON error envelope or use the standardized Problem Details format?

## Primary source

- RFC 9457, *Problem Details for HTTP APIs*: https://www.rfc-editor.org/rfc/rfc9457.html
  - Standards-track successor to RFC 7807.
  - Defines `application/problem+json` and the reusable `type`, `title`, `status`, `detail`, and `instance` members.
  - Allows extension members, including structured validation errors.
  - Treats `type` as the machine-readable identifier and warns clients not to parse the human-readable `detail` field.
  - Warns against exposing implementation details in problem responses.

## Adoption evidence and limits

Problem Details is a current IETF standards-track error format, but it is not a universal industry response shape and no reliable evidence establishes that a majority of HTTP APIs use it.

- ASP.NET Core documents Problem Details as commonly used and provides `IProblemDetailsService` / `AddProblemDetails`: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling-api
- Spring Framework directly supports RFC 9457 through `ProblemDetail` and `ErrorResponse`: https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html
- Zalando's current public REST guidelines require Problem JSON for endpoint 4xx and 5xx responses: https://opensource.zalando.com/restful-api-guidelines/
- Established public APIs such as GitHub and Stripe retain project-specific legacy error documents rather than RFC 9457: https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api and https://docs.stripe.com/api/errors

The accurate characterization is therefore: Problem Details is a mature, increasingly framework-supported standard and a defensible default for a new HTTP API, while custom error formats remain common. It should be selected for its contract quality and fit, not because everyone uses it.

## Options

### Project-specific envelope

Example: `{ "error": { "code": "unauthenticated", "message": "..." } }`.

This is initially familiar and compact, but Temvia would own and document every structural convention, client rule, and later extension. It would duplicate a standardized error model.

### RFC 9457 Problem Details

Return errors as `application/problem+json`, use a stable relative problem `type`, standard HTTP status semantics, a stable `title`, and only safe corrective `detail` text where useful. Add an `errors` extension only for field-validation failures. Successful resource representations remain ordinary JSON rather than being wrapped in a universal `data` envelope.

This adds a few standard fields but requires no Go dependency: the HTTP adapter can encode a small owned struct with `encoding/json`. It provides a stable client contract and aligns with the user's preference for durable standard interfaces.

## Recommendation

Use a deliberately small RFC 9457 subset for all non-2xx JSON responses and ordinary JSON for successful responses. Use the problem `type`, not localized prose, for future frontend branching. Do not expose stack traces, SQL/Redis errors, credential validity details, or request bodies. This is a proposal until the user accepts it.

## Internationalization considerations

RFC 9457 permits human-readable `title` and `detail` strings to be localized through HTTP `Accept-Language`; localized responses should identify the selected representation with `Content-Language`. It also defines `type` as the primary machine-readable identifier and explicitly warns clients not to parse `detail` for machine behavior.

For Temvia's separate React frontend, the recommended first milestone is frontend-owned user-facing localization:

- Keep `type`, validation `code`, JSON `pointer`, HTTP status, and typed interpolation `params` stable and language-neutral.
- Return a fixed English `title` only as a developer/CLI fallback; omit `detail` unless a safe corrective explanation adds value.
- Let the frontend map `type` and validation `code` to its own translation catalog and interpolate non-sensitive parameters such as `{ "min": 15 }`.
- Do not return frontend-specific translation keys such as `auth.errors.invalidCredentials`; they couple the backend contract to one client's catalog organization.
- Do not duplicate every error as both server-localized prose and client-localized prose in the first milestone.
- If a future non-browser client requires localized prose from the server, add separately reviewed `Accept-Language` negotiation plus `Content-Language` (and `Vary: Accept-Language` where cache behavior requires it) without changing the stable machine fields.

Candidate validation shape:

```json
{
  "type": "/problems/validation-failed",
  "title": "Request validation failed",
  "status": 422,
  "errors": [
    {
      "pointer": "#/password",
      "code": "too_short",
      "params": { "min": 15 }
    }
  ]
}
```

The frontend can render a localized message from `code` and `params`, while logs, `curl`, and unknown clients still receive a short English fallback. This remains a proposal until accepted.
