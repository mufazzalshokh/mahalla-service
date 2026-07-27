CHECKPOINT: CP-04 — Validation, duplicate review, triage, and priority
STATUS: PASS

## 1. Objective

Deliver the sellable staff-bot slice after resident intake: authorized request validation, missing-information dialogue, rejection, explainable and versioned priority, human-reviewed duplicate suggestions without data loss, and atomic request-to-order registration on a near-zero operating budget.

## 2. Scope completed

- Added a separate grammY staff bot using the existing process and PostgreSQL pool.
- Added commands for queue, validation, information request, triage, duplicate review/decision, override, registration, and rejection.
- Added resident `/respond TICKET information` handling for an owned missing-information request.
- Centralized request transitions with optimistic versioning, status history, dialogue messages, and audit in one transaction.
- Added a deterministic five-factor, versioned priority model with persisted inputs, contributions, explanation, score, and band.
- Derived source confidence from the persisted request source rather than staff input.
- Added authorized priority override with mandatory reason and preservation of calculated values.
- Added deterministic duplicate suggestions based on area, category, address, description, and optional coordinates.
- Required explicit staff confirmation/dismissal; requests are never automatically merged or deleted.
- Added atomic request registration that creates a new order or links a confirmed duplicate to an existing order.
- Promoted an existing order to a newly linked request's higher effective priority when applicable.
- Added schema constraints, seed values, migration, architecture/security documentation, runbook, and traceability.

## 3. Files created or modified

- Domain: `src/domain/priority/priority-calculator.ts`, `src/domain/duplicates/duplicate-confidence.ts`, request state machine and permissions.
- Application: request transition/response services and `src/application/triage/*` ports/services.
- Persistence: triage/request PostgreSQL repositories, principal lookup by Telegram ID, schema and seed updates.
- Telegram/bootstrap: staff bot/controller, resident response command, typed environment, and shared-pool startup wiring.
- Migration: `drizzle/20260727072511_serious_venus.sql` plus Drizzle journal/snapshot.
- Tests: priority, duplicate, triage-service, staff-controller, request-state updates, and CP-04 PostgreSQL integration tests.
- Documentation: ADR-0005, triage architecture, staff-bot runbook, sequence/security/traceability/index updates, and this report.

## 4. Architecture decisions

- Keep the sell-first deployment as one modular-monolith process, two BotFather tokens, long polling, and one small database pool.
- Reload active user and persisted area-scoped grants on every staff operation; command knowledge is not authorization.
- Use a deterministic weighted model rather than AI/vector infrastructure so scores are free, reproducible, and explainable.
- Version priority models and store complete factor evidence so historical decisions do not change when weights change.
- Inject source confidence from reference data; operators cannot type or manipulate that factor.
- Treat duplicate detection only as a suggestion. Confirmation/dismissal is a human, audited decision and both resident requests remain intact.
- Use request status/version compare-and-set as the registration concurrency guard; order/link/history/audit share one transaction.
- When linking a higher-priority confirmed request, promote the existing order's effective priority and assessment within the same transaction.
- Keep priority fields nullable for pre-CP-04/legacy orders; all CP-04-created orders populate them.

## 5. Commands executed

- `pnpm.cmd db:generate`
- `pnpm.cmd format`
- `pnpm.cmd check`
- `pnpm.cmd db:check`
- `pnpm.cmd test:integration`
- `pnpm.cmd exec vitest run test/triage.integration.test.ts`
- `pnpm.cmd test:coverage`
- `pnpm.cmd audit --audit-level moderate`
- Started existing disposable PostgreSQL 18 cluster, created new `mck_cp04_20260727`, ran final tests, and stopped the server.

## 6. Test results with actual outcomes

- `pnpm.cmd check`: PASS — format, lint, strict typecheck, module boundaries, 62/62 local tests, and build.
- Full real-PostgreSQL integration suite: 14/14 PASS across 4 files.
- Focused final CP-04 PostgreSQL suite after priority-promotion hardening: 4/4 PASS.
- Exact final-code coverage execution: 76/76 PASS across 17 files.
- Overall coverage: 85.01% statements, 80.63% branches, 91.90% functions, 88.52% lines.
- Priority calculator: 100% statements, branches, functions, and lines.
- Duplicate confidence: 96.15% statements, 96% branches, 100% functions and lines.
- Migration consistency: PASS (`Everything's fine`).
- Dependency audit at moderate-and-higher severity: no known vulnerabilities.
- No live Telegram token or paid external service was required.

## 7. Acceptance-criteria matrix

| Criterion                                          | Evidence                                                             | Result |
| -------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Authorized area-scoped staff operations            | persisted principal lookup, service denial, real wrong-scope DB test | PASS   |
| Start validation                                   | state-machine/service and PostgreSQL transition tests                | PASS   |
| Request and receive missing information            | two-direction timeline and owner response DB assertions              | PASS   |
| Reject with reason                                 | staff command and centralized transition path                        | PASS   |
| Versioned explainable priority                     | model/criteria seed, factor unit tests, assessment DB assertion      | PASS   |
| Source confidence cannot be typed by staff         | application injection test and stored source configuration           | PASS   |
| Priority bands and boundaries                      | critical calculator tests at all bands                               | PASS   |
| Override requires permission and reason            | application denial/validation and audit DB assertion                 | PASS   |
| Duplicate suggestions are explainable              | deterministic similarity unit tests and persisted evidence           | PASS   |
| No automatic merge or deletion                     | explicit decision service and two preserved request links            | PASS   |
| Confirmed duplicates share one order               | real two-request/one-order integration test                          | PASS   |
| Higher linked priority promotes order              | final real PostgreSQL score assertion                                | PASS   |
| Atomic, concurrency-safe registration              | simultaneous registration test: one success and one link             | PASS   |
| Separate low-cost staff bot                        | typed separate token, thin controller tests, compiled startup        | PASS   |
| Architecture/security/runbook/traceability updated | repository documents                                                 | PASS   |

## 8. Security and privacy review

- Staff bot token is separate, optional, syntactically validated, and not committed.
- An active database user and current area-scoped permission are required for every command.
- Resident information responses are restricted to the owning requester unless an authorized area validator acts.
- Commands are parsed into typed inputs; priority ranges, reasons, state transitions, and database constraints provide layered validation.
- SQL is parameterized. Registration uses optimistic concurrency and unique request-order linking.
- Calculated priority remains visible after override; actor, reason, before/after values, and time are auditable.
- Duplicate evidence and human decisions are retained; neither request nor resident evidence is deleted.
- Bot errors return a generic message; tokens and resident message content are not deliberately logged.
- Existing draft consent/retention limitations still prohibit unsupervised real-resident rollout without owner/legal approval.

## 9. Database and migration review

- The migration is additive: three enums, one order-number sequence, five triage/workflow tables, request workflow fields, source confidence, and nullable order priority fields.
- Foreign keys, unique candidate pairs, distinct-request and score checks, model/criterion uniqueness, override completeness, and message-length checks are enforced.
- Seed is repeatable and adds the five-factor `IMPACT_V1` model, source-confidence values, and operator permissions.
- Assessment writes, overrides, information dialogue, transitions, and registration audit commit transactionally.
- Request registration changes state, creates/links the order, records history, and writes audit in one transaction.
- Migration and seed ran repeatedly against PostgreSQL 18; Drizzle metadata validation passed.
- No drop/truncate/delete migration was generated. No existing/user database was modified or removed.
- Disposable database `mck_cp04_20260727` remains in the stopped temporary cluster for recoverable inspection.

## 10. Known limitations

- Live Telegram connectivity was not smoke-tested because no staff token was requested; deterministic controller/application behavior and adapter compilation passed.
- Staff account creation and Telegram-user linking are currently administrative database operations; a safe admin flow is deferred.
- Duplicate matching is intentionally simple and language-sensitive; operators must review false positives and can dismiss them.
- Only requests from the last 30 days, same category, and same area are considered as duplicate candidates.
- Operators type numeric factor judgments; a guided inline-question UI can improve usability after the first paid pilot.
- Information requests are pull interactions until CP-07 notification/outbox delivery.
- Rejection rules are authorized and reasoned but require final MCK policy wording.
- Historical/pre-CP-04 orders can have null priority fields.

## 11. Risks and technical debt

- Long polling still requires one active consumer per token; no distributed leader election exists.
- Telegram staff error replies are deliberately generic and do not yet expose a support correlation code.
- Re-running duplicate suggestions records another audit event and refreshes evidence; retention/volume should be measured.
- The active model selector assumes controlled administration of active models; model-management UI and activation transaction are deferred.
- Stop-word/token handling needs tuning from Uzbek Cyrillic/Latin pilot examples.
- Staff commands are not stored in Telegram update receipts; state/version/uniqueness protects material operations, but command-response replay could improve UX.
- No automated expiry exists yet for information requests or stale validation queue items.

## 12. Rollback procedure

Set `STAFF_BOT_ENABLED=false` to stop the new staff surface while leaving resident intake available. Roll the application back to CP-03-compatible code; the additive tables and nullable columns can remain unused. Before production migration, take and verify a backup. If schema rollback becomes mandatory, restore that verified pre-migration backup into a separate database instead of dropping tables, enums, or migration history. No destructive cleanup was performed.

## 13. Recommended next checkpoint

CP-05 — assignment and execution: operator assignment, executor accept/decline, due dates, progress/blocking states, completion submission, area/role authorization, Telegram staff workflow, transactional audit, and concurrency tests. Keep finance, contracts, payments, dashboards, and extra infrastructure deferred until bot revenue validates the next investment.

## 14. Waiting for: APPROVE CP-04

Stop here. Do not begin CP-05 without the exact approval phrase `APPROVE CP-04`.
