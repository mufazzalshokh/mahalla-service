# Local development runbook

## Windows PowerShell

PowerShell script policy may block `pnpm.ps1`; use `pnpm.cmd`.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm.cmd install
pnpm.cmd dev
```

Do not put real bot tokens or resident information in source-controlled `.env` files. See
[the resident bot runbook](resident-bot.md) for an approved local demonstration.

## Health verification

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/ready
docker compose ps
```

`/health` proves the process can respond. `/ready` checks PostgreSQL and returns HTTP
503 when a required dependency is unavailable.

## Quality gates

```powershell
pnpm.cmd check
pnpm.cmd test:coverage
$env:TEST_DATABASE_URL='postgresql://mck:mck_local_only@127.0.0.1:5432/mck'
pnpm.cmd test:integration
Remove-Item Env:TEST_DATABASE_URL
pnpm.cmd audit --audit-level high
docker compose config --quiet
```

## Containerized application

After dependencies and the lockfile exist:

```powershell
docker compose --profile application up --build -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/ready
```

Stopping containers is an operational action and does not remove data:

```powershell
docker compose --profile application stop
```

Do not run `docker compose down --volumes` unless deletion of the local PostgreSQL
data volume is explicitly intended and approved.

## Real database test without Docker

When PostgreSQL binaries are already installed, an operator may initialize a
temporary, non-service cluster under the operating-system temporary directory and
set `TEST_DATABASE_URL` before running `pnpm.cmd test:integration`. The temporary
server must be stopped with `pg_ctl` after the test. Never point integration tests at
a production or user-owned database.
