CHECKPOINT: CP-03 — Telegram resident onboarding and request intake
STATUS: PASS

## 1. Objective

Deliver the first sellable resident-facing Telegram slice: bilingual onboarding, versioned consent, own-contact capture, data-driven category selection, description, address/location, controlled photos, review/confirmation, exactly-once ticket creation, and owner-scoped status lookup.

## 2. Scope completed

- Added a grammY long-polling resident bot bootstrap behind typed environment configuration.
- Added thin Telegram routing/controller and Uzbek Latin/Cyrillic translation resources.
- Added a pure, reusable intake planner covering all conversation steps and validation.
- Persisted resident profiles, consent, resumable sessions, update receipts, and controlled attachment metadata.
- Added collision-free human ticket allocation with `MCK-YYYY-NNNNNNNN` format.
- Processed each Telegram update within a PostgreSQL transaction with a unique receipt and per-resident lock.
- Created address, request, initial status history, audit, optional photos, and stored response atomically.
- Replayed duplicate update responses and serialized double-confirm updates without duplicate requests.
- Added owner-scoped `/status <ticket>` behavior.
- Cleared submitted conversation drafts to avoid duplicating phone/address/photo metadata.
- Added threat model, privacy/retention defaults, sequence diagrams, runbook, and traceability evidence.

## 3. Files created or modified

- Application: `src/application/intake/{intake-types,resident-intake-planner,resident-intake-unit-of-work,handle-resident-update-service}.ts`.
- Telegram: `src/interfaces/telegram/{resident-bot,resident-telegram-controller,translations}.ts`.
- Persistence/config: `src/infrastructure/intake/postgres-resident-intake-unit-of-work.ts`, `src/infrastructure/database/schema.ts`, `src/config/environment.ts`, `src/main.ts`, `.env.example`.
- Migration: `drizzle/20260726214434_ambitious_hedge_knight.sql`, updated Drizzle journal/snapshot.
- Tests: `test/resident-intake-planner.test.ts`, `test/resident-telegram-controller.test.ts`, `test/intake.integration.test.ts`, updated environment/configuration.
- Documentation: sequence diagrams, resident-bot runbook, threat model, privacy/retention, data model, assumptions, testing strategy, traceability, documentation index, and this report.
- Dependencies: `grammy` plus lockfile update.

## 4. Architecture decisions

- Keep the grammY adapter thin; validation and conversation decisions live in a Telegram-independent planner.
- Use PostgreSQL update receipts and transaction-scoped per-user advisory locks instead of Redis/queues.
- Store the final response with each update receipt so Telegram retries replay the same result.
- Use a database sequence for human-readable tickets; never expose Telegram/user identifiers in ticket numbers.
- Require Telegram's contact owner ID to equal the update sender.
- Accept Telegram `photo` events only, maximum three and 10 MB each; persist file metadata rather than downloading media.
- Reply only after transaction commit. A failed Telegram reply is safe because a retry replays the stored response.
- Keep long polling and one active consumer for the near-zero-budget pilot.

## 5. Commands executed

- `pnpm add grammy`
- `pnpm db:generate`
- `pnpm db:check`
- `pnpm format`
- `pnpm check`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm audit --audit-level moderate`
- Started isolated PostgreSQL 18, created fresh disposable `mck_cp03_20260727`, ran tests, and stopped the server.

## 6. Test results with actual outcomes

- `pnpm check`: PASS — formatting, lint, strict typecheck, boundaries, unit/API tests, build.
- Local unit/API/controller tests: 42/42 PASS across 9 files.
- Real PostgreSQL integration tests: 10/10 PASS across 3 files.
- Coverage execution: 52/52 PASS across 12 files.
- Overall coverage: 93.49% statements, 88.05% branches, 98.94% functions, 95.91% lines.
- Critical intake planner: 97.64% statements, 92.92% branches, 100% functions, 97.50% lines; enforced minimum is 90% for every metric.
- Migration consistency: PASS.
- Dependency audit at moderate-and-higher severity: no known vulnerabilities.
- No live Telegram token/network was required; controller and core behavior were tested deterministically.

## 7. Acceptance-criteria matrix

| Criterion                                | Evidence                                                     | Result |
| ---------------------------------------- | ------------------------------------------------------------ | ------ |
| `/start` and bilingual selection         | planner/controller tests, translations                       | PASS   |
| Versioned privacy consent before contact | planner + consent integration assertions                     | PASS   |
| Own Telegram contact and validation      | ownership/format tests                                       | PASS   |
| Data-driven category selection           | seeded catalog lookup + forged callback test                 | PASS   |
| Description and address/location         | length/range tests + persisted coordinates                   | PASS   |
| Controlled optional photos               | count/size rules + attachment integration assertion          | PASS   |
| Review and confirm                       | complete planner-flow test                                   | PASS   |
| Exactly one request under Telegram retry | concurrent same-update test + unique receipt/submission keys | PASS   |
| Exactly one request under double-confirm | per-user lock test with different update IDs                 | PASS   |
| Human-readable unique ticket             | database sequence + format assertion                         | PASS   |
| Owner-only status lookup                 | owner/other-user database test                               | PASS   |
| Initial history and audit                | real database assertions                                     | PASS   |
| Thin handler/no live Telegram dependency | controller tests and module-boundary gate                    | PASS   |
| Documentation/security/runbook updated   | repository documents                                         | PASS   |

## 8. Security and privacy review

- Bot token is optional/validated, never committed, and required only when enabling the bot.
- Update identity, contact ownership, callback category membership, text length, coordinates, photo size/count, and user active status are validated.
- SQL access is parameterized; database FKs/checks/unique constraints provide defense in depth.
- Ticket lookup includes requester ownership, preventing cross-resident status access.
- Raw phone/address/description/photo IDs are not logged or copied into audit.
- Conversation drafts are cleared after submission.
- Handler failures expose a generic resident message and log only error metadata plus update ID.
- Draft consent wording and retention policy still require MCK/legal approval before real resident data is accepted.

## 9. Database and migration review

- Additive migration creates ticket sequence and five tables: resident profiles, privacy consents, Telegram intake sessions, Telegram update receipts, and attachments.
- Adds a nullable unique `submission_update_id` to service requests for Telegram idempotency.
- Adds consent/update uniqueness, session language/step/version checks, phone format, attachment type/size, and attachment identity constraints.
- Migration and seed execution were repeated successfully against real PostgreSQL.
- Submission transaction includes address, request, attachments, initial request history, audit, cleared session, and replay response.
- No existing/user database was modified or deleted. The disposable test database remains in a stopped temporary cluster.

## 10. Known limitations

- Privacy/consent wording and retention rules are draft; synthetic demonstration data only until OQ-003/OQ-004 approval.
- Live Telegram connectivity was not exercised because no token was requested or exposed; the adapter compiled and deterministic controller behavior passed.
- Secure manual phone verification is not implemented; only the sender's Telegram contact is accepted.
- Telegram photos are not durable contractual evidence and are not malware-scanned/downloaded.
- Abandoned-session expiry and seven-day update-receipt cleanup are documented but not automated.
- One active long-polling consumer is required.
- Safety/impact questions, validation, deduplication, and priority scoring begin in CP-04.
- Push notifications and delivery-failure visibility remain CP-07.

## 11. Risks and technical debt

- Update receipts may temporarily contain rendered review details for safe replay; cleanup automation is required before a real-data pilot.
- PostgreSQL advisory locking is appropriate for pilot volume but should be measured before high scale.
- Telegram file retention and availability are controlled by Telegram, not MCK.
- Bot account recovery, Telegram-to-resident relinking, and resident data-rights workflows remain undefined.
- grammY event-registration wiring is excluded from coverage as thin framework bootstrap; controller and application behavior are covered.

## 12. Rollback procedure

Set `RESIDENT_BOT_ENABLED=false` and roll back the application/lockfile to CP-02-compatible code. The additive CP-03 tables and nullable service-request column can safely remain unused. Before production migration, take and verify a backup. If schema rollback becomes mandatory, restore the verified pre-migration backup into a separate database rather than dropping tables or manually altering migration history. No destructive local cleanup was performed.

## 13. Recommended next checkpoint

CP-04 — validation, deduplication, triage, and explainable prioritization: operator validation workflow, source confidence, duplicate suggestions without data loss, atomic request-to-order conversion, versioned factor scores, manual override authorization/reason/audit, and Telegram operator flow.

## 14. Waiting for: APPROVE CP-03

Stop here. Do not begin CP-04 without the exact approval phrase `APPROVE CP-03`.
