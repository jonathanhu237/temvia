# Visual-direction options

Research snapshot: 2026-08-31.

Status: deliberately deferred by the user as non-essential to this milestone. Implementation will use a restrained neutral shadcn theme, semantic tokens and platform font stacks. The candidates below remain research only and do not authorize a custom visual theme.

## Product evidence

- Temvia is a developer-facing scaffolder that generates a long-lived generic admin, not a finished vertical SaaS brand.
- The first screens have precise jobs: establish the first administrator, log in, and expose a sparse authenticated shell.
- Simplified Chinese and English must both remain readable. There is no existing Temvia logo, brand palette, illustration system or font contract to preserve.
- The selected shadcn Sidebar creates a recognizable application structure; the rest of the design needs enough subject-specific character to avoid looking like an untouched component demo.

## Candidate directions

### A. Blueprint precision — recommended

A light, drafting-inspired work surface: cool paper background, deep ink text, blueprint blue as the primary action/focus color, thin structural rules, moderate 8–10px radii, and restrained shadows. A faint modular grid or registration-line detail appears only on the public setup/login canvas and the product mark area; application content stays quiet.

Why it belongs to Temvia: scaffolding is the act of creating structure. The visual language can echo plans, alignment and construction without turning the interface into a literal blueprint illustration.

Likely typography: platform UI sans for bilingual body copy, with platform monospace used sparingly for technical microcopy or the wordmark. Theme and font delivery remain separate decisions.

Risk: if grid lines and technical labels are overused, it becomes decorative noise. Spend the signature on the auth canvas and keep the authenticated shell disciplined.

### B. Dark developer console

A dark navy/graphite interface with green or cyan signal accents and more monospace typography.

Advantage: immediately communicates a developer-tool mood and works well in low light. Cost: it is now a common coding-product/AI-interface default, makes setup feel more severe, and requires greater care around form autofill, muted text and error contrast. The local design-system search suggested this direction, but it is not sufficiently specific to Temvia on its own.

### C. Neutral shadcn utility

Use the stock zinc/neutral visual system with minimal customization, system fonts and ordinary cards.

Advantage: smallest styling surface and easiest future replacement. Cost: setup, login and the sidebar would read like a generic shadcn example; it gives up the chance to establish even a lightweight Temvia identity.

## Self-critique of the recommendation

The familiar generic response for an admin is neutral cards with an indigo button. Blueprint precision changes only elements that have a reason to change:

- structural rules and alignment cues refer to scaffolding;
- the technical motif stays outside dense form/content surfaces;
- actions still use standard shadcn semantics and readable labels;
- no fake terminal window, glowing gradient, glassmorphism, arbitrary dashboard statistics or continuous animation is introduced.

Motion should remain limited to component state transitions and a short initial auth-surface reveal, with reduced-motion respected. The design should remain credible when all decorative lines are removed; the motif is a signature, not a layout dependency.
