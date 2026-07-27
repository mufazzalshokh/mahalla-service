# Foundation components

```mermaid
flowchart TB
  Main[Composition root] --> Config[Validated environment]
  Main --> HTTP[Fastify adapter]
  Main --> PG[PostgreSQL readiness adapter]
  HTTP --> Health[Health application service]
  PG -. implements .-> Probe[Readiness probe port]
  Health --> Probe
```

## Dependency rules

- `domain` imports no application, configuration, infrastructure or interface code.
- `application` imports domain code and declared ports, not concrete adapters.
- `infrastructure` does not import interface adapters.
- `interfaces` call application services and do not contain domain decisions.
- `main.ts` is the composition root and may wire all layers.

`scripts/check-boundaries.mjs` verifies these initial source-level constraints.
