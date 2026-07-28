# MCK platform documentation

This directory is the source of truth for the incremental Mahalla Service Company
(MCK) order portfolio and service-management platform.

## Current checkpoint

CP-00 through CP-10 are approved. CP-11 production readiness and first paid pilot deployment is
next.

## Documents

- [Discovery](00-discovery.md)
- [Business requirements](01-business-requirements.md)
- [Glossary](02-glossary.md)
- [Requirements traceability](requirements-traceability.md)
- [MVP scope](mvp-scope.md)
- [Assumptions and decisions](assumptions.md)
- [Open confirmation items](open-questions.md)
- [Risk register](risk-register.md)
- [Architecture options](architecture/options.md)
- [System context](architecture/system-context.md)
- [Container architecture](architecture/containers.md)
- [Foundation components](architecture/components.md)
- [Domain model](architecture/domain-model.md)
- [Request and order state machines](architecture/state-machine.md)
- [Initial data model](architecture/data-model.md)
- [Interaction sequence diagrams](architecture/sequence-diagrams.md)
- [Validation, duplicate review, and priority](architecture/triage-and-priority.md)
- [Assignment and execution](architecture/assignment-and-execution.md)
- [Quality and complaints](architecture/quality-and-complaints.md)
- [Notifications and operational automation](architecture/notifications-and-automation.md)
- [Operational reporting and PDCA](architecture/reporting-and-pdca.md)
- [Commercial records and documents](architecture/commercial-and-documents.md)
- [Pilot deployment](architecture/deployment.md)
- [Testing strategy](testing-strategy.md)
- [Local development runbook](runbooks/local-development.md)
- [Database migration runbook](runbooks/database-migrations.md)
- [Resident bot runbook](runbooks/resident-bot.md)
- [Staff bot runbook](runbooks/staff-bot.md)
- [Commercial staff-bot runbook](runbooks/commercial-bot.md)
- [Backup and restore rehearsal](runbooks/backup-and-restore.md)
- [Pilot incident response](runbooks/incident-response.md)
- [Version control and checkpoint publishing](runbooks/version-control.md)
- [Telegram intake threat model](security/threat-model.md)
- [Provisional privacy and retention](security/privacy-and-retention.md)
- [ADR-0001: Lean modular monolith](adr/ADR-0001-lean-modular-monolith.md)
- [ADR-0002: Long polling first](adr/ADR-0002-telegram-long-polling-first.md)
- [ADR-0003: PostgreSQL and outbox](adr/ADR-0003-postgresql-and-transactional-outbox.md)
- [ADR-0004: Request/order lifecycles and transactional audit](adr/ADR-0004-request-order-lifecycles-and-transactional-audit.md)
- [ADR-0005: Deterministic priority and human duplicate decisions](adr/ADR-0005-deterministic-priority-and-human-duplicate-decisions.md)
- [ADR-0006: Pilot execution SLA and evidence](adr/ADR-0006-pilot-execution-sla-and-evidence.md)
- [ADR-0007: Pilot quality and complaint control](adr/ADR-0007-pilot-quality-and-complaint-control.md)
- [ADR-0008: PostgreSQL outbox and in-process automation](adr/ADR-0008-postgresql-outbox-and-in-process-automation.md)
- [ADR-0009: Live operational reporting and audited PDCA](adr/ADR-0009-live-operational-reporting-and-audited-pdca.md)
- [ADR-0010: Manual commercial ledger and immutable text documents](adr/ADR-0010-manual-commercial-ledger-and-immutable-text-documents.md)
- [ADR-0011: Zero-cost pilot hardening and operational signals](adr/ADR-0011-zero-cost-pilot-hardening.md)
- [CP-00 checkpoint record](checkpoints/CP-00-discovery.md)
- [CP-01 checkpoint record](checkpoints/CP-01-engineering-foundation.md)
- [CP-02 checkpoint record](checkpoints/CP-02-domain-model-and-persistence.md)
- [CP-03 checkpoint record](checkpoints/CP-03-telegram-resident-intake.md)
- [CP-04 checkpoint record](checkpoints/CP-04-validation-triage-and-priority.md)
- [CP-05 checkpoint record](checkpoints/CP-05-assignment-and-execution.md)
- [CP-06 checkpoint record](checkpoints/CP-06-quality-acceptance-and-complaints.md)
- [CP-07 checkpoint record](checkpoints/CP-07-notifications-and-operational-automation.md)
- [CP-08 checkpoint record](checkpoints/CP-08-kpi-portfolio-reporting-and-pdca.md)
- [CP-08.1 checkpoint record](checkpoints/CP-08.1-bilingual-button-telegram-ux.md)
- [CP-09 checkpoint record](checkpoints/CP-09-contracts-documents-and-finance-foundation.md)
- [CP-10 checkpoint record](checkpoints/CP-10-security-reliability-and-observability-hardening.md)

## Evidence hierarchy

When sources disagree, use this order until a stakeholder approves a change:

1. Explicit stakeholder decisions recorded after a checkpoint.
2. The source presentation, with its contradictions called out rather than hidden.
3. Reversible defaults in `assumptions.md`.
4. Candidate requirements from the project brief.

No document in this repository claims legal compliance. Privacy, retention,
contracts, payments, and employment rules require appropriate review before a
production launch.
