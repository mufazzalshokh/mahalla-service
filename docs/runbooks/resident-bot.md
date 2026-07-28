# Resident bot runbook

## Safe local demonstration

Use a BotFather token supplied through the local environment. Never commit or paste it into documentation or logs.

```powershell
Copy-Item .env.example .env
$env:RESIDENT_BOT_ENABLED='true'
$env:RESIDENT_BOT_TOKEN='<secret from approved channel>'
$env:AUTOMATION_ENABLED='true'
$env:STAFF_BOT_TOKEN='<separate staff bot secret from approved channel>'
$env:DATABASE_URL='postgresql://mck:mck_local_only@127.0.0.1:5432/mck'
pnpm.cmd db:migrate
pnpm.cmd db:seed
pnpm.cmd dev
```

Only one long-polling resident-bot process may run for a token. The database idempotency boundary protects retries but does not make two long-polling consumers an approved deployment topology.

## Demonstration flow

1. Send `/start`.
2. Select Uzbek or Russian. Uzbek Cyrillic remains supported for existing stored sessions.
3. Accept the draft privacy notice (synthetic demonstration data only until MCK/legal approval).
4. Enter a full name and share the same Telegram account's contact.
5. Select a category and the resident-declared urgency: critical, important (1–3 days), or planned.
6. Describe the issue and send address/location.
7. Select a preferred visit day, part of day, and one-hour window. Critical requests can choose
   “as soon as possible.” This is a preference until staff confirms it.
8. Optionally send up to three Telegram photos and press Done.
9. Review the bilingual summary, confirm, and retain the returned `MCK-YYYY-NNNNNNNN` ticket.
10. Query `/status MCK-YYYY-NNNNNNNN` from the same account.
11. When an order awaits acceptance, use `/accept ORDER` or `/rework ORDER reason`.
12. After completion, use `/warranty ORDER`, `/rate ORDER 1..5 optional comment`, or
    `/complaint ORDER reason`.

## Operational checks

- `/health` confirms process liveness; `/ready` confirms PostgreSQL connectivity.
- A missing or invalid token prevents startup when `RESIDENT_BOT_ENABLED=true`.
- Handler errors log only the update identifier and normalized error; the resident receives a generic message.
- Run migrations and seeds as a controlled release step before enabling polling.
- Material status, information, acceptance, and complaint-decision messages are delivered from
  the durable outbox when automation is enabled. Both bot tokens are required in that mode.
- Delivery is at-least-once; a rare duplicate is possible if the process stops after Telegram
  accepts a message but before the database records success.
- Stop the application gracefully with Ctrl+C/SIGTERM so long polling and database pools close.

## Current restrictions

- JPEG-compressed Telegram photos only; documents and videos are ignored.
- Three photos maximum, 10 MB each.
- The privacy wording is a draft and real resident data is prohibited until OQ-003/OQ-004 are approved.
- Telegram-held file IDs are pilot metadata, not durable contractual evidence.
- Quality commands verify that the Telegram account owns a request linked to the order.
- Declared urgency never bypasses staff validation and does not directly set the operational
  priority/SLA. A preferred visit window is not a guaranteed booking.
- Russian selection is persisted in the resident profile/session; category names and resident
  lifecycle/quality replies are localized. Telegram-client language is only a fallback before a
  selection is made.
- One rating and one open complaint per resident/order are allowed. A complaint does not automatically reopen work.
