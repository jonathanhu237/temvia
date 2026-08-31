# React icon-library comparison

Research snapshot: 2026-08-30.

## Candidates

| Candidate | Visual model | Strength | Cost for Temvia |
| --- | --- | --- | --- |
| Lucide React | Consistent 24-unit outline icons, normally 2px stroke | shadcn/ui default/current CLI support, broad set, direct typed components, tree shaking | Outline-only default style is less expressive than multi-weight families |
| Tabler Icons React | Large 24-unit outline family | Broad coverage, adjustable stroke, tree-shakable ESM | Very similar to Lucide without a shadcn-specific advantage |
| Phosphor React | Six weights including fill and duotone | Strong expressive range and state variants | More visual choices to govern; thousands of modules can affect development imports if used carelessly |
| Radix Icons | Compact 15-unit UI icon family | Matches compact controls and Radix primitives | Legacy choice in current shadcn CLI and narrower product-icon coverage |
| Heroicons | Tailwind-aligned outline and solid families | Polished common application icons | Smaller coverage and no advantage over shadcn's selected default |
| React Icons aggregator | Many upstream families behind one package | Maximum coverage | Makes mixed visual languages and import/bundle mistakes easier |

## Recommendation

Choose **Lucide React** and set shadcn `components.json` to `iconLibrary: "lucide"`.

This keeps generated shadcn components and application code on one icon vocabulary. Import concrete named components so Vite includes only used icons; do not use a dynamic all-icons loader or add a second general-purpose icon package for one missing glyph.

## Usage policy

- Use icons to reinforce labels, hierarchy and familiar controls, not to decorate every line.
- Keep text labels on primary actions such as setup, login, logout and retry.
- Decorative icons receive `aria-hidden="true"` and cannot be the only carrier of status/error meaning.
- Icon-only controls require an accessible name, visible focus state, adequate hit target and usually a localized tooltip; the tooltip does not replace `aria-label`.
- Use consistent control sizes (normally 16–20 CSS pixels) and the library's default stroke unless the design system defines a specific token.
- Status must also use text and/or color-independent shape; do not communicate success/error only through green/red icons.
- Brand marks and the Temvia logo are product assets, not substitutions from a generic icon set.
- Directional icons must be reviewed if RTL locales are added later; initial `zh-CN` and `en` are LTR.

## Primary sources

- shadcn icon-library CLI support: <https://ui.shadcn.com/docs/cli>
- shadcn Lucide default announcement: <https://ui.shadcn.com/docs/changelog/2024-11-icons>
- Lucide React: <https://lucide.dev/guide/react>
- Tabler Icons React: <https://github.com/tabler/tabler-icons/tree/main/packages/icons-react>
- Phosphor React: <https://github.com/phosphor-icons/react>
- Radix Icons: <https://www.radix-ui.com/icons>
- Heroicons: <https://heroicons.com/>
