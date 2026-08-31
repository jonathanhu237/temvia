# Generated admin interface audit

## Evidence reviewed

- `oversized-brand-mark.png` shows the authenticated Sidebar brand row. The
  24-pixel Lucide glyph sits inside a 32-pixel square and reads as cramped at
  the captured size.
- `setup-header-copy.png` shows three competing header levels for one action:
  an eyebrow, title, and explanatory paragraph.
- `setup-field-descriptions.png` shows persistent explanatory copy below every
  setup control, substantially increasing the form height without helping an
  operator who already understands the visible labels.

## Source audit

| Surface | Current source | Finding |
| --- | --- | --- |
| Authenticated Sidebar | `src/features/auth/authenticated-shell.tsx` | `SidebarHeader` exists only for a hard-coded `Layers3` mark and `productName`; removing the whole header avoids empty collapsed/mobile spacing. |
| Public auth shell | `src/features/auth/auth-page.tsx` | A separate brand header, four-pixel top strip, raw heading, separator, and heavy Card shadow add decoration around a simple task. |
| Form fields | `src/features/auth/form-fields.tsx` | `description` is mandatory and always participates in `aria-describedby`; the API must allow labels plus conditional errors without a permanent description node. |
| Routes | `src/routes/setup.tsx`, `login.tsx`, `__root.tsx` | Every `AuthPage` call currently requires eyebrow and description copy, even when the normal setup/login state should be title-only. |
| Localization | `src/shared/i18n/resources.ts` | Runtime copy contains hard-coded brand references and helper keys in both locales. Recovery text contains operational instructions that must remain after neutral wording replaces the product name. |
| Document metadata | `index.html` | The static title and description expose the same temporary brand even when visible page chrome does not. |
| Browser flow | `e2e/auth.spec.ts` | The default administrator display name contains the product name and would make no-brand screenshots ambiguous; the flow already owns setup, locale, responsive Sidebar, and axe coverage. |

## Design guidance checked

The local `frontend-design` guidance says structural devices should encode real
information and decoration should be cut when it does not serve the brief.
That supports removing the eyebrow, divider, brand header, and top strip rather
than replacing them with another temporary motif.

The targeted `ui-ux-pro-max` review returned these applicable constraints:

- keep associated visible labels;
- keep password-manager autocomplete and paste support;
- keep loading and persistent success/error feedback;
- test localized heading wrapping rather than forcing line breaks;
- keep Card spacing consistent and responsive padding deliberate.

Its generic recommendation for stronger Card shadows was rejected because it
conflicts with the user's explicit request and this repository's existing
shadcn Card already provides a consistent border and `shadow-sm`.

## Scope conclusion

This is one integrated frontend-template change. Shared auth composition,
field accessibility, localization, route call sites, Sidebar geometry, and
generated-output verification must land together. It does not require a child
task, new dependency, API change, database migration, or future branding
configuration.
