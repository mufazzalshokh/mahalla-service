CHECKPOINT: CP-06 — Quality, acceptance, warranty, feedback, and complaints
STATUS: PASS

## 1. Objective

Deliver a sellable, auditable closure loop after executor completion: configurable
category checklists, inspection, operator/resident acceptance, rework, warranty,
feedback, complaints, and controlled reopen without adding paid infrastructure.

## 2. Scope completed

- Added one active, versioned quality checklist policy per category with bilingual items.
- Added configurable inspection requirement, acceptance mode, warranty days, rework target,
  and complaint-review target.
- Added staff checklist, inspection, acceptance, rework, complaint queue, controlled reopen,
  complaint resolution/rejection, and executor rework-start commands.
- Added resident acceptance, rework, warranty lookup, 1–5 rating, optional comment, and
  complaint commands.
- Enforced owner-linked resident and area-scoped staff authorization in application and
  persistence boundaries.
- Bound inspections to both template version and exact order version so results cannot be
  reused after rework.
- Made acceptance, completion, warranty, history, and audit one transaction.
- Made rework/complaint reopen, fresh assignment, reset SLA, history, and audit one transaction.
- Kept complaint submission separate from lifecycle mutation; only an authorized reasoned
  decision can reopen work.
- Added complaint close rules: reopened cases resolve only after corrected work is completed.
- Added deterministic clocks for order persistence tests.
- Updated architecture, ADR, state/data/sequence models, runbooks, threat/privacy review,
  assumptions, traceability, testing strategy, and documentation index.

## 3. Files created or modified

- Domain/application: `src/domain/quality/quality-policy.ts`, quality repository/service
  ports, order transition data/state machine, permissions, and staff operations.
- Persistence: quality PostgreSQL repository, order transition repository, schema, seed,
  and deterministic persistence clock.
- Telegram/bootstrap: resident/staff commands and `src/main.ts` quality wiring.
- Migrations: `20260727092030_dizzy_korvac.sql`,
  `20260727094709_big_mach_iv.sql`, journal, and snapshots.
- Tests: quality policy/service/PostgreSQL suites plus order-state and Telegram staff tests.
- Documentation: ADR-0007, quality architecture, state/data/sequence models, assumptions,
  traceability, runbooks, security/privacy, testing strategy, index, and this report.

## 4. Architecture decisions

- Keep CP-06 in the modular monolith and PostgreSQL; add no workflow engine, CRM, survey
  service, broker, cache, or object store.
- Seed a seven-day operational warranty, 24-hour rework target, and 48-hour complaint review;
  these are configurable, provisional, and non-contractual.
- Permit owner-linked resident or scoped operator decisions unless category policy is
  operator-only; require inspection for seeded electrical work.
- Snapshot inspection results with template and order versions.
- Preserve every acceptance and rework decision; refresh the single warranty projection on
  re-acceptance.
- Create a new pending assignment/SLA for each rework cycle and require the existing executor
  to start it explicitly.
- Record complaints without automatic reopen; review, reopen, resolve, and reject are distinct
  authorized actions.
- Use optimistic order versions and database uniqueness for competing decisions and duplicate
  resident submissions.

## 5. Commands executed

- `pnpm.cmd format`
- `pnpm.cmd lint`
- `pnpm.cmd typecheck`
- `pnpm.cmd check`
- `pnpm.cmd test:integration`
- `pnpm.cmd test:coverage` with the disposable PostgreSQL URL
- `pnpm.cmd db:generate` twice for the main additive schema and order-version hardening
- `pnpm.cmd db:check`
- `pnpm.cmd audit --audit-level moderate`
- Started the existing PostgreSQL 18 disposable cluster, created fresh CP-06 databases,
  applied/reapplied migrations and seed, executed focused/full suites, and stopped the cluster.

## 6. Test results with actual outcomes

- Final `pnpm.cmd check`: PASS — formatting, zero-warning lint, strict typecheck, module
  boundaries, 90/90 local tests across 18 files, and production build.
- Real-PostgreSQL integration suite: 21/21 PASS across 6 files.
- Database-backed exact coverage: 111/111 PASS across 24 files.
- Overall coverage: 86.41% statements, 80.51% branches, 91.01% functions, 90.19% lines.
- Order state machine: 100% statements, branches, functions, and lines.
- Quality policy: 97.05% statements, 96.29% branches, 100% functions, 96.87% lines.
- Migration consistency: PASS (`Everything's fine`).
- Dependency audit: no known moderate-or-higher vulnerabilities.
- First coverage command intentionally failed because no database URL caused integration suites
  to skip; the required database-backed rerun passed all thresholds.
- First quality integration run exposed a wall-clock mismatch; persistence now uses an injected
  clock. A second run exposed wrapped PostgreSQL unique errors; duplicate feedback/complaint
  errors are now normalized. Both corrections pass on fresh and repeated databases.
- Review found stale inspection reuse across rework; exact order-version binding and a complete
  reinspect/reaccept integration scenario now prevent it.

## 7. Acceptance-criteria matrix

| Criterion                                     | Evidence                                                      | Result |
| --------------------------------------------- | ------------------------------------------------------------- | ------ |
| Configurable category checklist               | versioned templates/items and idempotent seed                 | PASS   |
| Complete measurable inspection                | pure validation plus persisted result snapshot                | PASS   |
| Required inspection enforcement               | electrical policy and service/transaction recheck             | PASS   |
| No stale inspection reuse after rework        | exact order-version binding and rework-cycle integration      | PASS   |
| Operator acceptance/rework                    | scoped permissions and staff commands                         | PASS   |
| Resident acceptance/rework                    | active identity and request/order owner checks                | PASS   |
| Wrong resident rejected                       | service and database ownership assertions                     | PASS   |
| Atomic completion and warranty                | order, acceptance, warranty, history and audit transaction    | PASS   |
| Fresh rework assignment and SLA               | pending assignment, reset clock and executor start assertions | PASS   |
| One bounded rating per resident/order         | policy, unique constraint and duplicate test                  | PASS   |
| Complaint code/review/warranty classification | real database complaint assertions                            | PASS   |
| Complaint does not auto-reopen                | completed-state assertion after submission                    | PASS   |
| Controlled complaint reopen                   | scoped open-link recheck, reason, transition and audit        | PASS   |
| Complaint resolve/reject control              | review permission and corrected-work completion rule          | PASS   |
| Competing accept/rework serialization         | simultaneous real PostgreSQL decision test                    | PASS   |
| Documentation/security/migration synchronized | repository artifacts and final checks                         | PASS   |

## 8. Security and privacy review

- Resident commands load an active Telegram-linked identity and require ownership of a request
  linked to the order; persistence rechecks ownership during acceptance, feedback, and complaint.
- Staff inspection, acceptance, rework, complaint review, and reopen require persisted
  area-scoped permissions on every command.
- Category acceptance mode, warranty value, inspection order/template linkage, outcome, and
  owner identity are revalidated in the transition transaction.
- Complaint reopen rechecks open status and exact order linkage under the same transaction.
- Ratings, comments, inspection summaries, complaint reasons, and rework reasons have application
  and database bounds. SQL remains parameterized.
- Audit records outcome, rating, identifiers, status, and decision reason where required; it does
  not duplicate feedback comments, complaint bodies, checklist summaries, Telegram IDs, or tokens.
- Concurrency uses order versions, status predicates, one-active-assignment, one-rating, and
  one-open-complaint constraints.
- Warranty and retention are engineering defaults, not legal commitments; real data remains
  blocked on privacy/retention approval.

## 9. Database and migration review

- The first additive migration creates five enums, one complaint sequence, and eight tables:
  templates, items, inspections, acceptances, warranties, feedback, complaints, and rework decisions.
- The second additive migration binds inspections to a nonnegative order version. It follows the
  first immediately, before quality data can exist in a deployment.
- There is no drop, truncate, delete, destructive data rewrite, or existing-column change.
- Foreign keys use restrictive deletion except checklist items owned by a template.
- Partial unique indexes enforce one active category policy and one open complaint per
  resident/order; other indexes enforce versioned templates/acceptances, one feedback response,
  inspection attempts, complaint queues, and warranty lookup.
- Fresh database `mck_cp06b_20260727` applied both migrations, repeated migration/seed safely,
  and passed all integration/coverage tests. Earlier diagnostic database `mck_cp06_20260727`
  is preserved for inspection.

## 10. Known limitations

- Live Telegram connectivity was not smoke-tested because no real bot token was requested.
- Quality policy/checklist provisioning remains a controlled database administration task.
- Direct CP-06 resident command replies are Uzbek Latin; full Cyrillic localization should be
  added before a buyer requires the quality flow in both scripts.
- Status/complaint notifications and automatic review reminders wait for CP-07; staff must run
  `/complaints` manually.
- Warranty is a dated operational record only; it is not a legal guarantee or automated claim policy.
- Rework returns to the existing executor. If that executor becomes unavailable, an explicit
  rework reassignment policy/command is still needed.
- Telegram photo metadata remains dependent on Telegram and is not an independent evidence archive.

## 11. Risks and technical debt

- Any owner of a request consolidated into a shared order can accept/request rework for that
  shared outcome; risky categories should use operator-only acceptance until buyer policy is clear.
- Staff and resident Telegram commands do not yet have a universal update-receipt/idempotent reply
  layer; database versions and uniqueness protect material mutations, but retry UX can improve.
- Manual `/complaints` review can miss deadlines until CP-07 schedules reminders and durable delivery.
- Quality-template changes need a safe administrative workflow that deactivates/activates versions
  without leaving a category with no active policy.
- Complaint and quality text retention/legal-hold rules require formal approval before production.
- Two sequential additive migrations represent one CP-06 schema because the order-version safety
  hardening was identified before approval; they must deploy together.

## 12. Rollback procedure

Set both bot adapters false to stop new commands, then deploy CP-05-compatible application code.
The additive CP-06 tables, permissions, and enums can remain unused. Before a real migration, take
and verify a backup. If schema restoration is mandatory, restore that backup into a separate
database and switch through an approved procedure; do not drop quality tables/enums, delete audit
history, or edit Drizzle journal rows. No destructive cleanup was performed.

## 13. Recommended next checkpoint

CP-07 — notifications and operational automation: transactional outbox, reliable Telegram material
status/acceptance/complaint notifications, retry/backoff and failure visibility, scheduled overdue
and complaint-review scans, escalation acknowledgement/resolution, and a basic weekly summary.
Keep PostgreSQL polling and one process for the low-cost pilot; add no broker or paid service.

## 14. Waiting for: APPROVE CP-06

Stop here. Do not begin CP-07 without the exact approval phrase `APPROVE CP-06`.
