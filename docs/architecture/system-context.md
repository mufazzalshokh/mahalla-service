# Initial system context

This context is intentionally small. Container and component diagrams are CP-01/02
deliverables after the foundation and domain boundaries are approved.

```mermaid
flowchart TB
  Resident[Resident] -->|submits and tracks requests| Telegram[Telegram platform]
  Staff[Operator / executor / administrator] -->|authorized staff commands| Telegram
  Telegram -->|long-polling updates| MCK[MCK Telegram service-management system]
  MCK -->|messages and status notifications| Telegram
  MCK -->|transactional records| PG[(PostgreSQL)]
  Manager[MCK manager] -->|weekly summary request| MCK
  MCK -->|summary / CSV| Manager

  Future[Future web, payment, municipal and storage systems] -. feature-flagged later .-> MCK
```

## Trust boundaries

- Telegram update content is untrusted external input.
- A Telegram account is not staff until explicitly linked to an approved staff
  record.
- The resident and staff bots use separate tokens and command surfaces.
- Authorization is checked by application services for every sensitive command.
- PostgreSQL is the authoritative store for workflow, audit and idempotency.
- Telegram-hosted pilot photos are supporting material, not independent contractual
  storage.

## Core internal boundaries

```mermaid
flowchart LR
  Bot[Telegram adapters] --> App[Application use cases]
  API[HTTP/health adapter] --> App
  App --> Domain[Domain policies and state machines]
  App --> Ports[Repository/provider ports]
  Ports --> DB[PostgreSQL adapters]
  Ports --> TG[Telegram notification adapter]
  Domain -. no framework dependencies .- Domain
```

The bot remains thin because conversation navigation, Telegram callbacks and update
delivery are channel concerns. Validation, authorization, idempotency, priority,
state transitions, audit and notification intent belong to reusable application or
domain services so future channels cannot bypass them.
