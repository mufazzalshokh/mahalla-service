# Pilot deployment baseline

```mermaid
flowchart TB
  Telegram[Telegram API] <-->|outbound HTTPS long polling| App
  Operator[MCK deployment operator] -->|restricted SSH| Host
  Monitor[Host cron monitor] -->|fixed alert to private chat| Telegram

  subgraph Host[Single buyer-funded Linux VPS]
    Loopback[127.0.0.1 health and metrics] --> App[MCK application container]
    Migrate[One-shot migration container] --> DB[(PostgreSQL 17 + named volume)]
    App -->|internal Docker network| DB
    Cron[Daily backup job] -->|pg_dump + GPG| Encrypted[Encrypted artifact + SHA-256]
    DB --> Cron
  end

  Encrypted -->|operator-approved transfer| Backup[Buyer-controlled off-host destination]
```

The demonstration may run on a developer computer with synthetic data. A paid pilot
requires a dedicated host, restart policy, restricted management access, persistent
storage, off-host backups, restore verification and alert ownership.

Long polling avoids public application ingress. Health endpoints bind to localhost
in the supplied Compose configuration.

`compose.production.yaml` additionally uses digest-pinned base/database images, read-only application
filesystems, dropped Linux capabilities, `no-new-privileges`, bounded local logs/resources, an
internal database network, file-mounted secrets and an immutable Git release identifier. PostgreSQL
enforces one active Telegram consumer process. The local Compose file remains development-only.
