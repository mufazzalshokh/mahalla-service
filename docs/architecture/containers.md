# Container architecture

```mermaid
flowchart LR
  TG[Telegram] --> APP[MCK application container]
  APP --> TG
  APP --> PG[(PostgreSQL 17)]

  subgraph APP[MCK application container]
    RB[Resident bot adapter]
    SB[Staff bot adapter]
    HTTP[HTTP health/API adapter]
    UC[Application use cases]
    DM[Domain modules]
    OW[Outbox poller]
  end
```

CP-01 implements only the HTTP health/API foundation and PostgreSQL readiness
adapter. Telegram adapters and the outbox behavior arrive in their assigned
checkpoints.

One application container and PostgreSQL instance are sufficient for the pilot.
Production backup data must leave the host; the Compose volume is not a backup.
