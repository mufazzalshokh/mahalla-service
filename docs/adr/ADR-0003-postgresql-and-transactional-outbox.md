# ADR-0003: PostgreSQL and transactional outbox

- Status: Accepted for CP-01
- Date: 2026-07-27

## Context

Telegram retries, concurrent staff actions, auditability and reliable notifications
require database uniqueness, transactions and conflict control. Operating Redis or a
message broker is not justified for a small pilot.

## Decision

Use PostgreSQL as the system of record. In CP-02, use Drizzle behind repository
ports. In CP-07, store notification intent in an outbox row in the same transaction
as business state and poll it from the application process.

## Consequences

- the pilot operates one durable dependency;
- important invariants can use constraints and transactions;
- the outbox worker must support locking, retry, dead-letter visibility and recovery;
- a broker is added only after measured throughput or isolation requirements.
