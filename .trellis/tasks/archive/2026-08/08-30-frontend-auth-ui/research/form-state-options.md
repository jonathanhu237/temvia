# React form-state comparison

Research snapshot: 2026-08-30.

## Project-specific needs

- Setup has name, email, password, and browser-only password confirmation; login has email and password.
- The Go API remains authoritative for name/email/password validity and returns RFC 9457 field issues as JSON pointers plus stable codes.
- The form layer must apply returned issues to fields, focus the first invalid field, preserve user input after failure, prevent duplicate submission, expose accessible invalid state, and keep messages localizable.
- The generated admin is expected to grow beyond these two forms, but no current requirement calls for a form builder, schema-driven UI, or large dynamic questionnaire.
- shadcn/ui's current `Field` primitives officially document both React Hook Form and TanStack Form integration.

## Ecosystem snapshot

Weekly downloads cover 2026-08-23 through 2026-08-29 and are maintenance signals only.

| Candidate | Current package | Weekly downloads | Architectural model |
| --- | ---: | ---: | --- |
| React Hook Form | 7.87.0 | 58,720,895 | Uncontrolled native inputs with subscriptions; controlled components through `Controller` |
| TanStack Form | 1.33.5 | 2,891,125 | External reactive store with typed field paths and field/form subscriptions |
| Formik | 2.4.9 | 4,588,551 | Controlled React state/context; v3 remains prerelease |
| React Final Form | 7.0.1 | 605,806 | Subscription-based adapter over Final Form |
| Conform | 1.21.1 | 255,068 | HTML/FormData-first forms designed around server round trips and progressive enhancement |
| Native React/HTML | React 19 | n/a | Project-owned value/error/touched/submission state |

## Comparison

| Concern | React Hook Form | TanStack Form | Native React/HTML |
| --- | --- | --- | --- |
| Type safety | Typed values and field paths; schema output can type the submit result | Strong typed field paths, values, error types, form groups and reusable composition | Only the types the project builds and keeps synchronized |
| Rendering model | Uncontrolled by default, field-level subscriptions, controlled escape hatch | Store-backed fine-grained subscriptions | Easy for small controlled forms; optimization and subscriptions are project-owned |
| Schema support | External resolver package integrates Standard Schema/Zod/Valibot and others | Standard Schema and function validators directly | Direct schema calls, with manual error conversion |
| Server field errors | `setError` maps JSON pointers to fields and can focus | Form/field error maps and server-validation result objects | Manual error state, pointer mapping and focus behavior |
| shadcn integration | First-class official guide using `Controller`, `Field`, `aria-invalid` and `FieldError` | First-class official guide and pre-bound field composition | `Field` primitives work, but all state wiring is ours |
| Large/dynamic forms | Mature field arrays, watch, reset and controller ecosystem | Excellent nested paths, linked fields, async validation, groups and reusable app-form hooks | Complexity grows directly in project code |
| Additional abstraction | Low to moderate | Moderate; production guidance encourages an app-specific form hook and pre-bound components | No dependency, but repeated project abstraction appears as forms grow |
| Long-term dependency confidence | Highest | Good but substantially younger | React/HTML stable, project implementation becomes the maintenance burden |
| Fit | Strongest | Strong, especially if highly dynamic forms become central | Adequate only if Temvia intentionally remains at two simple forms |

## Other candidates

### Formik

Formik remains usable and approachable, but its controlled context model causes broader renders and its current stable API has evolved slowly while v3 remains prerelease. It provides no advantage over React Hook Form for these native-input-heavy forms and is not the best new-template default.

### React Final Form

Final Form has a sound subscription model and can handle complex forms. Its React ecosystem and current mindshare are much smaller than React Hook Form's, while its capabilities do not solve a project-specific requirement better.

### Conform

Conform is strongest when HTML form submissions, server actions/loaders and progressive enhancement share validation state across the server/client boundary. Temvia submits JSON to an independent Go API from a client SPA, so adopting Conform would work against its central design advantage.

### Formisch and smaller form libraries

shadcn/ui now documents Formisch as another form option. It and other small alternatives do not currently provide enough stability or a uniquely necessary capability to justify using them as the generated template's form contract.

## Recommendation

Choose **React Hook Form** for form state.

This is not a recommendation based on learning cost. It has the best combination of stable maintenance, shadcn integration, native input behavior, accessible focus/error APIs, and direct mapping from RFC 9457 field pointers through `setError`. TanStack Form offers stronger composition types, but those gains matter most for large dynamic or cross-form field systems that are not currently required. Its extra app-form abstraction would be infrastructure built in anticipation rather than against a present constraint.

Do not select the schema validator in the same decision. React Hook Form owns interaction state; a later decision will compare Zod, Valibot, ArkType, and narrowly written validation functions. The Go backend stays authoritative regardless of client validation.

## Primary sources

- shadcn/ui form choices: <https://ui.shadcn.com/docs/forms>
- shadcn/ui React Hook Form integration: <https://ui.shadcn.com/docs/forms/react-hook-form>
- shadcn/ui Field accessibility and validator support: <https://ui.shadcn.com/docs/components/radix/field>
- React Hook Form: <https://react-hook-form.com/docs/useform>
- React Hook Form resolvers: <https://github.com/react-hook-form/resolvers>
- TanStack Form basic concepts: <https://tanstack.com/form/latest/docs/framework/react/guides/basic-concepts>
- TanStack Form validation: <https://tanstack.com/form/latest/docs/framework/react/guides/validation>
- TanStack Form composition: <https://tanstack.com/form/latest/docs/framework/react/guides/form-composition>
- Formik: <https://formik.org/>
- React Final Form: <https://github.com/final-form/react-final-form>
- Conform: <https://conform.guide/>
- npm package registry and download API: <https://www.npmjs.com/>
