# Assignment and execution architecture

## Executor eligibility

An eligible executor must be an active user with an available executor profile, an `executor` role globally or in the order's service area, and a capability for the order's service category. The operator selects a stable executor code, not a database UUID.

## Execution records

- `assignments` preserves every pending, accepted, declined, completed, or cancelled attempt.
- `orders.current_executor_user_id` and `orders.due_at` are the current projection.
- `work_logs` stores progress, blocked, unblocked, and completion notes.
- `work_evidence` stores bounded Telegram photo metadata classified as `BEFORE` or `AFTER`.
- `order_execution_sla_clocks` stores target, start, pause duration, and stop time.
- `order_escalations` stores one active deadline escalation per order.

All status-changing effects share the order transition transaction: optimistic version update, assignment/SLA/work record, history, and audit either commit together or roll back together.

## SLA semantics

The pilot deadline is an operational UTC timestamp supplied with an explicit timezone. It is not an `OVERDUE` status.

| Event                         | Clock effect                       |
| ----------------------------- | ---------------------------------- |
| Assignment                    | Store deadline; clock not started  |
| Executor accepts              | Start execution clock              |
| Work blocked                  | Record pause start                 |
| Work resumed                  | Add paused seconds and clear pause |
| Completion submitted          | Stop clock                         |
| Assignment rejected/cancelled | Stop current clock                 |

`/overdue` compares current time with the deadline for assigned, active, and blocked orders. It inserts an escalation only if no open or acknowledged escalation exists. CP-07 will automate scanning and notifications.

## Evidence boundary

Only Telegram photo metadata is persisted: file identity, size, media type, phase, optional note, actor, and time. File IDs and work notes are excluded from audit payloads. The executor must be the current assignee with the appropriate area permission. `BEFORE` is allowed from assignment through blocked work; `AFTER` requires work to have started.
