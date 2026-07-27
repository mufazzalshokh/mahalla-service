# ADR-0008: PostgreSQL outbox and in-process automation

## Status

Accepted for the first-sale pilot.

## Context

Material Telegram updates must not disappear when a business transaction succeeds, and missed
deadlines must not depend on an operator remembering a manual scan. The pilot budget does not
justify Redis, a broker, a hosted scheduler, or another application process.

## Decision

Store one notification intent per recipient in `notification_outbox` inside the same PostgreSQL
transaction as the request, order, or complaint change. A poller in the existing application
process claims due rows with `FOR UPDATE SKIP LOCKED` and a recoverable lease. Delivery uses bounded
exponential retry (30 seconds up to one hour, five attempts by default), then a visible dead-letter
state. Every attempt is retained separately. Staff may inspect and recover dead letters through
area-scoped commands.

Run deadline and complaint scans on the same configurable timer. A PostgreSQL transaction advisory
lock permits only one scanner at a time. Stable deduplication keys and the existing active-escalation
constraint make repeated scans safe. Automation only creates reminders, alerts, and escalation
records; it never reopens a complaint or changes an order lifecycle automatically.

Use fixed, bounded templates containing references, status, and deadlines rather than arbitrary
resident or complaint text. Require both bot tokens when automation is enabled.

## Consequences

- No additional paid or operational dependency is introduced.
- A committed business change always has durable notification intent for every resolved recipient.
- Delivery is at-least-once. A process crash after Telegram accepts a message but before PostgreSQL
  records success can create a duplicate; Telegram does not offer an idempotency key.
- One-process timers are adequate for the pilot; database locking keeps later replicas safe.
- Missing recipient Telegram IDs and permanent Telegram errors become visible dead letters rather
  than silent log-only failures.
- Broker extraction is justified only by measured throughput, isolation, or multi-channel needs.
