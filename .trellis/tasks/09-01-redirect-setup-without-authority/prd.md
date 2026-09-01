# Redirect setup without authority

## Goal

Remove the verbose setup recovery screen. A setup route without in-memory
authority should immediately return the operator to the normal login page,
while the full one-time setup link continues to open the administrator form.

## Background

- `captureSetupAuthority()` accepts a canonical token from the `/setup`
  fragment, removes the fragment from browser history, and stores the token in
  module memory only.
- Opening bare `/setup`, leaving and returning, or refreshing after the
  fragment was removed therefore produces no in-memory authority.
- `setup.tsx` currently renders `RecoveryState` with an alert, instructions,
  and a return button in that state. This is the screen the user rejected.
- `RecoveryState` is used only by this branch; the protected setup form and
  setup-status dependency error are separate behaviors.

## Requirements

- R01: Opening `/setup` without canonical in-memory setup authority redirects
  immediately to `/login` with history replacement.
- R02: Refreshing `/setup` after the URL fragment has been removed also
  redirects to `/login`.
- R03: The redirect occurs before requesting `/api/setup/status`; an
  unauthorised setup visit must not render setup UI or depend on API health.
- R04: A current `/setup#token=...` link still renders the administrator
  creation form and can complete setup.
- R05: A server-rejected or expired setup token clears authority and navigates
  to `/login` rather than revealing the removed recovery screen.
- R06: Preserve the setup dependency-recovery UI for an authorised setup flow
  whose status request fails.
- R07: Remove the now-unused `RecoveryState` component and setup-no-authority
  translations without changing unrelated authentication UI.

## Acceptance Criteria

- AC01 (R01, R03): On an uninitialized installation, bare `/setup` ends at
  `/login`, displays the normal login form, and makes zero setup-status
  requests.
- AC02 (R02): Opening a valid setup link and then refreshing the cleaned
  `/setup` URL redirects to `/login` without showing recovery content.
- AC03 (R04, R06): Reopening the valid setup link displays the setup form; the
  existing setup, dependency failure, initialization and login flows remain
  functional.
- AC04 (R05): Invalid setup authority is cleared and the route navigates to
  `/login`.
- AC05 (R07): No `RecoveryState` or setup-no-authority copy remains; admin
  lint/type-check/tests/build, generator parity, Chromium and axe checks pass.

## Out of Scope

- Persisting setup authority across refreshes or in browser storage.
- Making bare `/setup` capable of initialization.
- Changing token lifetime, generation, validation or API contracts.
- Redesigning the valid setup form, login form or setup dependency error.
