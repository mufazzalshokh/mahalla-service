CHECKPOINT: CP-01 — Architecture and engineering foundation

STATUS: PASS

## 1. Objective

Create a reproducible, secure TypeScript engineering foundation with validated
configuration, explicit module boundaries, PostgreSQL readiness, health endpoints,
quality gates, CI and local operating documentation.

## 2. Scope completed

- initialized an empty Git repository with `main` as the initial branch;
- created a Node.js 24/pnpm TypeScript project and deterministic lockfile;
- implemented validated, immutable environment configuration with safe failures;
- implemented liveness and dependency-aware readiness endpoints;
- implemented correlation/request IDs, centralized safe HTTP errors and structured
  logging redaction paths;
- implemented a real PostgreSQL readiness adapter and graceful shutdown;
- enforced source dependency direction with an executable boundary check;
- added unit, HTTP injection and real PostgreSQL integration tests;
- added Dockerfile, Docker Compose PostgreSQL/application definitions and health
  checks;
- added GitHub Actions CI, formatting, lint, type, coverage, audit and build gates;
- recorded architecture decisions, diagrams, test strategy and local runbook.

Telegram workflow and business-domain persistence are intentionally outside CP-01.

## 3. Files created or modified

- project: `package.json`, `pnpm-lock.yaml`, TypeScript/ESLint/Prettier/Vitest
  configuration, editor configuration and ignore files;
- application: `src/config`, `src/application/health`,
  `src/infrastructure/database`, `src/interfaces/http`, `src/main.ts`;
- verification: `test/` and `scripts/check-boundaries.mjs`;
- infrastructure: `Dockerfile`, `compose.yaml`, `.github/workflows/ci.yml`;
- documentation: root `README.md`, ADR-0001 through ADR-0003, component/container/
  deployment diagrams, testing strategy, local-development runbook, documentation
  index and this checkpoint report.

## 4. Architecture decisions

- Node.js 24 LTS and TypeScript 6, pinned to the currently supported type-aware
  ESLint range;
- one lean modular-monolith application process;
- Fastify HTTP boundary and PostgreSQL system of record;
- separate interface, application, domain and infrastructure dependency direction;
- long polling for the future low-volume Telegram pilot;
- PostgreSQL outbox later instead of Redis or a broker;
- dependency install scripts remain blocked by default; the current tools work with
  their packaged platform binaries.

## 5. Commands executed

- `git init --initial-branch=main`;
- pnpm runtime/development dependency installation and compatibility correction;
- `pnpm.cmd format`, `lint`, `typecheck`, `check:boundaries`, `test`, `build`,
  `test:coverage`, `test:integration`, `check` and `audit --audit-level high`;
- `docker compose config --quiet` and Docker daemon/service diagnostics;
- compiled-process `/health` and `/ready` smoke test;
- isolated PostgreSQL 18 `initdb`, `pg_ctl`, `pg_isready`, integration/coverage test
  and clean server shutdown.

## 6. Test results with actual outcomes

- full `pnpm.cmd check`: exit code 0;
- formatting: PASS;
- ESLint with zero warnings: PASS;
- strict TypeScript type check: PASS;
- module-boundary check: PASS;
- unit/HTTP tests: 16 passed in 3 files;
- real PostgreSQL integration: 1 passed in 1 file;
- coverage with real PostgreSQL: 17/17 tests passed; statements 100%, branches 92%,
  functions 100%, lines 100%;
- production TypeScript build: PASS;
- dependency audit: no known vulnerabilities;
- Docker Compose configuration parsing: PASS;
- compiled liveness: HTTP 200 and safe response: PASS;
- compiled readiness with unavailable DB: HTTP 503 with no connection-secret leak:
  PASS;
- Docker image build and container health smoke: **UNVERIFIED** because the installed
  Docker Desktop daemon was stopped and service/GUI startup was denied in this
  managed session. The daemon-independent Compose validation passed.

Failures found and fixed during the checkpoint included TypeScript 7 peer
incompatibility, ESLint JavaScript project configuration, Fastify deprecated logging
options, insufficient initial branch coverage and a partial pnpm dependency tree.

## 7. Acceptance-criteria matrix

| Criterion                            | Evidence                                         | Result                                    |
| ------------------------------------ | ------------------------------------------------ | ----------------------------------------- |
| Git and pnpm foundation              | `.git`, `package.json`, lockfile                 | PASS                                      |
| Strict build and typed configuration | type check/build and configuration tests         | PASS                                      |
| Liveness/readiness endpoints         | HTTP tests and compiled smoke                    | PASS                                      |
| PostgreSQL dependency check          | real PostgreSQL integration test                 | PASS                                      |
| Module boundaries                    | boundary script execution                        | PASS                                      |
| Formatting and linting               | full check, zero warnings                        | PASS                                      |
| Automated tests and coverage         | 17 tests; 100/92/100/100 coverage                | PASS                                      |
| Docker Compose definition and syntax | Compose config exit code 0                       | PASS                                      |
| CI baseline                          | workflow mirrors local gates and real DB service | PASS (execution awaits remote repository) |
| Dependency vulnerability audit       | pnpm audit                                       | PASS                                      |
| Architecture/runbook synchronization | ADRs, diagrams and runbook                       | PASS                                      |

## 8. Security and privacy review

- configuration failures identify variable names without echoing values;
- environment files and secrets are ignored;
- logging redacts authorization, cookies, tokens, phone and address fields;
- untrusted request IDs are length/character constrained or replaced;
- internal errors return safe messages and correlation IDs;
- containers use a non-root runtime user and localhost-only published ports;
- CI permissions are read-only;
- no resident data or bot token was introduced.

The redaction list must expand alongside future Telegram/domain payloads.

## 9. Database and migration review

No domain schema or migration was created. PostgreSQL connectivity was verified
against an isolated PostgreSQL 18 cluster using a real `SELECT 1` readiness query.
The server was stopped successfully. Initial schema, constraints, repositories and
migration tests belong to CP-02.

## 10. Known limitations

- Docker image build/container health is UNVERIFIED until Docker Desktop is running;
- the GitHub Actions workflow cannot execute until the repository is hosted;
- health endpoints currently have no public-ingress policy because long polling does
  not need public ingress;
- application functionality is foundation-only; there is no Telegram bot or order
  workflow yet;
- temporary recovery/test directories created during local package/PostgreSQL
  troubleshooting remain outside the repository and contain no project secrets or
  resident data.

## 11. Risks and technical debt

- one process is an intentional pilot availability boundary;
- the PostgreSQL adapter is currently readiness-only;
- logger redaction paths require continuous maintenance;
- Compose uses development-default credentials that must never be used in a paid
  deployment;
- Docker build behavior should be smoke-tested when its daemon is available;
- package installation is slower than normal on this Windows environment, so CI is
  the authoritative clean Linux installation check once hosted.

## 12. Rollback procedure

No commit, database migration or external deployment exists. Rollback is to stop any
running development process and revert/remove CP-01 files after review. The isolated
PostgreSQL test server has already been stopped. Do not remove user-owned Docker
volumes or installed PostgreSQL services.

## 13. Recommended next checkpoint

CP-02 — Canonical domain model and persistence: define aggregates, permission scopes,
the complete transition table, Drizzle schema/migrations, constraints, repositories,
transaction boundaries, audit foundation and database integration tests.

## 14. Waiting for: APPROVE CP-01

Do not begin CP-02 until the stakeholder explicitly provides `APPROVE CP-01`.
