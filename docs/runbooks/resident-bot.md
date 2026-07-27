# Resident bot runbook

## Safe local demonstration

Use a BotFather token supplied through the local environment. Never commit or paste it into documentation or logs.

```powershell
Copy-Item .env.example .env
$env:RESIDENT_BOT_ENABLED='true'
$env:RESIDENT_BOT_TOKEN='<secret from approved channel>'
$env:DATABASE_URL='postgresql://mck:mck_local_only@127.0.0.1:5432/mck'
pnpm.cmd db:migrate
pnpm.cmd db:seed
pnpm.cmd dev
```

Only one long-polling resident-bot process may run for a token. The database idempotency boundary protects retries but does not make two long-polling consumers an approved deployment topology.

## Demonstration flow

1. Send `/start`.
2. Select Uzbek Latin or Cyrillic.
3. Accept the draft privacy notice (synthetic demonstration data only until MCK/legal approval).
4. Share the same Telegram account's contact.
5. Select a category, describe the issue, and send address/location.
6. Optionally send up to three Telegram photos and press Done.
7. Confirm and retain the returned `MCK-YYYY-NNNNNNNN` ticket.
8. Query `/status MCK-YYYY-NNNNNNNN` from the same account.
9. When an order awaits acceptance, use `/accept ORDER` or `/rework ORDER reason`.
10. After completion, use `/warranty ORDER`, `/rate ORDER 1..5 optional comment`, or
    `/complaint ORDER reason`.

## Operational checks

- `/health` confirms process liveness; `/ready` confirms PostgreSQL connectivity.
- A missing or invalid token prevents startup when `RESIDENT_BOT_ENABLED=true`.
- Handler errors log only the update identifier and normalized error; the resident receives a generic message.
- Run migrations and seeds as a controlled release step before enabling polling.
- Stop the application gracefully with Ctrl+C/SIGTERM so long polling and database pools close.

## Current restrictions

- JPEG-compressed Telegram photos only; documents and videos are ignored.
- Three photos maximum, 10 MB each.
- The privacy wording is a draft and real resident data is prohibited until OQ-003/OQ-004 are approved.
- Telegram-held file IDs are pilot metadata, not durable contractual evidence.
- Quality commands verify that the Telegram account owns a request linked to the order.
- One rating and one open complaint per resident/order are allowed. A complaint does not automatically reopen work.
