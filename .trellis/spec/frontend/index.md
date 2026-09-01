# Frontend Development Guidelines

The React admin is an independent Vite application in `template/admin`. It
uses TypeScript, Tailwind CSS 4, shadcn/ui open-code components, TanStack
Router, TanStack Query, React Hook Form, Zod, i18next and the Fetch API.

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Directory Structure](./directory-structure.md) | Feature and shared module layout |
| [Component Guidelines](./component-guidelines.md) | shadcn composition, props and accessibility |
| [Hook Guidelines](./hook-guidelines.md) | Query, mutation and custom hook rules |
| [State Management](./state-management.md) | Local, URL and server state ownership |
| [Quality Guidelines](./quality-guidelines.md) | Checks, packaging and runtime verification |
| [Type Safety](./type-safety.md) | TypeScript and runtime validation boundaries |

## Baseline rules

- Keep the admin independent from the root package and the Go module. Do not
  create a root frontend workspace.
- Browser requests use relative `/api` paths through the shared Fetch adapter;
  UI components never call `fetch` directly.
- Authentication state is memory-only. Setup, recovery, and invitation
  authority is captured from URL fragments before React renders, then cleared
  after use.
- All user visible copy comes from the typed English and Simplified Chinese
  i18next resources.
- Run the admin checks from `template/admin`: `pnpm lint`, `pnpm check`,
  `pnpm test` and `pnpm build`.
