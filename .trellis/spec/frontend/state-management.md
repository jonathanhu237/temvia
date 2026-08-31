# State Management

## State categories

- **Server state:** TanStack Query owns setup status and the current user. The
  API is the authority after a reload.
- **Form state:** React Hook Form owns setup and login values, validation and
  field focus. Confirmation password is never sent to the API.
- **Ephemeral UI state:** component `useState` owns password visibility, open
  menus and an inline logout error.
- **URL state:** TanStack Router owns route location. The setup token is a
  short-lived module value captured from a URL fragment and is removed from
  history before the first render.
- **Preference state:** i18next stores only an explicitly selected locale in
  `temvia.locale` localStorage. It never stores auth data.

## Query ownership

Create one `QueryClient` in `app/query-client.ts` and provide it once at the
root. Auth query keys and option factories live in `features/auth/queries.ts`:

```ts
export const currentUserQueryKey = ['auth', 'current-user'] as const
```

Successful login seeds that cache. Successful logout removes it only after an
acknowledged `204`; a failed logout keeps the current user and offers retry.
Setup invalidates status and navigates to login without creating a session.

## Forbidden patterns

Do not add Zustand, Redux, a second query client, auth data in Context, or
credentials in localStorage/cookies managed by browser code. Do not infer
logout from a network failure or convert a dependency outage into a `401`.
