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

The same application process hosts the HTTP health adapter, both long-polling Telegram adapters,
the PostgreSQL outbox poller, and the operational scan timer. Database leases, row locks, and an
advisory scan lock make overlapping workers safe, although one process remains the pilot default.

One application container and PostgreSQL instance are sufficient for the pilot.
Production backup data must leave the host; the Compose volume is not a backup.
