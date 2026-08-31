# Restore shadcn theme colors

## Goal

Replace the unintended warm brown palette with a user-selected official
shadcn theme while preserving the current application structure and behavior.

## Background

- `components.json` declares the Radix base, Lucide icons, `style: default`, and
  `baseColor: neutral`.
- `src/index.css` does not contain neutral tokens: most semantic colors use
  warm OKLCH hues around 68-85, producing the beige sidebar and brown primary
  controls shown in the supplied screenshot.
- `pnpm dlx shadcn@latest preset resolve --json` returns `null`, confirming that
  these variables do not resolve to a current official preset.
- The official [shadcn/create](https://ui.shadcn.com/create) builder provides a
  live component preview and generates a preset code. The current CLI can apply
  only the selected theme from that code without reinstalling components.
- The user selected the official Vega style with the Neutral color theme. This
  task applies its color tokens only; Vega does not authorize component, font,
  radius, icon, or layout replacement.
- In a disposable Vite project, `pnpm dlx shadcn@latest init --preset vega
  --base radix` and a disposable copy of this admin with `shadcn apply vega
  --only theme` produced the same light Neutral semantic colors. See
  `research/vega-neutral-theme.md`.

## Requirements

- R01: Use an official shadcn/create theme selection as the source of truth for
  semantic color variables. The approved selection is Vega + Neutral.
- R02: Change theme colors only. Preserve Radix primitives, existing component
  source, Lucide icons, fonts, spacing, radius, routing, and page composition.
- R03: Keep components styled through semantic variables such as `background`,
  `primary`, `accent`, `border`, and `sidebar-*`; do not add raw component-level
  color overrides.
- R04: Preserve all existing authentication, accessibility, responsive, and
  Sidebar behavior.
- R05: Verify the source template, packed/generated admin, production build,
  and the setup/authenticated screens visually.
- R06: Merge only the official light Neutral color values into the existing
  `:root`. Preserve the current `--radius`, font mappings, CSS structure, and
  `--destructive-foreground` compatibility token. Do not add the preset's dark
  theme, chart tokens, extra radii, imports, or component configuration fields.
- R07: Add an independent generator/template assertion for representative
  Neutral semantic tokens so the warm custom palette cannot silently return.

## Acceptance Criteria

- AC01 (R01, R03): The generated admin uses the approved official theme tokens
  and no longer shows the custom beige/brown palette.
- AC02 (R02): The change does not overwrite UI components or alter fonts,
  icons, radius, layout, or application behavior.
- AC03 (R04): Existing admin tests, axe checks, focus states, contrast, and
  responsive Sidebar behavior pass.
- AC04 (R05): Admin lint, type-check, tests, build, package/generator checks,
  and Chromium visual verification pass.
- AC05 (R06, R07): The patch contains only the approved light color-token
  replacement plus its contract test/spec/evidence; shadcn component source and
  unrelated theme infrastructure are byte-for-byte unchanged.

## Out of Scope

- Adding a runtime theme picker or dark-mode toggle.
- Redesigning pages or switching component primitives/style families.
- Changing typography, component density, radius, spacing, or icon library.
