# Vega + Neutral theme source

Reviewed 2026-09-01 with `shadcn@latest`.

## Official preview and CLI evidence

- [shadcn/create](https://ui.shadcn.com/create) previews presets against real
  components and generates a reusable preset code.
- A disposable official Vite project was generated with:

  ```sh
  pnpm dlx shadcn@latest init --name preview --preset vega \
    --template vite --base radix --yes
  ```

- A disposable copy of this admin was inspected with:

  ```sh
  pnpm dlx shadcn@latest apply vega --only theme --yes
  ```

The command succeeded and produced the same light Neutral values as the fresh
Vega project. No command was run against the real template during planning.

## Approved light color values

| Token | Official value |
| --- | --- |
| `background`, `card`, `popover` | `oklch(1 0 0)` |
| `foreground`, `card-foreground`, `popover-foreground` | `oklch(0.145 0 0)` |
| `primary`, `secondary-foreground`, `accent-foreground` | `oklch(0.205 0 0)` |
| `primary-foreground`, `sidebar-primary-foreground` | `oklch(0.985 0 0)` |
| `secondary`, `muted`, `accent`, `sidebar-accent` | `oklch(0.97 0 0)` |
| `muted-foreground` | `oklch(0.556 0 0)` |
| `destructive` | `oklch(0.577 0.245 27.325)` |
| `border`, `input`, `sidebar-border` | `oklch(0.922 0 0)` |
| `ring`, `sidebar-ring` | `oklch(0.708 0 0)` |
| `sidebar` | `oklch(0.985 0 0)` |
| `sidebar-foreground` | `oklch(0.145 0 0)` |
| `sidebar-primary` | `oklch(0.205 0 0)` |
| `sidebar-accent-foreground` | `oklch(0.205 0 0)` |

## Merge boundary

The CLI's theme application also proposes radius changes, dark variables,
chart variables, an extra custom variant, and additional `components.json`
metadata. Those are not color-only changes and are outside the approved task.
The implementation will copy the official light semantic color values rather
than applying the command destructively to the project.

The existing components consume `--destructive-foreground`, while the current
Vega CSS does not declare that token because its component source handles the
foreground differently. Keep the existing neutral white value so the current
component code remains compatible.
