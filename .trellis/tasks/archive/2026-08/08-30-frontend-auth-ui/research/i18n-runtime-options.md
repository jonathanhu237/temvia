# React i18n runtime comparison

Research snapshot: 2026-08-30.

## Project-specific responsibilities

- Localize every implemented setup/login/authenticated screen from the first release.
- Translate client validation keys and runtime RFC 9457 `type`, top-level `code`, and field `errors[].code` values without comparing backend English `title` or `detail`.
- Support parameters and plural rules for future rate-limit, counts and admin screens.
- Change locale at runtime and update document `lang`/`dir`; locale selection and persistence are a separate product decision.
- Provide a known generic fallback for an unrecognized backend problem/code rather than showing raw protocol values or English backend prose.
- Keep catalogs bundled with the application for deterministic startup; do not require a translation SaaS or runtime translation HTTP service.
- Catch missing keys/catalog drift in type-checks and tests where practical.

## Ecosystem snapshot

Weekly downloads cover 2026-08-23 through 2026-08-29 and are maintenance signals.

| Candidate | Current packages | Weekly downloads | Model |
| --- | --- | ---: | --- |
| i18next + react-i18next | 26.4.0 + 17.0.12 | 21,987,057 + 15,905,002 | Runtime resource lookup with namespaces, fallback chains and React binding |
| Lingui | 6.6.0 | 1,613,674 core / 1,133,095 React | Extract/compile catalogs with macros, ICU messages and translation workflow tooling |
| React Intl / FormatJS | 10.1.24 | 3,331,581 | Runtime ICU MessageFormat with message descriptors and optional extraction/compile tooling |
| Paraglide JS | 2.25.0; React binding 1.0.3 | 506,323 compiler / 12,308 React | Compiler-generated typed message functions and tree-shaken translations |
| Project-owned dictionaries + `Intl` | n/a | n/a | Manual key lookup plus browser number/date/plural APIs |

## Comparison

| Concern | i18next/react-i18next | Paraglide JS | Lingui | React Intl | Project-owned |
| --- | --- | --- | --- | --- | --- |
| Key/parameter types | Resource module augmentation and selector API provide typed keys; runtime strings require guarded lookup | Generated message functions give strongest key and parameter types | Extraction/macros validate catalogs; explicit IDs can be typed with project tooling | IDs default to string but can be narrowed through global type augmentation | Entirely project-defined |
| Runtime backend codes | Natural dynamic-key lookup with ordered fallback keys | Best with build-time-known keys; requires an explicit runtime-code-to-function map | Runtime catalog lookup possible but extraction workflow favors source-known messages | `formatMessage` accepts runtime IDs and explicit fallback descriptors | Manual map/switch |
| Formatting/plurals | Built-in interpolation, plurals, context, `Intl` formatting | Compiled parameters, plurals and variants | ICU messages, rich text and plurals | Strong ICU MessageFormat and rich formatting | Manual `Intl` wiring |
| Catalog loading | Bundled resources or lazy namespaces | Generated/tree-shaken message functions | Extracted and compiled catalogs, lazy loading available | Bundled/extracted message descriptors/catalogs | Manual imports |
| Build coupling | None required | Vite plugin/CLI plus generated output and inlang project config | CLI, compiler, macros and typically a Vite plugin | Runtime works directly; extraction adds CLI/Babel/TS tooling | None |
| Translation-team workflow | Broad plugin/TMS ecosystem and namespaces | Inlang ecosystem and machine-readable messages | Strongest extraction/context/PO/TMS workflow | Strong descriptor/extraction workflow | Weak |
| Maturity risk | Lowest | Active and promising but younger, especially React binding | Mature | Mature | Project owns all defects |
| Fit | Strongest | Strong if compiler-first type safety is prioritized | More workflow than current team requires | Strong formatting, heavier message-descriptor ceremony | Insufficient for long-term i18n |

## Candidate assessment

### i18next plus react-i18next

i18next has the most direct model for Temvia's protocol-driven errors. A caller can request an ordered list such as a specific field-code key followed by a generic validation fallback. Language and namespace fallbacks are part of its core resolution model. Resources can be imported as TypeScript `as const` values and registered through `CustomTypeOptions` so ordinary UI keys are checked and autocompleted.

The initial catalogs should be small bundled modules split into bounded namespaces such as `common`, `auth`, and `problems`. Do not add `i18next-http-backend`, remote save-missing behavior, or a translation SaaS. Runtime backend codes must pass through a centralized allowlisted mapping/fallback helper rather than arbitrary `t(code)` calls scattered across components.

### Paraglide JS

Paraglide has the strongest compiler-first experience: each message becomes a typed function, unused messages can be tree-shaken, and its Vite integration includes locale strategies. It is a credible alternative for a new Vite app.

Its trade-off here is structural rather than educational. It adds an inlang project, compiler plugin and generated module inventory. It also works best when keys are known at build time, while Temvia must translate runtime Problem Details codes. An explicit exhaustive code-to-message-function map solves that and is type-safe, but adds a second mapping layer to every protocol-code family. Its React-specific binding is much younger than the core compiler.

### Lingui

Lingui excels when source-message extraction, translator context, PO catalogs, rich JSX messages and a formal translation workflow are primary needs. It brings CLI/compiler/macro conventions that are not justified for the current self-maintained application and small bundled catalogs.

### React Intl / FormatJS

React Intl provides excellent ICU formatting and message descriptors with optional extraction tooling. Dynamic IDs are possible and global TypeScript augmentation can narrow known keys. For this project it has more descriptor/extraction ceremony than i18next while offering no stronger runtime problem-code fallback model.

### Project-owned dictionaries

Plain TypeScript objects plus native `Intl` can cover two languages initially. Once fallback chains, interpolation, plurals, lazy namespaces, rich text and locale changes appear, this becomes an application-owned i18n library. Avoid creating that maintenance surface.

## Recommendation

Choose **i18next plus react-i18next**, with bundled typed resources and no browser detector/backend plugin until the locale policy is explicitly selected.

Use stable semantic keys rather than English source text. A centralized problem translator maps known RFC 9457 types/codes to catalog keys and always provides a generic fallback. Tests assert that both initial catalogs have the same key shape and cover all known backend problem/field codes.

Do not let i18next return raw missing keys to end users in production. Unknown protocol codes resolve to an explicit localized generic message; development/test modes surface missing keys through assertions/logging without sending sensitive form values.

## Primary sources

- i18next TypeScript: <https://www.i18next.com/overview/typescript>
- react-i18next TypeScript: <https://react.i18next.com/latest/typescript>
- i18next translation resolution: <https://www.i18next.com/principles/translation-resolution>
- i18next fallback: <https://www.i18next.com/principles/fallback>
- react-i18next namespaces: <https://react.i18next.com/guides/multiple-translation-files>
- Paraglide JS overview: <https://paraglidejs.com/>
- Paraglide Vite integration: <https://paraglidejs.com/vite>
- Paraglide locale strategies: <https://paraglidejs.com/strategy>
- Lingui: <https://lingui.dev/>
- React Intl: <https://formatjs.github.io/docs/react-intl/>
- FormatJS message extraction: <https://formatjs.github.io/docs/getting-started/message-extraction/>
- npm package registry and download API: <https://www.npmjs.com/>
