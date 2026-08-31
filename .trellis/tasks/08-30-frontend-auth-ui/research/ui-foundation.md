# UI foundation research

## Decision

Use Tailwind CSS with shadcn/ui.

- Tailwind CSS owns utility-based styling and design tokens through its Vite integration.
- shadcn/ui supplies accessible, editable component source that is copied into the generated admin project.
- Add only components required by the setup, login, authenticated shell, and shared feedback states.
- Add Radix primitives only when selected shadcn/ui components require them.
- Do not add another complete UI framework.

## Rationale

This project is a long-lived template whose generated application must remain adaptable. shadcn/ui exposes the component code instead of making the application depend on a fixed visual abstraction, while Tailwind provides a consistent styling vocabulary with no browser runtime. This costs more ownership than Ant Design or Mantine, but avoids adopting their broader visual systems and APIs before the product has corresponding needs.

## Alternatives considered

- Ant Design: a broad enterprise component system with built-in conventions and many components. It would accelerate dense administration screens, but its design system and runtime surface are larger than the current setup/login scope.
- Mantine: a cohesive hooks and component ecosystem. It is more flexible than a strongly opinionated enterprise system, but still introduces a parallel styling and component abstraction that the repository would consume rather than own.
- Native CSS and hand-built components: smallest dependency graph, but would make the project recreate accessible interactive primitives as its UI grows.

## Primary sources

- shadcn/ui introduction: <https://ui.shadcn.com/docs>
- shadcn/ui Vite installation: <https://ui.shadcn.com/docs/installation/vite>
- Tailwind CSS Vite installation: <https://tailwindcss.com/docs/installation/using-vite>
- Radix Primitives introduction: <https://www.radix-ui.com/primitives/docs/overview/introduction>
- Ant Design introduction: <https://ant.design/docs/react/introduce/>
- Mantine getting started: <https://mantine.dev/getting-started/>
