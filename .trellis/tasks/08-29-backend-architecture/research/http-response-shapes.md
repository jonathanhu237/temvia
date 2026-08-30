# HTTP success and error response shapes

## Question

Should Temvia wrap every successful and failed HTTP/JSON response in one project-specific envelope, or use endpoint-specific success representations with a standardized error document?

## Observed established patterns

### Direct success representation plus separate error shape

- GitHub REST uses HTTP status codes to identify success/failure and returns endpoint resource objects or arrays as response bodies rather than a universal success envelope: https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
- Stripe uses conventional HTTP status codes, returns resource-shaped success responses, and uses a separate structured error object with machine-readable codes and human-readable messages: https://docs.stripe.com/api/errors
- RFC 9457 standardizes `application/problem+json` specifically for error responses while explicitly allowing successful resource representations to retain their application format: https://www.rfc-editor.org/rfc/rfc9457.html
- Zalando's public REST guidelines require explicit success/error contracts and use Problem JSON for errors rather than one success/error wrapper: https://opensource.zalando.com/restful-api-guidelines/

This family treats HTTP method/status/header semantics as part of the contract. Successful bodies describe the result; errors follow one reusable problem schema.

### Full document envelope

JSON:API defines a complete media type and document format. Top-level `data` and `errors` are mutually exclusive, with optional `meta`, `links`, and included relationships: https://jsonapi.org/format/

This is internally consistent and strong for generic resource APIs, pagination, relationships, and reusable clients, but adopting only its top-level wrapper without its remaining semantics creates a project-specific dialect. Adopting the full specification is disproportionate for the current command/query auth surface.

### Project-specific `{ code, message, data }`

This pattern is common in internal and application APIs because one client interceptor can unwrap every response. It can be valid when paired with real HTTP status codes. Its drawbacks are:

- `code` often duplicates HTTP status or conflates transport and business outcomes.
- `message` becomes an unstable machine contract or conflicts with frontend-owned i18n.
- `data` adds an extra level to every client type without adding endpoint semantics.
- empty `204` responses, redirects, downloads, and streaming become special cases.
- returning HTTP `200` for failures damages proxy, monitoring, retry, cache, and generic-client semantics and should not be used.

## Recommendation for Temvia

- Use real HTTP status codes as the authoritative success/error classification.
- Return endpoint-specific ordinary JSON on success, with semantic keys only where they add meaning; do not add a universal `data`, `code`, `message`, or `success` wrapper.
- Use `204 No Content` when success has no representation, such as logout after confirmed revocation.
- Use one RFC 9457 `application/problem+json` shape for all JSON errors, extended with language-neutral validation `pointer`, `code`, and typed `params`.
- Let future frontend code centralize transport handling based on HTTP status and Problem Details content type. A uniform client helper does not require a uniform success body.
- Document each endpoint's exact success schema and possible problem types; common mechanics are shared without pretending different use-case results are the same type.

Candidate examples:

```json
{"status":"required"}
```

```json
{
  "user": {
    "id": "...",
    "name": "Jonathan Hu",
    "email": "jonathan@example.com"
  }
}
```

```json
{
  "type": "/problems/invalid-credentials",
  "title": "Invalid credentials",
  "status": 401
}
```

The `user` key is endpoint semantics, not a universal transport envelope, and leaves room for future sibling authentication/session metadata without nesting everything below `data`.

This remains a proposal until accepted.
