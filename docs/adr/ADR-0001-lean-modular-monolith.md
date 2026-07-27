# ADR-0001: Lean TypeScript modular monolith

- Status: Accepted for CP-01
- Date: 2026-07-27

## Context

MCK needs a sell-first Telegram pilot with near-zero initial infrastructure cost,
but the eventual product may add web, operator, payment and municipal channels.
The greenfield repository provides no existing stack constraint.

## Decision

Use strict TypeScript on Node.js 24 LTS with Fastify, grammY, PostgreSQL, Drizzle,
Zod, Pino-compatible Fastify logging and Vitest. Begin with one package and one
deployable modular-monolith process.

Code dependency direction is:

```text
interfaces → application → domain
infrastructure → application/domain ports
composition root → all required adapters
```

Telegram handlers and HTTP routes may translate input and output but may not own
business rules. A local boundary-check script enforces forbidden imports.

## Consequences

- one runtime and deployment minimize cost;
- strict internal boundaries preserve future extraction options;
- the team must keep adapters out of domain/application modules;
- independent scaling is deferred until measurements justify it.
