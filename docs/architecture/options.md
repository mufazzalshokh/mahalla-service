# Initial architecture options

Status: proposed for approval in CP-00. A formal ADR will be created in CP-01.

## Constraints driving the decision

- near-zero pre-sale budget;
- one low-volume Telegram pilot;
- empty greenfield repository;
- future API and web channels;
- strong transaction, audit, idempotency and authorization requirements;
- no demonstrated need for independent service scaling.

## Option A — lean TypeScript modular monolith (recommended)

Stack: TypeScript, Fastify, grammY, PostgreSQL, Drizzle, Zod, Pino and Vitest.

One process hosts the API/health adapter, resident bot, staff bot and an outbox poller.
Modules expose application ports and do not import Telegram objects into domain code.

Advantages:

- smallest operational and code footprint that still supports strict contracts;
- one language can later be shared with a web administration client;
- inexpensive long-polling deployment;
- direct PostgreSQL control for uniqueness and concurrency invariants.

Costs:

- module rules need architectural tests/review rather than a heavyweight framework;
- one process is a pilot availability boundary;
- Drizzle must remain behind repository interfaces.

## Option B — NestJS modular monolith

Stack: TypeScript, NestJS/Fastify, grammY, PostgreSQL and an ORM adapter.

Advantages:

- strong module, dependency-injection, authorization and OpenAPI conventions;
- easier onboarding for a larger backend team;
- straightforward later separation into multiple applications.

Costs:

- more framework structure and integration code than the paid hypothesis currently
  needs;
- higher initial implementation surface for a one-process pilot.

Choose this option when a larger team or a substantial administrative API is funded.

## Option C — Python FastAPI modular monolith

Stack: Python, FastAPI, aiogram, SQLAlchemy/Alembic, PostgreSQL and pytest.

Advantages:

- mature Telegram and API ecosystem;
- natural fit if near-term AI/data processing becomes a core differentiator;
- productive for a Python-heavy team.

Costs:

- no current repository/team evidence favors Python;
- future TypeScript web clients require generated/shared contracts rather than one
  language;
- domain/module conventions need deliberate enforcement.

## Decision

Proceed with Option A for CP-01, subject to `APPROVE CP-00`. Keep the domain and
application boundaries framework-independent so Option B or a later extraction does
not require rewriting business rules.

## Explicitly rejected for the pilot

- microservices;
- serverless functions per bot command;
- SQLite followed by a later production database migration;
- Redis-backed conversation state before a measured need;
- Kafka or a general message broker;
- Kubernetes;
- event sourcing;
- an AI agent making priority or authorization decisions.
