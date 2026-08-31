# Notification and error-presentation comparison

Research snapshot: 2026-08-30.

## Presentation responsibilities

Different feedback has different persistence and focus requirements:

- Field validation belongs beside the relevant control and focuses the first invalid field.
- Invalid credentials, rate limiting, setup-token failure and service unavailability block the current action; they must remain in the form/page as an accessible alert until the user changes input, retries, navigates, or dismisses where appropriate.
- Route/bootstrap failures need a full-page error state with an explicit retry action.
- Successful setup and logout are short, non-blocking confirmations that may use a transient toast while navigation changes the page.
- Unexpected background success/info in future admin work may use toasts; required decisions and destructive confirmations may not.

## Ecosystem snapshot

Weekly downloads cover 2026-08-23 through 2026-08-29 and are supporting maintenance signals.

| Candidate | Current package | Weekly downloads | Model |
| --- | ---: | ---: | --- |
| Sonner | 2.0.8 | 50,547,842 | Opinionated imperative toast API; official shadcn/ui integration |
| Radix Toast | 1.2.23 | 28,286,545 | Accessible primitive parts with controlled/uncontrolled composition |
| React Hot Toast | 2.6.0 | 3,851,582 | Lightweight imperative toast store/components |
| React Toastify | 11.1.0 | 4,075,942 | Feature-rich configurable toast system |
| No toast dependency | n/a | n/a | Page/route state or project-owned live region for every message |

## Comparison

| Concern | Sonner | Radix Toast | React Hot Toast / Toastify | No toast library |
| --- | --- | --- | --- | --- |
| shadcn fit | Current official `sonner` component and theming wrapper | Primitive can be composed manually | No first-party shadcn composition advantage | shadcn `Alert` covers persistent states only |
| API surface | Small `toast`, variants, promise/action support | Lower-level provider/root/viewport/action primitives | Similar imperative APIs; Toastify has broader feature surface | Project owns queue, timing, live region and transitions if transient notifications are wanted |
| Custom control | Opinionated but configurable | Highest | Moderate to high | Highest, with highest maintenance |
| Accessibility burden | Library supplies announcer behavior; content and usage policy remain ours | Strong WAI-ARIA primitive, but composition/hotkey/content are ours | Library-specific review still required | Entirely ours |
| Fit | Strongest for restrained non-critical notifications | Too much component infrastructure for two success notices | No advantage over shadcn's documented path | Viable if all feedback stays inline; future transient feedback would be reimplemented later |

## Accepted presentation policy if Sonner is selected

### Use inline/persistent UI for

- every field validation issue;
- invalid credentials;
- invalid/expired/replaced setup link;
- setup already complete recovery guidance;
- `429` rate limiting, without inventing a countdown the server did not provide;
- `503` dependency/hash-capacity failures and logout retry;
- route bootstrap failure and retry;
- any decision, confirmation or action the user must not miss.

These use shadcn `FieldError` or `Alert`, proper `aria-invalid`, `aria-describedby`, `role="alert"`/live-region behavior, and deliberate focus. A toast never replaces the owning error state.

### Use Sonner only for

- setup completed, after transitioning to login;
- logout completed, after transitioning to login;
- future short-lived non-critical success/info where the resulting screen already reflects the real state.

Do not use `toast.promise` for authentication mutations; the form submit button already owns pending state, and error presentation must remain inline. Do not include retry/destructive actions in expiring authentication toasts.

## Recommendation

Choose **Sonner through shadcn/ui's `sonner` wrapper**, with one application-root Toaster and the restricted policy above.

Unlike an empty future dependency, it has two concrete current uses across navigation and establishes a safe transient-notification convention for later admin mutations. Radix Toast is appropriate when the product needs a bespoke notification center or detailed compositional control; Temvia does not. React Hot Toast and Toastify overlap Sonner without a project-specific advantage.

If Sonner fails accessibility verification with the implemented configuration, prefer removing the transient toast and retaining inline/navigation feedback over silently weakening announcements.

## Primary sources

- shadcn/ui Sonner: <https://ui.shadcn.com/docs/components/radix/sonner>
- Sonner API: <https://github.com/emilkowalski/sonner>
- Radix Toast: <https://www.radix-ui.com/primitives/docs/components/toast>
- Radix accessibility: <https://www.radix-ui.com/primitives/docs/overview/accessibility>
- React Hot Toast: <https://react-hot-toast.com/>
- React Toastify: <https://fkhadra.github.io/react-toastify/>
- npm package registry and download API: <https://www.npmjs.com/>
