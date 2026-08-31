# Component Guidelines

## Composition

Use the open-code shadcn components under `src/components/ui` and compose
them in feature files. Keep generated primitives focused on their Radix
behavior. The setup and login screens use `Card`, `Field`, `Input`, `Alert`
and `Button`; the authenticated layout composes the official `Sidebar`
primitive with `DropdownMenu` and `Separator`.

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

Use `FieldLabel` and `FieldDescription` for inputs. Connect error and
description IDs with `aria-describedby`, set `aria-invalid` on invalid
controls, and keep form-level failures in an `Alert` with `role="alert"`.
Preserve keyboard focus, visible `:focus-visible` styles, native autocomplete,
and paste behavior. Run the axe smoke in the Chromium flow when changing a
screen.

## Common mistakes

- Do not place raw `fetch` calls or query caches inside presentational
  components.
- Do not display RFC 9457 `detail` or transport error strings directly; map
  stable problem codes through i18next.
- Do not introduce another icon library, theme provider, or notification
  system. Sonner is mounted once and is not used for recoverable auth errors.
- Do not assume freshly generated shadcn source is compatible with the
  project's Tailwind compiler without a production build and visual geometry
  check.
