# Type Safety

TypeScript uses bundler resolution, strict unused checks and no emitted
browser code. Keep types close to the boundary that owns them and validate
untrusted data at runtime.

## Runtime contracts

Zod schemas in `shared/api/contracts.ts` validate every successful API body
and RFC 9457 Problem Details response. `ApiClient` returns inferred `User` and
`SetupStatus` values and converts malformed responses into
`ApiProtocolError`. Do not cast an API response before parsing it.

Browser form schemas in `features/auth/schemas.ts` normalize Unicode name and
email input, count password code points, and emit stable error codes. The
server remains authoritative for final validation. `passwordConfirmation` is
browser-only and is excluded by `normalizeSetupValues`.

```ts
export type User = z.infer<typeof userSchema>
```

## Type organization

Export domain types from the shared contract module when multiple layers use
them. Keep component prop types at the component boundary. Use
`UseFormRegisterReturn` and field error shapes for form field wrappers rather
than `any`.

Router context is `AppRouterContext` and contains one `ApiClient` plus one
`QueryClient`; it does not expose transport internals or duplicate cached
users.

## Forbidden patterns

- Do not use `any`, non-null assertions for untrusted API data, or unchecked
  `JSON.parse` values.
- Do not use server `title`/`detail` strings as translation keys. Map stable
  problem `type` and `code` values to bundled resource keys.
- Do not create a second hand-maintained API response shape in a component.
