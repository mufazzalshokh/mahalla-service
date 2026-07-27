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

## Button-first operation

Send `/start` or `/menu`, choose Uzbek or Russian, and use the persistent menu. Routine queues,
reports, complaints, notifications, orders and PDCA actions are available as buttons. Entity lists
open contextual action buttons. The bot asks for text only when the business record needs a factual
reason, note, score, deadline or summary.

The guided quality checklist requires every item to be explicitly marked PASS or FAIL before it asks
for the inspection summary. BEFORE/AFTER buttons arm the next uploaded photo, so a caption command is
not required. Guided state is bounded, process-local and expires after 30 minutes; `/menu` safely
cancels a pending text step. A process restart clears unfinished guided state without changing any
persisted request/order facts.

## Command fallback

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
/assign ORDER EXECUTOR_CODE 28.07.2026 18:00
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
/report week|month
/reportcsv week|month
/pdca
/pdca new AREA DD.MM.YYYY HH:mm title | problem | action | expected outcome
/pdca move PDC_CODE DO|CHECK|ACT|COMPLETED|PLAN|CANCELLED reason
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
- Button prompts use Tashkent `DD.MM.YYYY HH:mm`. Legacy ISO timestamps with an explicit offset or
  `Z` remain accepted by command fallback.
- Executors accept before progress or `AFTER` evidence. A decline preserves the attempt and returns the order for reassignment.
- `/overdue` remains an on-demand view; automation scans deadlines and complaint review targets.
- Acknowledge an active alert with `/ackoverdue`. Resolve it only after the order is no longer
  overdue; active overdue causes are rejected.
- Review `/failednotifications` each shift. Correct a missing/disabled Telegram account before
  `/retrynotification`; recovery resets the delivery counter but preserves prior attempt history.
- Use `/report week` for the shift/management view and `/reportcsv month` for an authorized export.
  Figures are current-to-date in Asia/Tashkent; backlog/open/overdue values are live snapshots.
- Treat CSV files as sensitive operational records: send only to the intended manager and store them
  in an approved location. The exporter neutralizes spreadsheet formula prefixes.
- Use `/pdca` to review active/overdue actions. Move actions in order PLAN→DO→CHECK→ACT→COMPLETED;
  CHECK/ACT may return to PLAN with a revision reason. Do not mark completed without a factual result.
- Use `/checklist` before `/inspect`; required items cannot be `NOT_APPLICABLE`.
- `/approve` may require a passing inspection. `/rework` creates a fresh executor assignment and SLA.
- `/complaints` is a review queue. A complaint does not reopen work until authorized `/reopen` records a reason.
- Close an open case with `/closecomplaint`; a reopened case cannot resolve until corrected work is completed and accepted.
- Telegram evidence is supporting pilot material, not a contractual archive.
- Record a specific factual reason for priority override or rejection.
- On a concurrency error, reload the queue/status before retrying.
- Disable only the affected adapter with `STAFF_BOT_ENABLED=false`; existing request, assessment, and audit data remain available.
- Logs must contain update IDs and error metadata, not resident text, address, phone, or bot tokens.
