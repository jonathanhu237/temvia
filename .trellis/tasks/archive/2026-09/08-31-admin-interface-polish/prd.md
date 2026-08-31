# Polish generated admin interfaces

## Goal

Improve the generated admin's authenticated shell and initial-administrator
screen so their visual hierarchy is concise and deliberate at desktop and
mobile sizes. Remove premature branding, then simplify setup copy and form
spacing without weakening validation or recovery behavior.

## Background

- The user supplied `research/oversized-brand-mark.png`, a 312 by 124 pixel
  crop of the current expanded Sidebar header.
- In `template/admin/src/features/auth/authenticated-shell.tsx:54`, the brand
  row is 40 CSS pixels high with a 12-pixel gap and 14-pixel product text.
- At `authenticated-shell.tsx:55-56`, the dark brand container is 32 CSS
  pixels square while `Layers3` retains Lucide's 24-pixel default. The glyph
  leaves only about four pixels of optical padding per side, which makes it
  appear cramped or clipped and gives it substantially more visual weight than
  the product name.
- The user does not want a temporary logo in this milestone. A later product
  setting is expected to own configurable logo/brand artwork, so the current
  hard-coded `Layers3` mark would create a false permanent identity.
- The user also does not want the `Temvia` brand name shown at this stage. The
  complete `SidebarHeader` is unnecessary until the future branding feature
  defines both artwork and identity behavior.
- The current desktop view repeats the same destination in four places:
  Sidebar `Home`, top-bar `Home`, uppercase content eyebrow `HOME`, and the
  `Home` heading (`authenticated-shell.tsx:115` and
  `routes/_authenticated/index.tsx:13-15`). On a deliberately minimal page,
  this repetition makes the shell look more like a placeholder than useful
  hierarchy.
- The user supplied `research/setup-header-copy.png` and
  `research/setup-field-descriptions.png`. The first shows an eyebrow, page
  title, and explanatory paragraph for one simple setup action. The second
  shows a persistent description under every labeled field.
- The user chose the same concise treatment for login: a neutral `Sign in` /
  `登录` title with no welcome eyebrow, explanatory paragraph, or persistent
  email/password helper text. Conditional errors remain.
- `template/admin/src/features/auth/auth-page.tsx:59-67` does use the local
  shadcn/ui `Card`, `CardHeader`, `CardDescription`, and `CardContent`
  components. The page title is currently a raw `h1`, not `CardTitle`, and a
  custom `Separator` divides header and content.
- The user chose to retain the Card as the setup form boundary. The simplified
  setup composition should use `CardHeader`, `CardTitle`, and `CardContent`
  without setup `CardDescription` or the custom `Separator`.
- After the public auth-page brand header is removed, the language control
  moves into the Card header: title on the left and language control on the
  right. The control uses a compact icon presentation at narrow widths so it
  does not crowd the localized title.
- The user also chose to remove the four-pixel `bg-primary` strip at the top
  of the public auth page. Once the temporary brand treatment is gone, this
  purely decorative accent has no product meaning and adds unnecessary visual
  weight.
- The current auth Card overrides the shadcn default with `shadow-lg`. The
  user chose to remove that override and retain the component's standard light
  border and `shadow-sm`, matching the concise treatment without inventing a
  new card style.
- Visible brand-name references also exist outside the removed headers:
  `Sign in to Temvia`, setup/recovery copy, authenticated welcome/error copy,
  and root error eyebrows. The user confirmed that the no-brand decision
  applies globally to runtime UI in this milestone. Repository/package names
  and operator documentation remain `Temvia`; this is not a source-code rename.
- `setup-form.tsx:67-70` passes a description to every setup field, and
  `form-fields.tsx:28-43,65-92` always renders that description and includes it
  in `aria-describedby`.

## Requirements

- **R01 — No temporary branding:** Remove the hard-coded logo and `Temvia`
  brand treatment from the authenticated `SidebarHeader` and public auth-page
  header. This task must not invent replacement artwork, text, or a monogram;
  the future configurable-branding feature owns those decisions.
- **R02 — Neutral runtime copy:** Remove static `Temvia` brand references from
  every user-visible runtime string, including login, setup/recovery, root
  error, and authenticated-shell surfaces. Prefer concise natural wording over
  substituting repetitive terms such as `the system`. Keep project/package
  identity and operator documentation unchanged.
- **R03 — Sidebar states:** Expanded desktop, collapsed desktop, and mobile
  off-canvas states must begin cleanly with navigation content and retain no
  empty, broken, or misleading brand-header spacing.
- **R04 — Concise setup heading:** The create-administrator card shows one
  localized page title. Remove the `First run` eyebrow and the explanatory
  setup paragraph; do not replace them with equivalent filler copy.
- **R05 — Concise setup fields:** Keep visible labels for name, email,
  password, and confirmation, but remove their four persistent helper
  descriptions. Validation and server errors remain contextual, localized,
  associated with the matching control, and focusable.
- **R06 — Shared auth composition:** Preserve setup/login/recovery behavior
  while making the shared `AuthPage` API capable of optional eyebrow and
  description content. The setup variant uses the retained shadcn Card with
  `CardHeader`, `CardTitle`, and `CardContent`; it omits `CardDescription` and
  `Separator`. Remove the page-level decorative top strip. The normal login
  variant follows the same title-only Card structure and removes persistent
  field helper copy. Do not remove recovery instructions that tell the
  operator how to recover from an invalid or missing setup link.
- **R07 — Standard Card treatment:** Remove the auth Card's custom heavy
  shadow and border overrides. Use the local shadcn Card's default border and
  light shadow so setup, login, and recovery states share one restrained
  surface treatment.
- **R08 — Language placement:** Place the language selector in the Card header
  opposite the title. Keep its accessible name and menu behavior; use the
  compact icon presentation at narrow widths without turning the title into a
  truncated or wrapping control row.
- **R09 — Review scope:** Record each additional interface defect or refinement
  the user identifies before convergence. The repeated `Home` labels are
  explicitly deferred for now.
- **R10 — Accessibility and regression:** Decorative branding remains hidden
  from assistive technology. Existing authentication, locale, navigation,
  responsive behavior, and Sidebar content geometry must not regress.
- **R11 — Template integrity:** Any product-code change must remain valid in
  the source template, packed CLI, and generated admin, with targeted visual
  evidence and existing frontend/generator checks.

## Acceptance Criteria

- **AC01 (R01, R02):** Runtime UI contains no hard-coded logo, product-name
  label, `Temvia` brand string, or empty brand placeholder in either locale.
- **AC02 (R03):** Expanded, collapsed, and mobile Sidebar screenshots show no
  empty logo block, clipping, or unstable header/content alignment.
- **AC03 (R04):** The create-administrator card header contains exactly one
  visible heading and no eyebrow or descriptive paragraph.
- **AC04 (R05):** The four setup controls retain visible labels and conditional
  field errors but render no persistent helper descriptions.
- **AC05 (R06):** The setup surface uses the accepted shadcn Card composition
  without the page-level decorative top strip; missing/invalid setup
  authority, dependency failures, setup completion, login, and server-field
  validation retain their required recovery information and behavior.
- **AC06 (R06):** The normal login Card contains only its title, labeled email
  and password controls, conditional errors, and submit action; it has no
  welcome eyebrow, explanatory paragraph, or persistent field descriptions.
- **AC07 (R07):** Setup, login, and recovery use the local shadcn Card's
  default border and light shadow without `shadow-lg` or a custom shadow tint.
- **AC08 (R08):** Desktop and narrow Card headers keep a readable title and an
  accessible language menu without a floating page-level brand header.
- **AC09 (R09):** The final PRD includes all interface changes explicitly
  agreed during this review and names deferred or excluded surfaces.
- **AC10 (R10):** The existing Playwright authentication flow and axe smoke
  pass, with a targeted assertion or screenshot review covering the brand
  removal and compact setup geometry.
- **AC11 (R11):** Admin lint, type-check, tests, build, and relevant root
  generator/package checks pass on the final implementation.

## Out of Scope

- Building the future configurable-logo setting, upload/storage path, fallback
  policy, or brand asset model.
- Replacing the Temvia name, general Lucide icon family, neutral theme, or
  overall Sidebar component without a later explicit decision.
- Removing field labels, autocomplete, paste, password visibility controls,
  conditional validation errors, or setup recovery instructions.
- Changing repeated `Home` labels in the current shell; the user deferred that
  issue during this review.
- Adding remote assets, a new icon package, animation system, or dark mode.

## Open Questions

- None. The visual-review scope is ready for technical planning and user
  approval.
