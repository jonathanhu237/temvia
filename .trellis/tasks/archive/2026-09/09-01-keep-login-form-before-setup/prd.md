# Keep login form available before setup

## Goal

Keep `/login` visually and behaviorally consistent by always rendering the
normal login form, including before the first administrator is created.

## Background

- The current login route fetches `/api/setup/status` before rendering.
- When the response is `required`, it replaces the login form with a verbose
  initialization recovery page. This is the screen the user rejected.
- The setup flow already has its own protected `/setup#token=...` route.
- The API login use case does not require initialization to be complete. With
  no matching account, it returns the same `invalid_credentials` problem used
  for any unknown email, so the login form can remain generic.

## Requirements

- R01: `/login` always renders the standard email/password login form,
  regardless of `/api/setup/status`.
- R02: The login route must not fetch setup status or show initialization,
  dependency-recovery, or setup-link guidance.
- R03: Preserve redirecting an already authenticated user from `/login` to
  the authenticated Home page.
- R04: Preserve the protected one-time `/setup#token=...` initialization flow
  and all setup-route behavior.
- R05: A login attempt before initialization uses the existing generic
  localized invalid-credentials response; it must not reveal setup state.
- R06: Remove login-only initialization copy that becomes unreachable.
- R07: Keep accessibility, localization, and the generated template contract
  passing.

## Acceptance Criteria

- AC01 (R01, R02): Opening `/login` on a fresh uninitialized installation
  displays the normal login Card with email, password, and submit controls and
  no “finish initialization” content.
- AC02 (R03): Opening `/login` with a valid session redirects to Home.
- AC03 (R04): A current one-time setup link still opens the administrator
  creation form and completes initialization.
- AC04 (R05): Submitting unknown credentials before setup displays the
  localized generic invalid-credentials error.
- AC05 (R06, R07): Unused login initialization translations are removed, admin
  lint/type-check/tests/build pass, generated-project checks pass, and the
  uninitialized login page has no axe violations.

## Out of Scope

- Changing API authentication semantics or setup-token security.
- Adding a link from the login form to the setup route.
- Redesigning the login Card, fields, errors, or navigation.
- Changing the authenticated layout or theme.
