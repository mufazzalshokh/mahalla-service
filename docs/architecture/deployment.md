# Pilot deployment baseline

```mermaid
flowchart TB
  Internet[Telegram network] -->|outbound long polling connection| Host
  Operator[MCK technical operator] --> Host

  subgraph Host[Single low-cost Linux host]
    App[MCK application container]
    DB[(PostgreSQL container + persistent volume)]
    App --> DB
  end

  DB -->|daily encrypted backup| Backup[Off-host backup destination]
```

The demonstration may run on a developer computer with synthetic data. A paid pilot
requires a dedicated host, restart policy, restricted management access, persistent
storage, off-host backups, restore verification and alert ownership.

Long polling avoids public application ingress. Health endpoints bind to localhost
in the supplied Compose configuration.
