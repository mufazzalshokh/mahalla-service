CHECKPOINT: CP-05 — Assignment and execution tracking
STATUS: PASS

## 1. Objective

Deliver the next sellable staff-bot slice: executor eligibility and assignment, accept/decline, deadlines, work logs, controlled before/after evidence, blocked/resumed work, completion submission, execution SLA tracking, and overdue escalation with authorization, audit, and concurrency protection.

## 2. Scope completed

- Added executor profiles with stable codes, availability, scoped roles, and category capabilities.
- Added eligible-executor listing and assignment by human executor code and explicit-timezone deadline.
- Preserved each assignment attempt as pending, accepted, declined, completed, or cancelled.
- Added executor `/mine`, accept, decline, progress, block, unblock, and completion commands.
- Added controlled Telegram photo evidence captions for `BEFORE` and `AFTER` phases.
- Added executor ownership, lifecycle-state, file identity/type/size/count, and note validation.
- Added transactional work logs for progress, blocked, unblocked, and completion activity.
- Added execution SLA clocks that store target, start, blocked pause duration, resume, and stop.
- Kept overdue as a derived condition and added idempotent authorized `/overdue` escalation scanning.
- Extended the central order transition transaction to update order, assignment, SLA, work log, history, and audit atomically.
- Added real concurrency verification for exactly one active assignment.
- Updated staff bot, migration, seed permissions, architecture, ADR, security/privacy, runbook, data model, and traceability.

## 3. Files created or modified

- Domain/application: `src/domain/execution/work-evidence-policy.ts`, `src/application/execution/*`, order snapshot/transition and staff-operation services.
- Persistence: `src/infrastructure/execution/postgres-execution-repository.ts`, executor eligibility and order repository, schema and seed.
- Telegram/bootstrap: staff controller/photo adapter, staff bot, and `src/main.ts` wiring.
- Migration: `drizzle/20260727081320_tiny_changeling.sql` and Drizzle metadata.
- Tests: execution policy/service/controller/operation tests, CP-05 PostgreSQL integration, and updated persistence fixtures.
- Documentation: ADR-0006, assignment/execution architecture, state/data/sequence diagrams, staff runbook, threat/privacy model, assumptions, traceability, index, and this report.

## 4. Architecture decisions

- Model executor eligibility as active user + available profile + scoped executor role + category capability.
- Address staff with stable executor codes; never require Telegram users to type internal UUIDs.
- Preserve assignment attempts separately while keeping current executor/deadline as an order projection.
- Keep every state change behind the existing central order transition service and optimistic version guard.
- Store bounded Telegram photo metadata only; do not download media or add object-storage cost in the first-sale pilot.
- Treat evidence as optional supporting material under BR-016, not contractual proof.
- Start SLA on executor acceptance, pause during `BLOCKED`, resume on progress, and stop on completion submission/cancellation.
- Keep overdue derived and create escalation on authorized query, avoiding a scheduler/queue until CP-07.
- Use partial unique indexes for one active assignment and one active deadline escalation per order.
- Require explicit ISO timezone offsets for deadlines and persist timezone-aware UTC timestamps.

## 5. Commands executed

- `pnpm.cmd db:generate`
- `pnpm.cmd format`
- `pnpm.cmd check`
- `pnpm.cmd db:check`
- `pnpm.cmd test:integration`
- `pnpm.cmd test:coverage`
- `pnpm.cmd audit --audit-level moderate`
- Started the existing disposable PostgreSQL 18 cluster, created fresh CP-05 databases, ran migration/seed/tests repeatedly, and stopped the server.

## 6. Test results with actual outcomes

- Final `pnpm.cmd check`: PASS — formatting, lint, strict typecheck, module boundaries, 76/76 local tests, and build.
- Final full real-PostgreSQL integration suite: 19/19 PASS across 5 files.
- Exact-code coverage execution: 95/95 PASS across 21 files.
- Overall coverage: 86.25% statements, 81.25% branches, 91.38% functions, 90.09% lines.
- Order lifecycle state machine: 100% statements, branches, functions, and lines.
- Work evidence policy: 100% statements, branches, functions, and lines.
- Migration consistency: PASS (`Everything's fine`).
- Dependency audit at moderate-and-higher severity: no known vulnerabilities.
- Initial integration run found lowercase synthetic order identifiers; fixture corrected to production uppercase behavior.
- Second run found timestamp binding inside SLA pause arithmetic; corrected with an explicit timestamptz expression.
- Coverage rerun found fixed executor codes made the fixture non-repeatable; codes are now unique per run and the preserved database reruns pass.
- No live Telegram token, queue, object store, scheduler, or paid external service was required.

## 7. Acceptance-criteria matrix

| Criterion                                   | Evidence                                                         | Result |
| ------------------------------------------- | ---------------------------------------------------------------- | ------ |
| Persisted executor model                    | profiles, codes, availability, role scope and capabilities       | PASS   |
| Eligible executor listing                   | service authorization and real DB filtering                      | PASS   |
| Authorized assignment with deadline         | controller/service/DB lifecycle tests                            | PASS   |
| Ineligible/unavailable executor rejected    | eligibility repository and integration assertion                 | PASS   |
| Accept or decline by current executor       | state-machine actor checks and DB assignment status              | PASS   |
| Declined attempt preserved for audit        | real assignment reason/status assertion                          | PASS   |
| Progress work logs                          | normalized note policy and DB/audit assertion                    | PASS   |
| Block and resume                            | state/history/log plus SLA pause/resume assertions               | PASS   |
| Before/after evidence                       | controller/policy and two-phase DB assertions                    | PASS   |
| Evidence size/type/count controls           | 100%-covered critical policy and DB constraints                  | PASS   |
| Completion request                          | `IN_PROGRESS → AWAITING_ACCEPTANCE`, summary/log/clock assertion | PASS   |
| SLA start/pause/resume/stop                 | real PostgreSQL clock assertions                                 | PASS   |
| Idempotent overdue escalation               | repeated real scan creates one escalation and audit              | PASS   |
| Concurrent assignment safety                | simultaneous commands produce one active assignment              | PASS   |
| Backend area and executor ownership         | unit and real wrong-executor denial                              | PASS   |
| Documentation/runbook/security synchronized | repository artifacts                                             | PASS   |

## 8. Security and privacy review

- Active staff principal and persisted permissions are reloaded for every command.
- Operator assignment is area-scoped; executor activity requires the current-assignee identity and appropriate area grant.
- Executor availability, role scope, category capability, and user status are all checked in the backend.
- Ambiguous deadlines are rejected; domain and database ensure future timestamps.
- Work notes are bounded. Evidence requires Telegram identity, JPEG/PNG, positive size up to 10 MB, and three items per phase.
- `AFTER` evidence is rejected until work starts; evidence for another executor is rejected.
- SQL is parameterized and material transition effects commit transactionally.
- Audit contains evidence record identity/phase, not raw Telegram file IDs or work-note content.
- No media is downloaded, executed, made public, or claimed as durable contractual evidence.
- Retention remains provisional and requires owner/legal approval before real-data production use.

## 9. Database and migration review

- Additive migration creates five enums and seven tables: executor profiles, capabilities, assignments, work logs, work evidence, SLA clocks, and escalations.
- It changes no existing column and contains no drop, truncate, or data-delete statement.
- Foreign keys preserve user/order/category ownership; assignment and evidence records use restrictive deletion where appropriate.
- Partial unique indexes enforce one pending/accepted assignment and one open/acknowledged deadline escalation per order.
- Evidence size/media, work-note length, future assignment deadline, and nonnegative paused-time constraints provide defense in depth.
- Assignment, clock, work log, history, and audit writes share the order transition transaction.
- Migration and seed ran repeatedly on PostgreSQL 18 and Drizzle metadata validation passed.
- Failed and successful disposable databases (`mck_cp05_20260727`, `mck_cp05b_20260727`, `mck_cp05c_20260727`) are preserved in the stopped temporary cluster; nothing was deleted.

## 10. Known limitations

- Live Telegram connectivity was not smoke-tested because no real token was requested.
- Executor profile/capability provisioning remains an administrative database operation; safe admin UI is deferred.
- Telegram controls underlying evidence availability; metadata alone is not an independent archive.
- Evidence is photo-only; video/documents, hashing, malware scanning, and object storage are deferred.
- `/overdue` must be run by staff; automatic schedule and notification delivery remain CP-07.
- SLA uses an absolute deadline and blocked pause seconds; working calendars/holidays and contractual policy are unapproved.
- Escalation acknowledgement/resolution schema exists, but interactive commands are deferred to CP-07 operations.
- Completion stops at `AWAITING_ACCEPTANCE`; inspection, resident acceptance, rework, warranty, feedback, and complaint are CP-06.

## 11. Risks and technical debt

- One long-polling consumer per bot token remains required.
- Staff commands do not yet have Telegram update receipts; optimistic versions and unique constraints protect material mutations, but reply replay can improve UX.
- A query-time overdue scan can be missed if operators ignore the runbook.
- Telegram bot/account loss can make evidence unavailable before retention expires.
- Availability/capability changes during an active assignment do not cancel work automatically, by design.
- Evidence content authenticity is not cryptographically proven.
- Current assignment projection and immutable attempts must stay synchronized through the central repository; direct SQL lifecycle updates remain prohibited.
- CP-06 rework must explicitly reopen or create the appropriate assignment/SLA semantics after a submitted completion.
- The repository has no committed baseline yet and all project files remain untracked; create a reviewed initial commit before deployment or collaborative handoff.

## 12. Rollback procedure

Set `STAFF_BOT_ENABLED=false` to stop staff commands, then deploy CP-04-compatible application code. The additive CP-05 tables and permissions can remain unused. Before any production migration, take and verify a backup. If schema rollback is mandatory, restore that backup into a separate database rather than dropping tables, enums, indexes, or migration history. No destructive cleanup was performed.

## 13. Recommended next checkpoint

CP-06 — quality, acceptance, warranty, feedback, and complaints: configurable category quality checklist, inspection, operator/resident acceptance authority, rework lifecycle and SLA semantics, warranty, rating, complaint, and controlled reopen. Continue deferring payment, finance, dashboards, and extra infrastructure until revenue or an approved requirement justifies them.

## 14. Waiting for: APPROVE CP-05

Stop here. Do not begin CP-06 without the exact approval phrase `APPROVE CP-05`.
