# Mahalla Service

[![CI](https://github.com/mufazzalshokh/mahalla-service/actions/workflows/ci.yml/badge.svg)](https://github.com/mufazzalshokh/mahalla-service/actions/workflows/ci.yml)

Telegram-first request, order and service-quality management for a Mahalla Service Company (MCK).
Residents submit an issue in Uzbek or Russian through a simple button flow. Authorized staff validate,
prioritize, assign, complete and inspect the work from a separate staff bot. Managers receive live
reports, complaint control, PDCA actions and an operational finance ledger without buying a separate
mobile application.

CP-00 through CP-11 are approved and the first paid-pilot package is deployment-ready. Real resident
data is still prohibited until the production-readiness checklist is completed and go-live is
separately authorized.

## What the pilot demonstrates

| User             | Main experience                                                                                             | Result                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Resident         | Bilingual guided request, location/address, urgency, preferred one-hour visit window and up to three photos | Trackable `MCK-...` ticket                           |
| Operator/manager | Validation, duplicate review, priority, registration, assignment, quality, complaints and staff access      | Controlled `ORD-...` lifecycle with audit history    |
| Executor         | Assigned-work queue, acceptance, BEFORE/AFTER evidence, progress, blockers and completion                   | Visible accountability and SLA evidence              |
| MCK owner        | Weekly/monthly report, CSV, PDCA and optional pilot finance records                                         | One operational portfolio instead of scattered chats |

Resident intake and routine staff operations are button-first. Short text commands remain available
for support and resident aftercare such as acceptance, warranty, rating and complaints.

## Fast customer demonstration

Use synthetic names, phone numbers, addresses, photos and amounts. The recommended 15-minute story is:

1. A resident creates a plumbing request and receives an `MCK-...` number.
2. An operator validates it, checks duplicates and priority, then creates an `ORD-...` order.
3. The operator assigns an executor; the executor accepts, records evidence and completes the work.
4. The operator completes the checklist; the resident accepts and rates the work.
5. The owner opens the weekly report to show backlog, timeliness and quality in one place.

Follow the complete [customer demonstration guide](docs/runbooks/customer-demo.md). It includes the
exact buttons, expected codes, Uzbek/Russian sales script, troubleshooting and honest pilot limits.

## Prerequisites

- Node.js 24 LTS
- pnpm 10.33
- Docker Desktop with Docker Compose
- Two separate Telegram bots created with BotFather
- Ideally three Telegram accounts for the resident, operator and executor roles

## First-time local setup — Git Bash

Open Docker Desktop and wait until its engine is running. Then:

```bash
cp .env.example .env
notepad .env
```

Set these local values without sharing the tokens:

```dotenv
RESIDENT_BOT_ENABLED=true
RESIDENT_BOT_TOKEN=<resident BotFather token>
STAFF_BOT_ENABLED=true
STAFF_BOT_TOKEN=<different staff BotFather token>
AUTOMATION_ENABLED=true
AUTOMATION_POLL_SECONDS=30
```

If port `5432` is occupied, use the same alternative port in both settings. This workspace currently
uses `55483`:

```dotenv
POSTGRES_PORT=55483
DATABASE_URL=postgresql://mck:mck_local_only@127.0.0.1:55483/mck
```

Start and prepare the application:

```bash
docker compose up -d postgres
docker compose ps
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Keep that terminal open. Successful startup includes PostgreSQL readiness plus messages that resident
and staff long polling started. Only one application process may use a bot token at a time.

## First-time local setup — PowerShell

PowerShell may block `pnpm.ps1`, so use `pnpm.cmd`:

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d postgres
docker compose ps
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:migrate
pnpm.cmd db:seed
pnpm.cmd dev
```

## Verify before opening Telegram

Git Bash:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
docker compose ps
```

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/ready
docker compose ps
```

`/health` must report `ok`, `/ready` must report `ready`, and PostgreSQL must be healthy.

## Telegram access model

- Anyone may use the resident bot, but can view only requests owned by the same Telegram account.
- The staff bot intentionally rejects unknown users. Sending `/myid` reveals the sender’s Telegram ID
  without granting access.
- An existing administrator opens `👥 Xodimlar / Сотрудники`, adds `Telegram ID | Full name`, and
  grants either `operator_manager` or `executor` for the pilot area.
- Sharing the staff-bot link does not grant staff permissions. Every protected operation reloads the
  persisted role and service-area scope.

## Normal restart and shutdown

For the next demonstration, the database can stay running:

```bash
docker compose up -d postgres
pnpm dev
```

Press `Ctrl+C` once to stop both bot pollers gracefully. To stop PostgreSQL without deleting its data:

```bash
docker compose stop postgres
```

Never use `docker compose down --volumes` unless permanent deletion of the local demo database is
explicitly intended.

## Documentation

- [Customer demonstration guide](docs/runbooks/customer-demo.md)
- [Resident bot guide](docs/runbooks/resident-bot.md)
- [Staff bot guide](docs/runbooks/staff-bot.md)
- [Commercial workflow](docs/runbooks/commercial-bot.md)
- [Local development](docs/runbooks/local-development.md)
- [Production deployment and rollback](docs/runbooks/production-deployment.md)
- [Production-readiness checklist](docs/runbooks/production-readiness-checklist.md)
- [Architecture and checkpoint index](docs/README.md)

## Quality gates

```bash
pnpm check
pnpm test:coverage
pnpm audit --audit-level high
```

The GitHub workflow also validates PostgreSQL integration behavior, production Compose rendering and
the runtime container image.

## Safety boundary

Never commit `.env`, bot tokens, passwords, Telegram exports, resident details or production backups.
The demo privacy wording and commercial documents are pilot controls, not a claim of legal, fiscal or
signature compliance. Use only synthetic data until the responsible MCK reviewers approve the
real-data checklist.
