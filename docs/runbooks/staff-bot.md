# Staff Telegram bot runbook

## Configure

Create a separate BotFather bot from the resident bot. Store its token outside Git and set:

```text
STAFF_BOT_ENABLED=true
STAFF_BOT_TOKEN=<secret token>
AUTOMATION_ENABLED=true
AUTOMATION_POLL_SECONDS=30
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
/ackoverdue ORDER
/resolveoverdue ORDER
/failednotifications
/retrynotification NTF_CODE
/checklist ORDER
/inspect ORDER WORK_COMPLETE=PASS,RESULT_TESTED=PASS,AREA_CLEAN=PASS summary
/approve ORDER
/rework ORDER reason
/startrework ORDER
/complaints
/reopen COMPLAINT_CODE reason
/closecomplaint COMPLAINT_CODE resolve|reject reason
```

Send before/after evidence as a Telegram photo with `/evidence ORDER BEFORE optional note` or `/evidence ORDER AFTER optional note` in its caption.

Residents answer a missing-information request in the resident bot with `/respond TICKET information`.

## Pilot operation

- Run one application process and one long-polling consumer per bot token.
- Use `/duplicates` before `/register`; never treat a suggestion as a decision.
- Use `/executors ORDER` before assignment; only active, available, scoped, category-capable profiles appear.
- Include a timezone offset or `Z` in deadlines; ambiguous timestamps are rejected.
- Executors accept before progress or `AFTER` evidence. A decline preserves the attempt and returns the order for reassignment.
- `/overdue` remains an on-demand view; automation scans deadlines and complaint review targets.
- Acknowledge an active alert with `/ackoverdue`. Resolve it only after the order is no longer
  overdue; active overdue causes are rejected.
- Review `/failednotifications` each shift. Correct a missing/disabled Telegram account before
  `/retrynotification`; recovery resets the delivery counter but preserves prior attempt history.
- Use `/checklist` before `/inspect`; required items cannot be `NOT_APPLICABLE`.
- `/approve` may require a passing inspection. `/rework` creates a fresh executor assignment and SLA.
- `/complaints` is a review queue. A complaint does not reopen work until authorized `/reopen` records a reason.
- Close an open case with `/closecomplaint`; a reopened case cannot resolve until corrected work is completed and accepted.
- Telegram evidence is supporting pilot material, not a contractual archive.
- Record a specific factual reason for priority override or rejection.
- On a concurrency error, reload the queue/status before retrying.
- Disable only the affected adapter with `STAFF_BOT_ENABLED=false`; existing request, assessment, and audit data remain available.
- Logs must contain update IDs and error metadata, not resident text, address, phone, or bot tokens.
