# Mahalla Service

Telegram-first order portfolio and service-management platform for a Mahalla
Service Company (MCK).

The repository is being delivered checkpoint by checkpoint. CP-01 establishes the
engineering foundation only; resident intake and operational workflows are later
checkpoints.

## Prerequisites

- Node.js 24 LTS
- pnpm 10.33
- Docker with Docker Compose

## Quick start

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm.cmd install
pnpm.cmd dev
```

Then inspect:

- `GET http://127.0.0.1:3000/health` for process liveness;
- `GET http://127.0.0.1:3000/ready` for PostgreSQL readiness.

See [local development](docs/runbooks/local-development.md) and the
[documentation index](docs/README.md) for details.

## Quality gates

```powershell
pnpm.cmd check
pnpm.cmd test:coverage
pnpm.cmd audit --audit-level high
```

Never commit `.env`, bot tokens, passwords, private resident data or production
exports.
