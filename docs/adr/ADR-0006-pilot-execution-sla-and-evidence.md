# ADR-0006: Pilot execution SLA and Telegram evidence

- Status: Accepted for pilot
- Date: 2026-07-27

## Context

CP-05 needs executor accountability, deadlines, before/after evidence, and escalation without adding a queue, scheduler, object store, or paid infrastructure before bot revenue exists.

## Decision

Represent an executor with an active user, scoped `executor` role, availability profile, stable human code, and explicit service-category capabilities. Preserve every assignment attempt in an `assignments` record; the order stores only the current executor and deadline projection.

Store work notes and Telegram photo metadata in PostgreSQL. Accept JPEG/PNG photo metadata only, maximum 10 MB and three photos per `BEFORE` or `AFTER` phase. Do not download media in the pilot. Audit evidence identity and phase without copying file IDs or notes into audit.

Use the assignment deadline as the pilot execution target. Start the execution clock when the executor accepts, pause while blocked, resume when unblocked, and stop on completion submission or cancellation. `OVERDUE` remains derived, not an order state. An authorized `/overdue` scan creates one open escalation per overdue order and is safe to repeat.

## Consequences

- The pilot runs in the existing process and PostgreSQL database with no recurring infrastructure cost.
- Assignment attempts, executor decisions, work activity, evidence, clock state, and escalations are queryable and auditable.
- Overdue discovery occurs when staff run the scan; durable scheduled scanning and notifications remain CP-07.
- Telegram controls media availability. Object storage, malware scanning, content hashing, and retention automation are required before evidence becomes contractual documentation.
