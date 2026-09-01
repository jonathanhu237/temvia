# State Management

## State categories

- **Server state:** TanStack Query owns setup status, the current principal,
  roles, activated users, and pending invitations. The API is the authority
  after a reload.
- **Form state:** React Hook Form owns setup and login values, validation and
  field focus. Confirmation password is never sent to the API.
- **Ephemeral UI state:** component `useState` owns password visibility, open
  menus and an inline logout error.
- **URL state:** TanStack Router owns route location. Setup and password-reset
  tokens are short-lived module values captured from URL fragments and removed
  from history before the first render.
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

Password recovery forms use local React Hook Form state and typed mutations.
The accepted response is a generic component state. Reset success clears the
module-memory authority and navigates to login without seeding the current-user
Query cache; invalid/expired authority clears the value and offers a new-link
path. Tokens never enter Query state, Context, localStorage, sessionStorage, or
cookies managed by browser code.

Role and user replacement forms must be keyed by the server `revision` or
`authVersion`. On `409`, invalidate and reload the affected query before the
user retries; never resubmit stale local checkbox state. Successful grant or
assignment changes invalidate both access data and the current-principal query
because the current browser may have changed authority.

Invitation authority uses the same fragment-only module-memory lifecycle as
password reset. Acceptance clears it on success or invalid authority, creates
no authenticated cache entry, and navigates to explicit login.

## Forbidden patterns

Do not add Zustand, Redux, a second query client, auth data in Context, or
credentials in localStorage/cookies managed by browser code. Do not infer
logout from a network failure or convert a dependency outage into a `401`.
Do not derive authority from visible navigation or a role display name; use the
current principal's `permissions` and `superAdmin` only for presentation, while
the API remains authoritative.
