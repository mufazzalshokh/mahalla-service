# Quality, acceptance, warranty, feedback, and complaints

## Policy

Each service category has one active, versioned checklist template. It controls its
items, whether inspection is mandatory, who may accept, warranty days, rework target,
and complaint-review target. Historical inspections retain their template and exact
order version, so a passing result cannot be reused after a rework cycle.

The pilot seed uses three required checks: work complete, result safely tested, and
work area clean. Electrical work requires a passing inspection. Other categories
allow the operator to inspect but do not block owner/operator acceptance.

## Consistency and authorization

- An inspection requires `quality.inspect`, area scope, and `AWAITING_ACCEPTANCE`.
- Resident acceptance/rework requires an active Telegram-linked user who owns at least
  one request linked to the order. Operator actions require area-scoped permissions.
- Persistence rechecks resident ownership, active policy, warranty value, and any
  passing inspection inside the order transition transaction.
- Acceptance, order status/history/audit, and warranty commit together.
- Rework, a new pending assignment, reset SLA, status/history/audit, and an optional
  complaint reopen commit together.
- Optimistic order versions serialize competing accept/rework decisions.

## Complaint rule

Submitting a complaint records `OPEN` status and a review deadline; it never reopens
an order. `/reopen COMPLAINT reason` is a separate authorized decision. Whether the
complaint was received inside the current warranty is captured as a fact, not used to
silently reject the resident.

An operator may resolve or reject an open complaint with a recorded reason. Once a
complaint has reopened work, it can be resolved only after corrected work returns to
`COMPLETED` through a new inspection/acceptance cycle.
