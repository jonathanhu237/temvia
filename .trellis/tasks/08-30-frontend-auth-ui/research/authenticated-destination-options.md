# Authenticated destination options

Research snapshot: 2026-08-30.

## Repository evidence

- Temvia scaffolds a generic Go backend and React admin; the generator does not currently accept or substitute a product display name.
- The implemented backend exposes only setup status, setup completion, login, current user and logout. It exposes no business metrics, activity feed, resource counts, role model, profile mutation or infrastructure-detail endpoint.
- Account management and general dashboard features are explicitly outside this frontend milestone.
- TanStack Router's agreed structure has public setup/login routes and a pathless authenticated parent, so an authenticated index route can be added without inventing a permanent product information architecture.

## Options

| Option | Honest content available now | Advantage | Cost |
| --- | --- | --- | --- |
| Minimal protected home at `/` | Current administrator identity, authenticated state, language and logout | Proves the entire auth lifecycle and leaves later information architecture open | Intentionally sparse until product modules exist |
| Dashboard shell at `/dashboard` | Mostly placeholder cards/sidebar items | Looks more like a conventional admin immediately | Invents navigation and fake metrics with no backend contract; creates cleanup work later |
| Account page at `/account` | Current name/email and logout | Uses real data only | Implies profile/account management that this milestone cannot perform and is an odd universal post-login destination |

## Accepted direction

Use a minimal protected index page at `/`, internally named `home`, below the pathless authenticated parent. The user selected an official shadcn/ui Sidebar shell with an intentionally sparse main page rather than a header-only shell.

The Sidebar is infrastructure for future modules, not permission to invent them. Initially it should contain only real controls and destinations:

- its header carries the Temvia/admin identity;
- its content has one active Home item;
- its footer exposes the current user and the agreed language/logout actions;
- its trigger remains available in the main-page header and on mobile.
- There are no fabricated metrics, charts, activity items, health claims, disabled navigation items or empty sidebar.
- Logout `503` remains visible and retryable on the current page; the UI must not claim the session ended before the backend confirms it.
- `/` is the post-login and post-authentication destination. Later product work may turn it into a real dashboard or redirect it to a first module without changing the setup/login contract.

The official component already separates `SidebarHeader`, scrollable `SidebarContent`, `SidebarFooter`, `SidebarInset`, `SidebarTrigger` and provider-owned responsive/collapse state. Use those primitives rather than copying an entire dashboard block with demo content.

## Remaining shell decision

Recommended treatment:

- `variant="inset"` so the main page reads as a distinct work surface rather than a border-to-border demo;
- `collapsible="icon"` on desktop so future navigation can retain a compact rail, while the component supplies its mobile off-canvas behavior;
- one active Home item with a Lucide home icon and localized label;
- a main header with the official `SidebarTrigger`, separator and localized Home title;
- beneath it, only a quiet welcome sentence using the current administrator's name. A literally empty white region can be mistaken for a loading/render failure, whereas one sentence makes the intentional state clear without pretending to have dashboard data.

Alternatives are a regular edge-attached `variant="sidebar"`, which is visually plainer, or `collapsible="none"`, which is simpler but removes useful small-screen/desktop behavior from the shell we are deliberately establishing.

This page is an authenticated-shell proving ground, not a claim that Temvia already has dashboard functionality. Keeping it small makes responsive, focus and localization review meaningful without locking the reusable template into an unsupported information architecture.

Primary source: <https://ui.shadcn.com/docs/components/radix/sidebar>
