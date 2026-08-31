# Component Guidelines

## Composition

Use the open-code shadcn components under `src/components/ui` and compose
them in feature files. Keep generated primitives focused on their Radix
behavior. The setup and login screens use `Card`, `Field`, `Input`, `Alert`
and `Button`; the authenticated layout composes the official `Sidebar`
primitive with `DropdownMenu` and `Separator`.

Public authentication screens use the local Card's default border and light
shadow. A normal setup or login Card has one `CardTitle`, its form in
`CardContent`, and no decorative eyebrow, divider, or persistent explanatory
paragraph. Recovery/error states may add `CardDescription` when it tells the
operator how to recover. Keep the language menu in the Card header; its
icon-only narrow-screen trigger must retain an accessible name, a 44-pixel
touch target, and `shrink-0` so localized headings cannot collapse it.

Do not hard-code a temporary product logo or product name into the reusable
admin shell. Branding belongs to a future explicit configuration contract;
until that exists, begin the Sidebar with real navigation content.

Define small props inline when a component has one clear use. Use an exported
type when the props are shared or complex. Prefer children and shadcn
composition over boolean props that encode a page layout.

```tsx
export function AuthAlert({ title, description }: {
  title: string
  description: string
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}
```

## Styling

Use Tailwind utility classes and semantic shadcn variables (`bg-background`,
`text-muted-foreground`, `border-border`, and so on). Use `cn()` from
`src/lib/utils.ts` when a component merges caller classes. Use `gap-*` for
layout spacing; do not add arbitrary z-index values or duplicate Radix
primitives.

Tailwind 4 CSS-variable utilities use the parenthesized shorthand, such as
`w-(--sidebar-width)` and `max-w-(--skeleton-width)`. Do not retain older
registry spellings such as `w-[--sidebar-width]`: this project's Vite build
emits the invalid declaration `width:--sidebar-width`, which collapses the
desktop Sidebar gap and lets the fixed Sidebar cover page content. When the
Sidebar source changes, inspect the built CSS and keep the Playwright bounding
box assertion that places the Home heading to the right of the visible
Sidebar.

Icons come from Lucide. An icon that conveys meaning must have a visible label
or accessible name; decorative icons use `aria-hidden="true"`. Icon-only
buttons must provide an explicit `aria-label`.

## Accessibility

Every input uses `FieldLabel`. Add `FieldDescription` only when persistent
guidance is necessary to complete the field; do not repeat an obvious label or
show validation rules permanently when a localized conditional error is more
useful. `aria-describedby` must reference only nodes currently rendered. For a
field with no helper text, omit the attribute until an error exists:

```tsx
const errorId = `${id}-error`

<Input
  aria-invalid={Boolean(error)}
  aria-describedby={error?.message ? errorId : undefined}
/>
<FieldError id={errorId} errors={error ? [error] : undefined} />
```

Keep form-level failures in an `Alert` with `role="alert"`. Preserve keyboard
focus, visible `:focus-visible` styles, native autocomplete, and paste
behavior. Run the axe smoke in the Chromium flow when changing a screen.

## Common mistakes

- Do not place raw `fetch` calls or query caches inside presentational
  components.
- Do not display RFC 9457 `detail` or transport error strings directly; map
  stable problem codes through i18next.
- Do not introduce another icon library, theme provider, or notification
  system. Sonner is mounted once and is not used for recoverable auth errors.
- Do not leave `aria-describedby` pointing at a removed helper or conditional
  error node; automated accessibility checks do not always report this broken
  reference.
- Do not assume freshly generated shadcn source is compatible with the
  project's Tailwind compiler without a production build and visual geometry
  check.
