CHECKPOINT: CP-02 — Domain model and persistence
STATUS: PASS

## 1. Objective

Create the smallest production-grade domain and PostgreSQL foundation for request intake and order execution: canonical terminology, explicit lifecycles, backend authorization, transactional persistence, concurrency safety, auditability, repeatable migrations/seeds, and real database verification.

## 2. Scope completed

- Kept service requests separate from operational orders and documented aggregate ownership.
- Implemented explicit request and order state machines with permission, actor, precondition, required-data, side-effect, notification, SLA, audit, failure, and compensation metadata.
- Implemented global/service-area-scoped permissions, persisted principal loading for active users only, and executor eligibility checks.
- Added a 15-table PostgreSQL schema, three lifecycle/status enums, critical constraints, foreign keys, and query-pattern indexes.
- Added generated Drizzle migration metadata and a custom append-only audit trigger.
- Added idempotent reference/RBAC seed data without demo people or operational records.
- Added an order transition application service and repository with optimistic concurrency and atomic order/history/audit writes.
- Added domain, authorization, application, migration, seed, persistence, integrity, tamper, and concurrency tests.
- Updated traceability, decisions, diagrams, testing policy, and migration operations documentation.

## 3. Files created or modified

- Domain/application: `src/domain/identity/permissions.ts`, `src/domain/requests/request-state-machine.ts`, `src/domain/orders/order-state-machine.ts`, `src/domain/shared/domain-errors.ts`, `src/domain/workflow/transition-types.ts`, `src/application/identity/principal-provider.ts`, `src/application/orders/order-repository.ts`, `src/application/orders/transition-order-service.ts`.
- Persistence: `drizzle.config.ts`, `drizzle/20260726205457_bright_black_queen.sql`, `drizzle/meta/*`, `src/infrastructure/database/{client,migrate,migration-runner,schema,seed,seed-runner}.ts`, `src/infrastructure/identity/postgres-principal-provider.ts`, `src/infrastructure/orders/{postgres-executor-eligibility,postgres-order-repository}.ts`.
- Tests/config: `test/authorization.test.ts`, `test/request-state-machine.test.ts`, `test/order-state-machine.test.ts`, `test/transition-order-service.test.ts`, `test/persistence.integration.test.ts`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`.
- Documentation: `docs/architecture/{domain-model,state-machine,data-model}.md`, `docs/adr/ADR-0004-request-order-lifecycles-and-transactional-audit.md`, `docs/runbooks/database-migrations.md`, `docs/{README,assumptions,requirements-traceability,testing-strategy}.md`, this report.

## 4. Architecture decisions

- A service request records a need and validation outcome; an order records an operational commitment and execution.
- One request links to at most one order initially; one order can later consolidate several requests.
- Backend principals are assembled from stored roles/permissions. A null scope is deliberately global; otherwise grants match a service area.
- Suspended/disabled users cannot produce a principal. Residents do not receive area-wide quality acceptance/rework rights before customer ownership is modeled.
- State-machine planning is framework/ORM independent. Interfaces must call application/domain services.
- PostgreSQL is the transaction boundary. Optimistic versions prevent lost updates; state, history, and audit commit together.
- Audit logs are append-only at database level. Declarative notification/SLA effects are consumed in later checkpoints.
- No Redis, broker, event sourcing, or additional paid infrastructure was added.

## 5. Commands executed

- Dependency/schema: `pnpm add drizzle-orm`, `pnpm add -D drizzle-kit`, `pnpm db:generate`, `pnpm db:check`.
- Quality: `pnpm format`, `pnpm check`, `pnpm test:integration`, `pnpm test:coverage`, `pnpm audit --audit-level moderate`, `pnpm why esbuild`.
- Database: started a stopped isolated PostgreSQL 18 temp cluster on `127.0.0.1:55432`; created fresh disposable `mck_cp02_20260727` and `mck_cp02_final_20260727` databases; stopped the cluster after testing.
- The first `test:integration` invocation exposed a Windows glob-filter issue; the script was corrected to explicit files and passed.
- The first coverage run exposed insufficient global function coverage from declarative schema/CLI files; meaningful executable coverage rules were corrected and additional lifecycle tests were added.
- The first audit found one moderate vulnerable transitive `esbuild` used only by Drizzle Kit; it was overridden to patched `0.25.12`, dependencies were relinked, and the audit became clean.
- Sandbox Drizzle/audit commands initially failed on OS/network restrictions; the same commands were re-run with approved elevation and succeeded.

## 6. Test results with actual outcomes

- `pnpm check`: PASS — formatting, ESLint (zero warnings), strict typecheck, module boundaries, 33/33 unit/API tests, production build.
- `pnpm test:integration`: PASS — 2 files, 6/6 real PostgreSQL tests.
- `pnpm test:coverage`: PASS — 9 files, 39/39 tests; 93.30% statements, 84.05% branches, 98.43% functions, 96.37% lines.
- Critical request and order state-machine files: 100% statements, branches, functions, and lines (90% gate enforced by glob).
- `pnpm db:check`: PASS — Drizzle reported migration metadata consistent.
- `pnpm audit --audit-level moderate`: PASS — no known vulnerabilities after the targeted override.
- Real database behaviors proven: readiness, migration repeatability, seed repeatability, least-privilege seeded roles, scoped grants, inactive-user rejection, executor eligibility, atomic status/history/audit, exactly one concurrent writer, coordinate constraints, and audit update rejection.

## 7. Acceptance-criteria matrix

| Criterion                                                      | Evidence                                                                       | Result |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| Canonical terminology and aggregate boundaries                 | domain model + ADR-0004                                                        | PASS   |
| Canonical request/order lifecycle and full transition metadata | executable definitions + state-machine tests/docs                              | PASS   |
| Centralized status handling                                    | state-machine planners + `TransitionOrderService`; no controller status writes | PASS   |
| Backend scoped authorization                                   | permission model, principal provider, actor/eligibility tests                  | PASS   |
| Initial constrained/indexed database model                     | generated migration + real PostgreSQL constraint tests                         | PASS   |
| Repeatable migration and seed                                  | migration and seed each executed twice on a fresh database                     | PASS   |
| Transactional history/audit                                    | repository integration test                                                    | PASS   |
| Concurrent-update protection                                   | real two-writer optimistic-lock test                                           | PASS   |
| Audit immutability                                             | PostgreSQL trigger tamper test                                                 | PASS   |
| Coverage and engineering gates                                 | `pnpm check`, coverage thresholds, audit                                       | PASS   |
| Documentation and traceability synchronized                    | architecture/ADR/runbook/matrix updates                                        | PASS   |

## 8. Security and privacy review

- Least privilege is enforced in backend code with service-area scopes and explicit global grants.
- Suspended/disabled principals are rejected; assignment requires an active scoped executor.
- Residents cannot accept arbitrary area orders; generic quality rights remain with authorized staff until customer ownership is implemented.
- Parameterized Drizzle/postgres.js queries avoid string-built SQL for domain data.
- Audit contains operational identifiers and before/after lifecycle facts, not Telegram tokens or unnecessary PII.
- Audit update/delete is rejected by PostgreSQL. User deletion is restricted when referenced by audit/history.
- No secrets or real resident/staff data were added. Seed data is reference data only.
- Dependency audit is clean at moderate-and-higher severity.

## 9. Database and migration review

- One reviewed forward migration creates 15 tables, three enums, foreign keys, uniqueness/check constraints, query indexes, and the audit immutability trigger.
- UUID keys and timezone-aware timestamps are used; coordinates require a complete valid pair; entity versions cannot be negative.
- Order update, history, and audit share one transaction. `(order_id, order_version)` uniqueness protects history consistency.
- The migration and idempotent seed ran successfully from an empty database and repeated without error.
- No existing/user database was migrated, truncated, reset, or deleted. The temporary PostgreSQL cluster is stopped; disposable databases remain in its temp directory.
- Production rollback is forward-compatible application rollback or verified backup restore, not ad-hoc down SQL.

## 10. Known limitations

- Telegram authentication/linking and resident intake persistence orchestration begin in CP-03.
- The request state machine exists, but its transactional repository is added with request creation/registration orchestration in CP-03/04; no interface can mutate request status yet.
- Assignment is represented by current executor plus history; assignment attempts/work logs become first-class in CP-05.
- Notification and SLA effects are declared but not dispatched/scheduled until CP-07.
- Customer acceptance/rework needs verified request/order ownership and is deferred to CP-06; staff quality transitions are available for the pilot foundation.
- Priority, duplicate review, outbox, media, profiles, finance, and KPI tables remain intentionally deferred.

## 11. Risks and technical debt

- Drizzle Kit currently brings deprecated `@esbuild-kit` loader packages. The vulnerable transitive version is patched via a narrow pnpm override; reassess when Drizzle removes that chain.
- Reference/RBAC seed logic is additive. Future permission revocations must use a reviewed migration rather than assuming a seed will delete existing grants.
- The polymorphic audit entity ID has no foreign key by design; repository/application tests and restricted actor references protect integrity.
- Direct privileged SQL could still change order status without history. Application database credentials should not own schema or receive bypass privileges in production; stronger database guardrails can be considered after workflow stabilizes.
- Docker daemon smoke testing remains unavailable on this workstation, but CP-02 database behavior was verified using real PostgreSQL 18.

## 12. Rollback procedure

Before deployment, revert the CP-02 application/files and use the prior lockfile; no production schema exists yet. After deployment, roll back only to an application version compatible with the expanded schema. If the migration itself is defective, stop writes, restore the verified pre-migration backup into a separate database, validate it, then switch via an approved procedure. Do not delete audit rows, hand-edit Drizzle journal records, or run destructive down SQL. The local test cluster is already stopped; its temp data can be removed later only with explicit approval.

## 13. Recommended next checkpoint

CP-03 — Telegram resident onboarding and request intake: bot bootstrap, language/consent/contact, category and address/location, description/media metadata, review/submission, idempotent Telegram update handling, ticket generation/status lookup, thin handlers, and real integration tests. Continue with long polling and free PostgreSQL-only infrastructure for the sell-first pilot.

## 14. Waiting for: APPROVE CP-02

Stop here. Do not begin CP-03 without the exact approval phrase `APPROVE CP-02`.
