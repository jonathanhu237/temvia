# First-Administrator Initialization Across Open-Source Projects

Researched: 2026-08-29. Scope: default self-hosted interactive setup documented by each project, supplemented by targeted source inspection. No projects were deployed, no attack was attempted, and no technology choice for Temvia is approved by this research.

## Evidence and Version Limits

- Documentation URLs are live and may change. Source checks for Strapi, Payload, and PocketBase are pinned below to the commit returned by each repository's branch endpoint at inspection time.
- A development-branch commit is not proof that the same implementation has shipped in every stable release. Use the release chosen for implementation if reproducing a project's behavior later.
- Initial-administrator authorization, a subsequent invitation token, a login session token, an encryption/signing secret, and a commercial license key are different mechanisms.
- A short-lived installer credential is not necessarily a strictly single-use token. Do not infer one-use consumption merely from expiration or a setup link.

## Comparison

| Project | Separate deployment-side credential in the examined setup flow? | Observed behavior and limits |
| --- | --- | --- |
| Strapi 5 | No | The documented first-local-admin flow opens a browser form. The inspected registration route is unauthenticated, with rate limiting. First-admin creation checks for existing administrators inside a transaction with a stable role-row lock; this controls repeated/concurrent creation but does not identify the deployment owner. |
| Payload | No in the default local-auth flow examined | Provides a create-first-user page. The inspected operation checks that the configured auth collection has no existing qualifying user, creates the user, and logs them in. Collection hooks/configuration can customize behavior. Do not claim a universal independent setup-completion flag or concurrency guarantee from this inspection. |
| Portainer CE | No in the documented browser flow | The first visitor to setup supplies the administrator username and password. Official documentation describes a five-minute initialization timeout, after which the server stops listening until manually restarted. Timeout narrows exposure but does not establish visitor identity. CLI-supplied initial credentials are an alternative. |
| PocketBase | Yes, via an installer link rather than a manually entered extra field | Official docs describe an automatically opened installer link. Inspected source creates a 30-minute auth token for a temporary system superuser and places it in the URL fragment. A CLI superuser creation route is also documented. This establishes a server-side credential channel; do not label the token strictly single-use based only on this code. |
| Jenkins | Yes, via the initial administrator password | The default setup wizard first requires the generated password from server logs or the initialAdminPassword file, then allows creating the administrator. The documented password can remain the default admin account password if user creation is skipped, so it is not always a separately consumed one-time setup token. |

## Primary Sources

### Strapi

- [Strapi 5 quick start, first local administrator](https://docs.strapi.io/cms/quick-start): the documented form-based flow has no extra installation credential.
- Branch inspected: `main`, commit `24e24e75254b196526d6146a7fa7c65cde682384`.
- [Registration route](https://github.com/strapi/strapi/blob/24e24e75254b196526d6146a7fa7c65cde682384/packages/core/admin/server/src/routes/authentication.ts#L19): `POST /register-admin`, `auth: false`, and the rate-limit middleware.
- [First-admin creation](https://github.com/strapi/strapi/blob/24e24e75254b196526d6146a7fa7c65cde682384/packages/core/admin/server/src/services/user.ts#L91): transaction, role-row lock, existing-admin check, and creation of an active super administrator.
- A search also surfaced an older issue alleging missing rate limiting and a registration race. It is not evidence of the inspected implementation: current inspected source includes both a limiter and serialized creation. No unverified vulnerability claim is carried into this comparison.

### Payload

- [Admin panel documentation](https://payloadcms.com/docs/admin/overview): documents the createFirstUser view and configurable authentication collection.
- Branch inspected: `main`, commit `72ee1751b153bd1cf9e44a7fad85563fa3f57b4e`.
- [First-user operation](https://github.com/payloadcms/payload/blob/72ee1751b153bd1cf9e44a7fad85563fa3f57b4e/packages/payload/src/auth/operations/registerFirstUser.ts#L30): no separate installation-token check in this default operation; existing-user check, creation, and login.

### Portainer CE

- [Initial setup](https://docs.portainer.io/start/install-ce/server/setup): create an administrator directly in the setup form. The Business Edition license key is not an initialization ownership credential.
- [Official API example](https://docs.portainer.io/api/examples): initializes the administrator with Username and Password before ordinary authentication.
- [Five-minute initialization timeout](https://docs.portainer.io/faqs/installing/i-just-installed-portainer-but-i-cant-access-the-ui-how-do-i-fix-this): documents the stop-listening and manual-restart behavior. Browser-tool direct opens intermittently failed; the official documentation was available through indexed search content.
- [CLI configuration](https://docs.portainer.io/advanced/cli): documents preconfiguring the initial administrator password via command-line/file options.

### PocketBase

- [Getting started](https://pocketbase.io/docs/): installer link and CLI alternative.
- [Production guide](https://pocketbase.io/docs/going-to-production/): installation link available through server logs, with CLI alternative.
- Branch inspected: `master`, commit `bc8ffed4e7265a70a6e8de76c0b0b48b945e19ef`.
- [Installer source](https://github.com/pocketbase/pocketbase/blob/bc8ffed4e7265a70a6e8de76c0b0b48b945e19ef/apis/installer.go#L18): short-lived system-superuser token, 30-minute duration, URL fragment, and browser launch. Installation is only offered when no non-installer superuser is found and the query succeeds.

### Jenkins

- [Official Docker installation: unlocking Jenkins and creating the first administrator](https://www.jenkins.io/doc/book/installing/docker/#unlocking-jenkins): explicitly requires the generated server-side password before setup, and describes the behavior when administrator creation is skipped.

## Implications for Temvia: Recommendations, Not Decisions

- There is no universal extra-key requirement across these projects. The previous suggestion of a separate setup key was one security design option, not an industry-wide convention.
- Preserve the requested web form; decide whether initialization takes place on a controlled local/private path or an already publicly reachable instance before selecting protection.
- For controlled-access setup, a no-extra-key form can offer the desired Strapi-like experience. Access restriction must be real and deployment-enforced, not inferred merely because the application sees a loopback reverse proxy or a localhost URL in documentation.
- For publicly exposed uninitialized instances, consider a server-issued short-lived installer link or another explicit ownership proof. An auto-opened link can reduce manual steps, but requires its own credential handling and invalidation design.
- Existing-user checks, database locks, completed-setup flags, and rate limits address different problems from establishing deployment ownership. A timeout also does not prove ownership.
- Infrastructure recommendations require individual discussion and acceptance. See `../prd.md` for authoritative accepted choices and remaining questions; this comparison does not independently authorize any selection.

## Follow-up: Both Private and Public Deployment Are Expected

The user clarified that either network environment is possible. Based on that requirement, the assistant recommended one consistently protected default: a deployment-issued, short-lived initialization link, preserving the requested administrator-information form without a separate manual key field. On 2026-08-29, after clarifying the flow, the user accepted this experience. The authoritative behavior is now R11 in `../prd.md`; detailed protocol choices and implementation are not approved.

The accepted behavior authorizes successful initialization only once, with durable setup completion preventing reuse or reopening after restart. R59 defines one current 32-byte token, digest-only PostgreSQL storage, a configurable 30-minute initial lifetime, URL-fragment transport/cleanup, and atomic consumption with setup completion. R62 supersedes the earlier command trigger: after explicit migration, the generated project's ordinary API startup issues the link to deployment logs when setup remains incomplete; restarting replaces it, while completed setup prevents all later issuance. Temvia remains a generator and adds no runtime command. An installation link is itself a sensitive credential; it must not be publicly discoverable or treated as a harmless shareable URL. Exact public-origin validation, TTL bounds, persistence schema, multi-instance startup behavior, and endpoint contracts still require design review.

Do not infer that no credential is needed from an internal-looking address or the address of a reverse proxy. The accepted default does not add automatic public/private detection or a bypass mode. Compared with a direct anonymous setup form, the operator may need to copy a link from the server console once; this UX trade-off was presented before approval.
