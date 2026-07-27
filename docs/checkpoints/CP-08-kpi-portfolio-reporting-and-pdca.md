CHECKPOINT: CP-08 — KPI, portfolio reporting, and PDCA
STATUS: PASS

## 1. Objective

Deliver a sellable, near-zero-cost management reporting loop: precisely defined weekly/monthly
operational metrics, area-scoped Telegram/CSV delivery, repeat-problem evidence, and accountable PDCA
actions without adding BI, warehouse, AI, or scheduler infrastructure.

## 2. Scope completed

- Defined current week/month-to-date boundaries in Asia/Tashkent with UTC storage and half-open
  event windows.
- Implemented portfolio, SLA, quality, complaint, repeat-problem, category, and PDCA aggregate data.
- Added compact `/report week|month` staff summaries and `/reportcsv week|month` document delivery.
- Added separate `report.read` and `report.export` permissions with exact service-area filtering.
- Added CSV delimiter/quote/newline handling and spreadsheet-formula neutralization.
- Added `/pdca` list, `/pdca new`, and `/pdca move` with owner, area, problem, plan, expected outcome,
  deadline, overdue state, result, strict lifecycle, revision/cancellation, history, audit, and
  optimistic concurrency.
- Kept profitability out of CP-08 until CP-09 defines revenue, expense, allocation, and accounting
  sources instead of inventing financial numbers.
- Updated architecture, ADR, traceability, data/domain models, assumptions, staff runbook,
  security/privacy, testing strategy, risks, documentation index, and checkpoint status.

## 3. Files created or modified

- Domain/application: reporting period/formulas, operational report model, CSV policy/formatter,
  reporting repository/service ports, PDCA policy/repository/service, permissions, and staff dispatch.
- Persistence/bootstrap: reporting aggregate repository, PDCA repository, schema, seed, and main
  wiring.
- Telegram: report/CSV/PDCA parsing, help, and in-memory CSV document sending.
- Migration: `drizzle/20260727120814_absent_eddie_brock.sql`, journal, and snapshot.
- Tests: reporting period/formula, CSV security, reporting/PDCA services, staff/controller, and real
  PostgreSQL reporting/PDCA integration suites.
- Documentation: ADR-0009, reporting/PDCA architecture, synchronized cross-cutting documents, and
  this checkpoint record.

## 4. Architecture decisions

- Query live operational facts from PostgreSQL; add no BI product, warehouse, cache, read replica,
  scheduled snapshot job, or paid service for the pilot.
- Use Monday/month-start Tashkent boundaries and `start <= event < asOf`; label backlog/open/paused
  and active PDCA metrics as point-in-time projections.
- Define completion by accepted `orders.completed_at`; SLA attainment excludes completions without a
  deadline and returns `N/A` for an empty denominator.
- Treat repeats only as confirmed duplicate decisions and persisted many-request order links; do not
  infer matches from text or AI.
- Authorize read and export separately and apply the caller's area predicate to every aggregate
  source. Only an explicitly global grant removes the predicate.
- Persist PDCA actions, append-only history, and audit in PostgreSQL with the explicit
  PLAN→DO→CHECK→ACT→COMPLETED lifecycle and reasoned revision/cancellation.
- Generate CSV in memory and neutralize formula-like cell prefixes; do not retain exports in the
  application.

## 5. Commands executed

- `pnpm.cmd exec prettier --write README.md docs src test package.json`
- `pnpm.cmd lint`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `pnpm.cmd test:integration` with a fresh PostgreSQL database
- `pnpm.cmd test:coverage` with fresh real PostgreSQL databases
- `pnpm.cmd check`
- `pnpm.cmd db:generate` through the documented Node bootstrap workaround for sandbox-specific
  `uv_os_get_passwd`
- `pnpm.cmd db:check` through the same bootstrap workaround
- `pnpm.cmd audit --audit-level moderate`
- Started the existing disposable PostgreSQL 18 cluster on port 55483 and created isolated CP-08
  test databases.

## 6. Test results with actual outcomes

- Final `pnpm.cmd check`: PASS — formatting, zero-warning lint, strict typecheck, dependency
  boundaries, 120/120 local tests, and production build.
- Fresh real-PostgreSQL integration suite: 28/28 PASS across 8 files, including repeated migration
  and seed execution.
- Database-backed coverage run: 148/148 PASS across 36 files.
- Overall coverage: 88.35% statements, 80.04% branches, 92.28% functions, 92.07% lines.
- Reporting application coverage: 97.67% statements, 94.73% branches, 92.3% functions, 100% lines.
- PDCA application coverage: 96.42% statements, 92.3% branches, 87.5% functions, 100% lines; the
  policy lifecycle itself is exhaustively tested.
- Migration consistency: PASS. Dependency audit: no known moderate-or-higher vulnerabilities.
- The first coverage command reused a previously mutated integration database and exposed the
  suite's clean-database assumption; fresh isolated databases passed all tests. The initial coverage
  result then correctly failed the 80% branch gate at 78.18%; meaningful scope, formatter, dispatch,
  and invalid-command cases raised it to 80.04%.

## 7. Acceptance-criteria matrix

| Criterion                            | Evidence                                                                   | Result |
| ------------------------------------ | -------------------------------------------------------------------------- | ------ |
| Precise KPI definitions              | versioned KPI dictionary with numerator/denominator/window/source rules    | PASS   |
| Weekly/monthly Tashkent boundaries   | exact UTC boundary and invalid-date unit tests                             | PASS   |
| Portfolio and SLA summary            | live aggregate repository and real database execution                      | PASS   |
| Quality and complaint metrics        | inspection/acceptance/rework/feedback/complaint aggregate queries          | PASS   |
| Repeat-problem analysis              | confirmed duplicates, persisted consolidation, top-category evidence       | PASS   |
| Point-in-time values identified      | architecture/report labels live backlog/open/paused/action metrics         | PASS   |
| Scoped Telegram summary              | `/report` parsing, dispatch, permission and database-scope tests           | PASS   |
| Exportable report                    | Telegram CSV document, quoting/injection tests, separate export permission | PASS   |
| PDCA action accountability           | area/owner/deadline/problem/plan/outcome/result persistence                | PASS   |
| Controlled PDCA lifecycle            | valid/invalid/revision/cancel/closed policy tests                          | PASS   |
| PDCA history/audit/concurrency       | full real-database cycle and two-writer conflict test                      | PASS   |
| Near-zero incremental cost           | existing process and PostgreSQL only                                       | PASS   |
| No ambiguous profitability claim     | finance explicitly deferred to CP-09                                       | PASS   |
| Migration/docs/security synchronized | additive migration, ADR, traceability, runbook and threat review           | PASS   |

## 8. Security and privacy review

- Backend permissions, not Telegram command visibility, control report read, export, and PDCA change.
- Every aggregate source receives the authorized area filter; empty scope is forbidden and only an
  explicit global grant removes filtering.
- Reports contain operational counts/category codes, not resident names, Telegram IDs, phone,
  address, description, complaint reason, or evidence identifiers.
- CSV encoding neutralizes leading `=`, `+`, `-`, and `@`, doubles quotes, normalizes newlines, and
  quotes delimiters.
- Export copies leave application access control, so the runbook treats them as sensitive records
  requiring approved storage/sharing.
- PDCA changes require `pdca.manage`, use actor identity and optimistic versioning, and write history
  plus audit in the same transaction.
- Report/PDCA query values are parameterized; user-provided text is bounded and database-constrained.

## 9. Database and migration review

- The additive migration creates `pdca_stage`, `pdca_action_seq`, `pdca_actions`, and
  `pdca_action_history`; it adds no reporting snapshot table.
- Checks enforce deadline-after-creation, text/result bounds, nonnegative versions, and coherent
  completion timestamp/result state.
- Unique/index rules protect human action codes, one history fact per action version, area/stage/due,
  owner/stage/due, and action timelines.
- Restrictive foreign keys prevent orphaning actor, owner, area, category, action, or history facts.
- Seed adds report/PDCA grants to `operator_manager`; administrators receive all permission keys via
  the existing idempotent seed policy.
- No existing table, column, enum, record, audit fact, or journal entry is dropped or rewritten.
- Fresh database `mck_cp08_coverage3_20260727` applied/reapplied all migrations and seeds safely and
  passed all 148 database-backed coverage tests.

## 10. Known limitations

- Reports are live projections, not immutable closed-period snapshots; later status changes prevent
  exact historical backlog reconstruction.
- The pilot fixed offset implements Asia/Tashkent's UTC+05:00 policy; a timezone library is required
  if operations expand to DST/multiple zones.
- KPI targets/warning/critical thresholds remain operational-owner inputs; formulas and actuals are
  implemented, but the product does not invent targets.
- Profitability, revenue, expense, collection, contracts, quotations, and document storage remain
  CP-09.
- Repeat analysis uses confirmed structured evidence, not semantic clustering or automatic root
  cause classification.
- CSV is the long-form report; there is no chart UI, scheduled email, immutable export registry, or
  third-party dashboard.
- Live Telegram document delivery was not smoke-tested because real bot tokens were neither needed
  nor exposed.

## 11. Risks and technical debt

- Aggregate queries are appropriate for pilot volume but must be measured before larger rollouts;
  materialized views/read replicas/warehouse work require evidence and funding.
- Current-status backlog metrics queried with a historical `asOf` are not bitemporal; callers should
  use present generation time until snapshots are funded.
- Category top-five ranking starts from request activity, so complaint/rework-only categories are not
  listed as top categories in the pilot summary.
- PDCA owner is the creating manager; reassignment, category-assisted creation, attachments, and
  notifications are future refinements.
- CSV remains a portable copy once downloaded and needs operational handling controls outside the
  system.
- Branch coverage passes narrowly at 80.04%; keep adding behavior-driven edge tests as later
  checkpoints add code.

## 12. Rollback procedure

Disable `STAFF_BOT_ENABLED` or deploy CP-07-compatible application code to remove access to the new
commands while leaving operational data intact. The new tables are additive and do not affect prior
request/order flows. Before a real migration, take and verify a backup. If schema restoration is
mandatory, restore that backup into a separate database and switch through an approved procedure;
do not drop PDCA tables/types, delete history/audit rows, or edit the Drizzle journal manually. No
destructive cleanup was performed.

## 13. Recommended next checkpoint

CP-09 — Contracts, documents, and finance foundation: define quotation/contract/acceptance-document
ownership and exact revenue, expense, payment, margin, and allocation rules before implementation.
Keep payment/storage providers behind interfaces and feature flags, and preserve the sell-first
sequence rather than buying integrations before a customer funds or requires them.

## 14. Waiting for: APPROVE CP-08

Stop here. Do not begin CP-09 without the exact approval phrase `APPROVE CP-08`.
