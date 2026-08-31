# Client validation comparison

Research snapshot: 2026-08-30.

## Boundary before library choice

Client validation is a usability layer, not the authentication domain authority. The Go API must validate every request and the React client must handle its `422` Problem Details even when client validation passed.

The client should validate constraints it can present immediately and consistently:

- required setup/login inputs;
- password confirmation equality, which exists only in the browser form;
- stable, documented bounds such as the 15-to-128-code-point password rule, implemented with NFC normalization and Unicode code-point counting rather than JavaScript UTF-16 `.length`;
- the documented name/email shape when it can match the backend contract exactly enough to avoid knowingly accepting obvious errors.

Backend issues remain authoritative for normalization edge cases, email uniqueness, concurrency and all domain/storage behavior. Schema error values are stable application codes translated at render time; schemas do not contain user-visible English or Chinese text.

## Ecosystem snapshot

Weekly downloads cover 2026-08-23 through 2026-08-29 and are maintenance signals rather than the deciding factor.

| Candidate | Current package | Weekly downloads | Model |
| --- | ---: | ---: | --- |
| Zod | 4.5.4 | 274,747,331 | TypeScript-first immutable schemas with inferred input/output types |
| Valibot | 1.4.2 | 18,519,867 | Modular function pipelines designed for tree shaking |
| ArkType | 2.2.3 | 2,046,073 | TypeScript-like runtime type syntax and highly inferred constraints |
| Yup | 1.7.1 | 12,498,124 | Established fluent object schemas with casting/transformation history |
| Ajv | 8.20.0 | 377,544,216 | Compiled JSON Schema validation |
| Custom React Hook Form rules | n/a | n/a | Project-owned imperative/field validation functions |

All main schema candidates can integrate through `@hookform/resolvers`; Standard Schema provides a vendor-neutral interface supported by modern schema libraries.

## Comparison

| Concern | Zod 4 | Valibot | ArkType | Custom RHF rules |
| --- | --- | --- | --- | --- |
| Type inference | Excellent and widely integrated | Excellent input/output/issue inference | Excellent; closest syntax to TypeScript | Manually maintained form types |
| Cross-field validation | Object refinements with explicit issue paths | Object pipelines and custom/check actions | Narrow/morph/custom constraints | Direct `getValues`/validate callbacks |
| Stable i18n codes | Custom error values/error maps; built-in locales also exist | Custom issue messages plus official modular i18n | Custom error formatting | Completely project-defined |
| Bundle model | Larger general-purpose package; Zod Mini exists | Strong tree shaking and very small selected pipelines | Moderate | No library bytes |
| Ecosystem/tool support | Strongest | Strong and growing; Standard Schema-native | Smaller but active | No external compatibility |
| Schema reuse | Forms, API boundary parsing, configuration and tests | Same, with modular imports | Same | Usually coupled to one form |
| Maintenance risk | Lowest | Low to moderate | Moderate | Project owns all behavior and tests |
| Fit | Strongest | Strong if bundle minimization is prioritized | Technically capable without project-specific advantage | Fine for two forms, weak as a long-term template convention |

## Other choices

### Yup

Yup is mature and remains supported by React Hook Form. Zod and Valibot provide clearer TypeScript input/output inference and immutable schema composition for a new TypeScript-first codebase, so Yup does not offer a compensating advantage.

### Ajv and JSON Schema

Ajv is excellent when JSON Schema interoperability, generated contracts, or validating externally defined JSON documents is a requirement. Temvia has small, source-defined browser forms and a Go API contract rather than shared generated JSON Schema, so this would add schema ceremony without eliminating cross-language drift.

### No schema dependency

React Hook Form's built-in validators can implement the current two forms. That removes a dependency but scatters validation and error-path conventions across components as the admin grows. The project would eventually create its own small validation framework or migrate later.

## Recommendation

Choose **Zod 4 plus `@hookform/resolvers`**, with stable validation codes rather than translated sentences embedded in schemas.

Zod's advantage here is not that it can duplicate the backend. It provides a mature central contract for form value types, cross-field confirmation, issue paths and focused unit tests. Valibot is the closest alternative and wins on bundle size; the current auth routes can be split lazily, so that saving does not outweigh Zod's broader maintenance and integration base for this long-lived template.

Do not use Zod's built-in human-language locales as the application's i18n contract. A schema emits project keys such as `required`, `invalid_email`, `invalid_password`, and `password_mismatch`; the selected i18n runtime translates those keys. Backend Problem Details codes feed the same presentation mapping but remain distinguishable by source when behavior differs.

## Primary sources

- Zod 4: <https://zod.dev/v4>
- Zod error customization and locales: <https://zod.dev/error-customization>
- Valibot schemas: <https://valibot.dev/guides/schemas/>
- Valibot issues: <https://valibot.dev/guides/issues/>
- Valibot internationalization: <https://valibot.dev/guides/internationalization/>
- Valibot Standard Schema integration: <https://valibot.dev/guides/integrate-valibot/>
- ArkType introduction: <https://arktype.io/docs/intro/your-first-type>
- Standard Schema: <https://standardschema.dev/>
- React Hook Form resolvers: <https://github.com/react-hook-form/resolvers>
- npm package registry and download API: <https://www.npmjs.com/>
