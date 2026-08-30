# RPC versus HTTP/JSON for the auth milestone

## Question

Should Temvia replace the proposed `net/http` JSON endpoints with an RPC protocol before implementing the backend login flow?

## Current flow

The accepted use cases already map directly to ordinary HTTP semantics:

- `GET /api/setup/status` queries coarse setup state.
- `POST /api/setup` completes the one-time setup command.
- `POST /api/auth/login` creates a server-side session.
- `GET /api/auth/me` queries the current authenticated user.
- `POST /api/auth/logout` revokes the session.

This is pragmatic use-case-oriented HTTP, not an attempt to force every operation into resource-only CRUD.

## RPC meanings and trade-offs

### Native gRPC plus gRPC-Web

Primary sources:

- https://grpc.io/docs/platforms/web/quickstart/
- https://grpc.io/docs/platforms/web/basics/

Native gRPC provides Protobuf schemas, generated clients, efficient binary transport, streaming, and strong multi-language contracts. Browsers use gRPC-Web rather than native gRPC and official examples introduce generated browser stubs and an Envoy translation proxy. That adds protocol, code-generation, and deployment machinery to a small cookie-based browser authentication surface. Standard `curl`, browser network inspection, and ordinary HTTP error semantics also become less direct.

### ConnectRPC

Primary sources:

- https://github.com/connectrpc/connect-go
- https://github.com/connectrpc/connect-es

Connect uses Protobuf schemas and generated Go/TypeScript code but supports a browser-friendly, curl-friendly protocol over HTTP/1.1 or HTTP/2 and can use `net/http`. It is the strongest RPC candidate if Temvia later needs shared generated contracts, multiple typed clients, streaming, or service-to-service interoperability. It still adds Protobuf/Buf tooling, generated source lifecycle, Connect error semantics, and frontend runtime dependencies. Those costs are not justified by the five current unary auth operations alone.

### JSON-RPC 2.0

Primary source: https://www.jsonrpc.org/specification

JSON-RPC puts `jsonrpc`, `method`, `params`, and `id` into request envelopes and `result` or numeric-code `error` into responses. It is transport-agnostic and supports batching and notifications. For this browser API it would duplicate HTTP's existing routing, methods, status codes, cache behavior, and observability while replacing the proposed RFC 9457 error contract with JSON-RPC's own numeric error model. Cookie, CSRF, origin, and session concerns would remain unchanged.

## Internationalization

RPC does not remove the need for language-neutral error semantics. Protobuf/RPC errors still require stable error codes or typed details plus interpolation parameters; user-visible translation should still be performed by the frontend under the current proposal. Changing protocols would therefore not solve the i18n question that prompted this comparison.

## Recommendation

Keep ordinary `net/http` HTTP/JSON for this milestone and allow action-oriented routes where they express real commands. It is the smallest contract that remains easy to test with `curl`, maps correctly to cookie and HTTP status behavior, and preserves the accepted standard-library router choice. Do not adopt JSON-RPC or native gRPC/gRPC-Web.

Record ConnectRPC as the future reconsideration point if concrete requirements emerge for multiple generated clients, Protobuf-first schema ownership, streaming, or service-to-service RPC. A future transport adapter can be added around the application layer without changing the accepted domain/application structure. This recommendation remains unselected until the user accepts it.
