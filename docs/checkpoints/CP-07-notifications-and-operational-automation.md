CHECKPOINT: CP-07 — Notifications and operational automation
STATUS: PASS

## 1. Objective

Deliver reliable material Telegram updates and automated deadline/complaint follow-up for the
sell-first pilot, using only the existing application process and PostgreSQL.

## 2. Scope completed

- Added fixed Uzbek Latin/Cyrillic notification templates for resident, executor, and operator
  lifecycle events without embedding descriptions, reasons, addresses, phones, or tokens.
- Added a transactional PostgreSQL outbox to request/order/registration/complaint transactions.
- Added `SKIP LOCKED` batch claiming, recoverable worker leases, delivery-attempt history, bounded
  exponential retry, dead-letter status, area-scoped visibility, and authorized recovery.
- Added Telegram delivery through the correct resident/staff bot identity.
- Added one-process operational automation with PostgreSQL advisory locking and overlap protection.
- Added two-hour executor deadline reminders, deadline-overdue alerts/escalations, four-hour
  complaint-review reminders, and overdue complaint alerts.
- Added idempotent deduplication for repeated/overlapping scans.
- Added `/ackoverdue`, `/resolveoverdue`, `/failednotifications`, and `/retrynotification` staff
  commands. Resolution is blocked while the overdue cause remains active.
- Required both bot tokens when automation is enabled and added graceful timer shutdown.
- Updated architecture, ADR, data model, traceability, assumptions, runbooks, privacy/threat review,
  testing strategy, and documentation index.

## 3. Files created or modified

- Domain/application: notification policy, repository/sender ports, worker service, automation
  service, escalation-management policy, permissions, and staff operations.
- Persistence: notification enqueuer/repository, automation repository, lifecycle repositories,
  escalation repository, schema, seed, and database transaction type.
- Telegram/bootstrap: template/sender adapter, staff commands, environment validation, `.env`
  example, and `src/main.ts` poller lifecycle.
- Migration: `drizzle/20260727102724_lush_junta.sql`, journal, and snapshot.
- Tests: retry, delivery worker, templates, automation orchestration, staff/environment/escalation,
  and real PostgreSQL notification/automation integration coverage.
- Documentation: ADR-0008, notification architecture, runbooks, security/privacy, traceability,
  data/container/domain models, assumptions, testing strategy, index, and this record.

## 4. Architecture decisions

- Keep PostgreSQL as the only durable queue and coordination service; add no Redis, broker, hosted
  scheduler, cache, webhook ingress, or paid service.
- Insert one outbox intent per resolved recipient in the same transaction as material state/audit.
- Deliver at-least-once using stable deduplication before send, `SKIP LOCKED`, worker leases, and
  attempt predicates. Telegram has no provider idempotency key for the final send/commit gap.
- Retry after 30/60/120/240 seconds and then bounded delays up to one hour, with five attempts by
  default; permanent/exhausted failures enter `DEAD_LETTER`.
- Preserve each attempt while allowing an authorized manual recovery to reset the active counter.
- Run scans inside the application timer with a transaction advisory lock. Scans only notify and
  create escalation facts; they never reopen complaints or mutate order lifecycle state.
- Use fixed minimal payloads: template, human reference, optional status, and optional deadline.
- Require an explicit active staff/resident identity and area-scoped grants for visibility/action.

## 5. Commands executed

- `pnpm.cmd format`
- `pnpm.cmd check`
- `pnpm.cmd test:integration` against fresh PostgreSQL databases
- `pnpm.cmd test:coverage` with a fresh real PostgreSQL database
- `pnpm.cmd db:generate` (executed through a Node bootstrap workaround for a sandbox-specific
  `uv_os_get_passwd` failure)
- `pnpm.cmd db:check` equivalent through the same bootstrap workaround
- `pnpm.cmd audit --audit-level moderate`
- Started an isolated PostgreSQL 18 cluster on port 55483, created fresh CP-07 databases, applied
  and reapplied migrations/seed, and ran focused/full database suites.

## 6. Test results with actual outcomes

- Final `pnpm.cmd check`: PASS — formatting, zero-warning lint, strict typecheck, module boundaries,
  104/104 local tests across 22 files, and production build.
- Fresh real-PostgreSQL integration suite: 26/26 PASS across 7 files.
- Database-backed coverage run: 130/130 PASS across 29 files.
- Overall coverage: 86.86% statements, 80.07% branches, 91.59% functions, 90.79% lines.
- Notification service coverage: 97.22% statements, 93.33% branches, 87.5% functions, 100% lines.
- Existing quality policy remained 97.05% statements, 96.29% branches, 100% functions, 96.87%
  lines; all existing critical thresholds passed.
- Migration consistency: PASS (`Everything's fine`).
- Dependency audit: no known vulnerabilities at moderate-or-higher severity.
- The first notification integration run exposed raw `Date` binding in a raw claim CTE; timestamps
  are now explicitly ISO/timestamptz and the focused/full fresh-database runs pass.
- The first coverage run passed all 128 tests but correctly failed the 80% branch gate at 78.16%;
  exhaustive approved-template, adapter-boundary, exhausted-retry, and authorization tests raised
  meaningful branch coverage to 80.07% with 130/130 passing.
- Review identified that resolving an actively overdue alert would cause recreation on the next
  scan; resolution now requires the overdue cause to have ended and is covered in unit/database tests.

## 7. Acceptance-criteria matrix

| Criterion                                     | Evidence                                                        | Result |
| --------------------------------------------- | --------------------------------------------------------------- | ------ |
| Fixed notification templates                  | exhaustive Latin/Cyrillic template tests                        | PASS   |
| Lifecycle intent is transactional             | request transition/outbox database assertion                    | PASS   |
| Recipient-level deduplication                 | unique key and repeated-scan assertions                         | PASS   |
| Concurrent workers do not double-claim        | two-repository `SKIP LOCKED` integration test                   | PASS   |
| Lease-based abandoned claim recovery          | claim predicate and bounded lease implementation                | PASS   |
| Bounded exponential retry                     | pure boundary and worker failure tests                          | PASS   |
| Permanent/exhausted dead letter               | unit and real database delivery assertions                      | PASS   |
| Failure visibility is area scoped             | permission/service filtering and staff command coverage         | PASS   |
| Authorized dead-letter recovery               | preserved attempts, reset active counter, audit assertion       | PASS   |
| Scheduled deadline reminder                   | due-window automation and deduplicated executor intent          | PASS   |
| Automatic overdue escalation/alert            | advisory-locked repeated real database scans                    | PASS   |
| Complaint reminder/overdue alert              | due/overdue complaint automation assertions                     | PASS   |
| Escalation acknowledge/resolve rules          | active-cause rejection and completed-cause resolution tests     | PASS   |
| No automatic complaint/order lifecycle change | automation repository only inserts alerts/escalations           | PASS   |
| Zero added paid infrastructure                | one process, PostgreSQL, current bot tokens only                | PASS   |
| Migration/docs/security synchronized          | additive migration, ADR/runbooks/trace/privacy/threat artifacts | PASS   |

## 8. Security and privacy review

- Notification payloads are allow-listed structures and omit arbitrary request, blocker, complaint,
  quality, address, phone, Telegram ID, and token content.
- Recipient IDs come from persisted request ownership, current assignment, or active scoped staff
  roles; callers cannot supply notification recipients.
- Dead-letter list/recovery requires the new persisted `notification.manage` permission and applies
  exact service-area filtering unless the grant is explicitly global.
- Escalation management requires `order.escalation.manage` for the order area and writes audit facts.
- Provider failures are normalized to bounded codes; raw Telegram/provider messages are not stored.
- Worker lock ownership and attempt predicates prevent a stale worker from overwriting a later claim.
- Advisory locking and dedupe constraints mitigate overlapping timers and notification spam.
- Both bot tokens remain external secrets and are required at startup when automation is enabled.
- Provisional notification retention is 90 days after delivery; dead letters remain until reviewed.

## 9. Database and migration review

- The additive migration creates three enums, one sequence, `notification_outbox`, and
  `notification_delivery_attempts`.
- Unique indexes protect human notification codes, recipient deduplication, and attempt numbers.
- Claim and area/failure indexes support due polling and scoped operational review.
- Foreign keys restrict recipient/service-area deletion; delivery attempts cascade only with their
  parent notification record. No runtime cleanup/delete was added.
- Checks enforce nonnegative attempts and a 1–20 maximum-attempt range.
- No existing table/column/type is dropped, truncated, renamed, or destructively rewritten.
- Fresh database `mck_cp07_final2_20260727` applied/reapplied all migrations and seed safely and passed
  all 26 integration tests. Coverage used fresh `mck_cp07_coverage2_20260727`.

## 10. Known limitations

- Live Telegram delivery was not smoke-tested because no real bot tokens were requested or exposed.
- Delivery is at-least-once: a crash after Telegram accepts a message but before delivery commit can
  produce a duplicate after the lease expires.
- In-process schedules run only while the application is running; there is no independent scheduler.
- Fixed two-/four-hour reminder windows and 30-second polling do not yet model business hours,
  holidays, quiet hours, or category-specific notification policy.
- Operator alerts require at least one pre-provisioned active scoped operator/administrator account;
  the pilot setup/runbook must establish recipients before activation.
- Templates are code-managed rather than editable through an administration interface.
- There is no live alert to an external observability system when dead letters appear; staff use the
  bot queue until CP-10 hardening.

## 11. Risks and technical debt

- Manual recovery can retry indefinitely by design; repeated permanent errors should trigger account
  correction rather than repeated recovery.
- One scan transaction queries all relevant pilot rows. Pagination/sharding is deferred until measured
  volume proves it necessary.
- Outbox rows have a provisional retention rule but no destructive cleanup job until policy approval.
- Staff/executor notification templates currently use Uzbek Latin; only resident templates override
  the four resident-facing messages in Cyrillic.
- Telegram account relinking/account recovery remains a manual administrative operation.
- Timer health, scan lag, queue depth, dead-letter count, and provider latency need production metrics
  in CP-10.

## 12. Rollback procedure

Set `AUTOMATION_ENABLED=false` to stop new scans and delivery, then deploy CP-06-compatible code.
Queued intents, attempts, escalations, and audit facts remain intact and queryable. Before a real
migration, take and verify a backup. If schema restoration is mandatory, restore that backup into a
separate database and switch through an approved procedure; do not drop outbox tables/enums, delete
attempt/audit history, or edit Drizzle journal rows. No destructive cleanup was performed.

## 13. Recommended next checkpoint

CP-08 — KPI, portfolio reporting, and PDCA: approve precise formulas/time boundaries first, then add
weekly/monthly portfolio, SLA, quality, complaint and repeat-problem summaries plus auditable PDCA
actions and export. Keep reporting inside PostgreSQL/the modular monolith and avoid a BI subscription
until a paying buyer or measured analyst workload justifies it.

## 14. Waiting for: APPROVE CP-07

Stop here. Do not begin CP-08 without the exact approval phrase `APPROVE CP-07`.
