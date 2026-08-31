# Generated admin interface polish design

## 1. Boundaries and delivery shape

The change stays inside the generated admin template and its frontend tests.
It changes presentation and localized runtime copy but does not change API
contracts, authentication state, routes, persistence, deployment topology, or
the shadcn primitives themselves.

Implement it as one task because the Sidebar, shared public auth shell, form
field API, route props, translations, document metadata, and browser evidence
form one generated-template contract. No child task or new package is needed.

## 2. Authenticated shell

Remove the complete product-specific `SidebarHeader`, including its `Layers3`
import and localized product-name lookup. `SidebarContent` becomes the first
Sidebar section in expanded desktop, icon-collapsed desktop, and mobile sheet
states. Do not leave a spacer or add a replacement monogram.

The footer identity menu, navigation, top bar, current-user content, language
selection, and logout behavior remain unchanged. The repeated Home labels are
explicitly deferred.

## 3. Public auth composition

The target structure is:

```text
main (centered, responsive page padding)
└── Card (local shadcn default border and shadow-sm)
    ├── CardHeader (horizontal alignment)
    │   ├── heading group
    │   │   ├── CardTitle containing the semantic h1
    │   │   └── optional CardDescription for recovery/error context only
    │   └── LanguageMenu
    └── CardContent
        └── form or recovery/error content
```

Remove the page-level brand header, top accent strip, custom `Separator`, and
Card shadow/border overrides. The normal setup and login states pass only a
title. Exceptional setup, dependency, not-found, and error states may keep a
localized description when it supplies recovery information.

`AuthPage` no longer requires an eyebrow. Its description is optional. This
keeps a single shared composition without boolean page-layout modes. The local
`CardTitle` renders a `div`, so it contains an `h1` to preserve heading
semantics without modifying the open-code primitive for one feature.

The language trigger remains one DOM control. At narrow widths its text is
visually hidden and the globe stays visible with an accessible name; from the
small breakpoint upward the current locale label appears. The title group
owns remaining width and may wrap naturally in either locale. No duplicated
mobile/desktop menu is introduced.

## 4. Forms and accessibility

`TextField` and `PasswordField` stop requiring a `description` prop and stop
rendering `FieldDescription` for normal authentication fields. Each control
keeps:

- a visible associated `FieldLabel`;
- existing type, input mode, autocomplete, and paste behavior;
- `aria-invalid` when a field error exists;
- `aria-describedby` pointing to the conditional `FieldError` only when that
  error exists;
- password visibility controls and their localized accessible names.

The setup form removes four helper values and the login form removes two.
Browser/schema and server validation remain unchanged, so password length,
email validity, confirmation mismatch, and server pointer errors appear only
when actionable. Form-level Alerts, pending labels, focus-to-first-error, and
setup-authority recovery remain intact.

## 5. Localization and neutral metadata

Delete translation keys that become unused solely because the runtime no
longer renders branding, eyebrows, or persistent field descriptions. Change
the login title to neutral `Sign in` / `登录`. Rewrite recovery and setup-state
messages that contain `Temvia` so their operational meaning remains clear
without inserting filler such as “the system.”

Remove the product name from root error eyebrows by removing the eyebrow API.
Use neutral document metadata in `index.html` so the browser title and page
description do not reintroduce temporary branding. Repository/package names,
README content, `UPSTREAM.md`, source package identity, and future brand
configuration are unaffected.

The Playwright administrator fixture uses a neutral person/display name so a
visual check cannot mistake test data for remaining UI branding.

## 6. Compatibility, verification, and rollback

Existing generated projects do not change until regenerated. The source
template, packed npm artifact, and newly generated output must remain
byte-equivalent for modified files. The implementation adds no route file, so
the generated TanStack route tree should not require a semantic change.

Component tests cover absent helper copy, preserved label/autocomplete
semantics, and error association/focus. Browser assertions cover one heading
on normal setup/login, absence of hard-coded branding and helper prose,
language control behavior, Sidebar geometry without a header, both responsive
states, and axe. Capture desktop setup plus expanded/collapsed/mobile shell
screenshots for review after generating and running the real stack on
Centaurus.

Rollback is a frontend-template revert. There is no schema, API, session, or
data rollback.
