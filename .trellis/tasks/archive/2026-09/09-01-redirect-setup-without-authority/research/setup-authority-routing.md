# Setup authority routing evidence

Reviewed 2026-09-01.

- `main.tsx` calls `captureSetupAuthority()` before React and router creation.
- `setup-authority.ts` accepts exactly one canonical 43-character token in the
  `/setup` fragment, removes the fragment with `history.replaceState`, and
  retains the token only in module memory.
- `setup.tsx` currently fetches setup status before checking authority, then
  renders the sole `RecoveryState` usage when authority is absent.
- A route-loader authority check can redirect before the setup-status query.
  The component retains the already-captured authority in local state.
- A component effect cleanup is not a safe authority lifecycle boundary:
  React Strict Mode can run it while the route remains active, clearing the
  module value required when a dependency-error retry invalidates the loader.
  TanStack Router's `onLeave` clears it only when navigation leaves `/setup`.
- `SetupForm` already clears module authority before calling
  `onInvalidAuthority`; the route callback can navigate directly to `/login`.
- The serial Chromium flow has a fresh setup link before initialization, so it
  can verify bare-route and refresh redirects, reopen the same unused token,
  and then continue the existing initialization flow.
