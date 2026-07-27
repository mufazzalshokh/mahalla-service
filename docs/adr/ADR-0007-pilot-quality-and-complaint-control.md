# ADR-0007: Pilot quality, warranty, and complaint control

- Status: Accepted for CP-06
- Date: 2026-07-27

## Context

The first-sale bot must prove that work is not merely marked done: acceptance,
rework, warranty, feedback, and complaints must remain attributable. The pilot has
no budget for a workflow engine, file archive, CRM, or separate survey service.

## Decision

Keep quality control in the modular monolith and PostgreSQL. Version a checklist per
service category. A category may require a passing operator inspection and may
restrict acceptance to operators. Otherwise, an owner-linked resident or scoped
operator may accept or request rework.

Acceptance creates a versioned acceptance record and a seven-day pilot warranty.
Rework creates a new pending assignment and SLA clock for the existing executor.
Each resident may submit one rating per order and one open complaint at a time.
Complaints never change order state automatically; a scoped operator must reopen an
open linked complaint with a reason.

## Consequences

- Quality decisions, repeat work, warranty windows, and complaint review are queryable
  without paid infrastructure.
- Electrical work requires a passing inspection in the seed; other pilot categories
  permit optional inspection. All defaults remain configurable data.
- Warranty is an operational window, not a legal guarantee. Policy and retention need
  approval before a real-data launch.
- CP-07 supplies durable notifications and automatic complaint/escalation reminders.
