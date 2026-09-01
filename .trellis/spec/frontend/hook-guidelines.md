# Hook Guidelines

## Data fetching

Use TanStack Query through feature-owned option factories. The auth feature
owns `setupStatusOptions` and `currentUserOptions`; route loaders and UI
mutations reuse those factories so retry and cache behavior stays consistent.
Set `retry: false` for setup, current-user and auth mutations. A `401` problem
confirms an unauthenticated state; transport, protocol and `503` failures must
remain visible as retryable dependency errors.

The login route resolves `currentUserOptions` directly and always renders the
normal login form when no user is returned. It must not query setup status;
initialization status and setup authority belong to the `/setup` route.

```tsx
const currentUser = useQuery(currentUserOptions(api))
```

The shared Fetch adapter owns request headers, credentials, response parsing,
Zod validation and `ApiProblemError` conversion. Hooks and components receive
typed values or typed errors; they do not inspect `Response` objects.

## Local hooks

Custom hooks are named `use*` and stay small. `use-mobile.tsx` is a UI media
query hook used by the shadcn Sidebar. Prefer derived values during render;
use an effect only for synchronizing with an external browser or server
system. Do not use a hook to hide a second auth cache or a global mutable
store.

## Effects and navigation

Keep redirects in route loaders or a narrowly scoped effect tied to a known
query result. Include all values in effect dependency arrays. Setup authority
capture runs before React in `main.tsx`; it must not be moved into a component
effect where a credential could render first.

## Common mistakes

- Do not enable blind retries for login, logout or session resolution.
- Do not put server state in React Context or localStorage.
- Do not call `changeLocale` without updating the document language through
  the shared i18n module.
