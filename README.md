# Mahalla Service

Telegram-first order portfolio and service-management platform for a Mahalla
Service Company (MCK).

The repository is delivered checkpoint by checkpoint. CP-00 through CP-11 are approved. Real-data
go-live still requires the completed production-readiness checklist and separate authorization.

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

The paid-pilot package uses the separate hardened `compose.production.yaml`. See the
[production deployment runbook](docs/runbooks/production-deployment.md) and
[production-readiness checklist](docs/runbooks/production-readiness-checklist.md).

## Quality gates

```powershell
pnpm.cmd check
pnpm.cmd test:coverage
pnpm.cmd audit --audit-level high
```

Never commit `.env`, bot tokens, passwords, private resident data or production
exports.
