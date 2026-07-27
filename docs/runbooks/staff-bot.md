# Staff Telegram bot runbook

## Configure

Create a separate BotFather bot from the resident bot. Store its token outside Git and set:

```text
STAFF_BOT_ENABLED=true
STAFF_BOT_TOKEN=<secret token>
```

The Telegram account must map to an active `users.telegram_user_id` and an area-scoped `operator_manager` role. Every command reloads persisted grants; possession of the bot token or knowledge of a command grants no business permission.

## Commands

```text
/queue
/validate TICKET
/info TICKET question
/triage TICKET safety urgency affected social
/duplicates TICKET
/duplicate TICKET CANDIDATE confirm|dismiss
/override TICKET SCORE BAND reason
/register TICKET
/reject TICKET reason
/executors ORDER
/assign ORDER EXECUTOR_CODE 2026-07-28T18:00:00+05:00
/mine
/accept ORDER
/decline ORDER reason
/progress ORDER note
/block ORDER blocker reason
/unblock ORDER resolution note
/complete ORDER completion summary
/overdue
```

Send before/after evidence as a Telegram photo with `/evidence ORDER BEFORE optional note` or `/evidence ORDER AFTER optional note` in its caption.

Residents answer a missing-information request in the resident bot with `/respond TICKET information`.

## Pilot operation

- Run one application process and one long-polling consumer per bot token.
- Use `/duplicates` before `/register`; never treat a suggestion as a decision.
- Use `/executors ORDER` before assignment; only active, available, scoped, category-capable profiles appear.
- Include a timezone offset or `Z` in deadlines; ambiguous timestamps are rejected.
- Executors accept before progress or `AFTER` evidence. A decline preserves the attempt and returns the order for reassignment.
- Run `/overdue` at the start and end of each operator shift until CP-07 automation exists.
- Telegram evidence is supporting pilot material, not a contractual archive.
- Record a specific factual reason for priority override or rejection.
- On a concurrency error, reload the queue/status before retrying.
- Disable only the affected adapter with `STAFF_BOT_ENABLED=false`; existing request, assessment, and audit data remain available.
- Logs must contain update IDs and error metadata, not resident text, address, phone, or bot tokens.
