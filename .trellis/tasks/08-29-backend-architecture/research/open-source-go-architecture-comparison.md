# Current Open-Source Go Backend Architecture Comparison

Researched: 2026-08-30. Scope: current public repository structure and maintainers' own architecture guidance for several mature Go server projects. Popularity and longevity made these useful examples, but do not make any one architecture correct for Temvia. Repository default branches continue to change; the linked source reflects the inspected state rather than a permanent contract.

## Comparison

| Project | Observed structure | Architectural character | Relevant lesson |
| --- | --- | --- | --- |
| Miniflux | `internal/api`, `internal/model`, `internal/storage`, plus focused technical/feature packages | Deliberately simple layered monolith. API handlers frequently call the concrete store and validators directly; there is no universal application-service layer. | A well-maintained product can remain direct when its team deliberately values a small dependency and operational surface. This design accepts more handler orchestration and transport/storage proximity. |
| Gitea | Top-level `routers`, `services`, `models`, and `modules`; service and model subpackages are grouped by features such as `auth`, `user`, and `repository` | Large pragmatic layered monolith. It retains recognizable Handler/Service/Model-Repository roles but has hybrid dependencies accumulated over a long product history. | HSR remains viable at scale, but global technical layers grow large and feature changes can span several top-level trees. Mature code is evolutionary rather than a pristine textbook diagram. |
| Mattermost | REST handlers under `api4`, application logic under `app`, storage contracts/implementations under `store`, and shared models | HSR/application-service architecture with gradual feature-oriented services. A current `TeamService` receives store contracts and small collaborator interfaces through a constructor. | This is the closest precedent for retaining familiar layers while narrowing dependencies. Its source also contains migration TODOs, showing that boundaries are refined incrementally as the system grows. |
| Grafana | `pkg/api` for HTTP, `pkg/services/<domain>` for business logic, `pkg/infra` and `sqlstore` for infrastructure, and `pkg/server` for Wire dependency injection | Domain-grouped services inside a large layered/modular monolith, with multiple old and new patterns coexisting. Grafana is moving core resources toward a resource-oriented Apps/Unified Storage design while legacy APIs remain. | Large products do not freeze one architecture. Domain grouping and explicit composition help, but generated DI and resource/schema platforms are costs justified by Grafana's scale and extension model, not starter defaults. |
| ZITADEL | Presentation/API, service/domain logic, repositories/storage, commands and query paths; current target guidance combines hexagonal architecture and repository/command patterns | The strongest DDD/hexagonal example in this set. ZITADEL historically used Event Sourcing and CQRS extensively, while current repository guidance says it is moving state changes to relational tables and retaining events for history/audit. | Rich domain modeling fits a multi-tenant identity platform with hierarchy, policy, authorization, and audit requirements. CQRS/Event Sourcing add real operational and mental cost; even ZITADEL is revising parts of that design for scalability, developer experience, and simplicity. |

## Primary Sources

### Miniflux

- [Repository and stated technical approach](https://github.com/miniflux/v2): PostgreSQL-only, no ORM or complicated framework, limited dependencies, single binary.
- [`internal` package tree](https://github.com/miniflux/v2/tree/main/internal): separate API, model, storage, validation, worker, UI, and integration packages.
- [User API handlers](https://github.com/miniflux/v2/blob/main/internal/api/user_handlers.go): handlers perform authorization/validation and call `h.store` methods directly, demonstrating the deliberately direct structure rather than an inferred service layer.

### Gitea

- [Repository root](https://github.com/go-gitea/gitea): top-level `routers`, `services`, `models`, and `modules` trees.
- [`services` tree](https://github.com/go-gitea/gitea/tree/main/services): business operations grouped into feature subpackages.
- [Web router composition](https://github.com/go-gitea/gitea/blob/main/routers/web/web.go): router code imports both model and service packages, evidence of a pragmatic layered system rather than strict Clean Architecture isolation.
- [`services/auth`](https://github.com/go-gitea/gitea/tree/main/services/auth) and [`models/auth`](https://github.com/go-gitea/gitea/tree/main/models/auth): the same feature spans global technical layers.

### Mattermost

- [`server/channels` tree](https://github.com/mattermost/mattermost/tree/master/server/channels): API, app, store, jobs, and supporting packages.
- [Feature `TeamService`](https://github.com/mattermost/mattermost/blob/master/server/channels/app/teams/service.go): constructor-injected stores, a consumer-sized `Users` interface, and a TODO to replace a direct channel-store dependency with a channel service.
- [API handler importing the app layer](https://github.com/mattermost/mattermost/blob/master/server/channels/api4/access_control.go): concrete evidence of the API-to-application direction.

### Grafana

- [Current repository architecture map](https://github.com/grafana/grafana/blob/main/AGENTS.md#architecture): `pkg/api`, domain-grouped `pkg/services`, `pkg/server` Wire setup, and `pkg/infra`.
- [Database guidance](https://github.com/grafana/grafana/blob/main/contribute/backend/database.md): services use the SQL store abstraction; older registered SQL-store handlers are being deprecated in favor of direct `SQLStore` use within services.
- [Kubernetes-inspired backend architecture](https://github.com/grafana/grafana/blob/main/contribute/architecture/k8s-inspired-backend-arch.md): documents the migration from inconsistent legacy APIs toward versioned resource APIs, Apps, and Unified Storage.

### ZITADEL

- [Current repository guide](https://github.com/zitadel/zitadel/blob/main/AGENTS.md): backend domain/service logic under `internal`; current transition toward relational state with events retained for audit rather than as the system of record.
- [Relational software architecture](https://github.com/zitadel/zitadel/wiki/Software-Architecture): presentation, service/domain logic, repository/storage layers, and the intended hexagonal boundary.
- [Architecture decision log](https://github.com/zitadel/zitadel/wiki/Decision-Log#architectural-patterns-of-service-layer): records the move away from the previous event-driven source-of-state design because of linear scalability issues and names extendability, developer experience, and pattern simplicity as decision drivers; the target combines hexagonal, repository, command, and related patterns.
- [Published Event Sourcing/CQRS architecture description](https://zitadel.com/docs/concepts/architecture/software): useful historical/current-product context, but it must be read alongside the newer repository transition guidance above.

## Cross-Project Findings

### HSR and DDD Are Not Exclusive

Handler/Service/Repository describes the request and dependency roles. DDD describes how business meaning is modeled: bounded contexts, aggregates, value objects, invariants, domain services, and ubiquitous language. A DDD-oriented application can still execute:

```text
Handler -> Application Service -> Domain Model -> Repository
```

Mattermost and Grafana retain service/storage layers while grouping logic by business area. ZITADEL explicitly combines domain logic, repositories, and a hexagonal dependency boundary. Moving from HSR to DDD does not require deleting handlers, services, or repositories; it changes what belongs in the service and model and where the interfaces point.

### Textbook Clean Architecture Is Not the Common Denominator

None of the inspected projects consistently mirrors four Clean Architecture rings across its entire current tree. They preserve useful parts—transport separation, service/domain logic, storage abstractions, composition—but mix them according to product age and scale. The common behavior is explicit boundaries around important logic, not identical directory names.

### Architecture Evolves with the Domain

- Miniflux can keep handlers close to storage because its product and maintenance style prioritize minimalism.
- Gitea shows the familiarity and long-term sprawl of global technical layers.
- Mattermost and Grafana add feature services and explicit dependency construction as collaboration and feature count grow.
- ZITADEL justifies richer domain/command/repository patterns with multi-tenancy, policy, authorization, and audit, while also demonstrating that sophisticated CQRS/Event Sourcing choices can later become scalability and developer-experience constraints.

Copying the most sophisticated project would copy costs without copying its domain pressure.

## Candidate Direction for Temvia

The evidence supports a DDD-informed HSR rather than either extreme:

```text
HTTP Handler
    -> Application Service / use case
        -> small domain model and invariants
        -> repository/store interfaces
            <- PostgreSQL and Redis implementations
```

For the first milestone:

- Use domain language for `Account`, canonical `Email`, `SetupState`, and session lifetime rules where those values have real invariants.
- Let application services orchestrate `IssueSetupLink`, `CompleteInitialSetup`, `Login`, `Authenticate`, and `Logout`.
- Keep HTTP parsing/cookies in handlers and SQL/Redis mechanics in repository/store implementations.
- Express initial-administrator creation plus setup closure as one atomic repository capability rather than exposing a generic transaction.
- Do not introduce CQRS, Event Sourcing, a domain-event bus, generic aggregate framework, separate read models, or DTO copies at every internal hop without a concrete requirement.

The user accepted this combined architectural baseline under R63: modular monolith, DDD-informed HSR, and Hexagonal ports/adapters at external boundaries, without CQRS/Event Sourcing ceremony. Exact business-module boundaries and directories remain unresolved, and R63 does not authorize implementation.
