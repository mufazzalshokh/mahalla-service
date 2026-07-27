# ADR-0004: Separate request/order lifecycles with transactional audit

- Status: Accepted
- Date: 2026-07-27

## Context

A reported need is not yet an operational commitment. Combining intake validation and service execution into one status enum would permit invalid transitions, complicate permissions, and make reporting ambiguous. Concurrent staff/bot commands can also race.

## Decision

Use separate request and order aggregates with explicit state machines. All transitions are authorized in the domain layer. Persist an order transition, version increment, status-history record, and audit record in one PostgreSQL transaction using optimistic concurrency. Scope role grants by service area, with nullable scope representing a deliberate global grant. Enforce audit immutability in PostgreSQL.

## Consequences

- Intake and execution can evolve independently and retain precise terminology.
- Rejected/cancelled requests do not create phantom orders.
- Concurrent commands return a conflict rather than overwriting one another.
- Future controllers and Telegram handlers must load a backend principal and call the application service.
- Some lifecycle metadata (notifications and SLA effects) is declarative until CP-07.
