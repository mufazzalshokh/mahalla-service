# Notifications and operational automation

## Reliable delivery path

1. A request/order/complaint transaction determines a fixed template and authorized recipients.
2. The transaction inserts one outbox row per recipient using a stable deduplication key.
3. The application poller claims due rows in small batches with `SKIP LOCKED` and a 120-second lease.
4. The Telegram adapter renders Uzbek Latin or Cyrillic from bounded payload fields.
5. Success records the provider message ID and a delivery-attempt row.
6. A retryable failure schedules 30, 60, 120, 240, then bounded delays; an exhausted or permanent
   failure enters `DEAD_LETTER`.
7. Area-authorized staff use `/failednotifications` and `/retrynotification NTF_CODE` to recover.

The payload contains a template key, ticket/order/complaint reference, optional status, and optional
deadline. It excludes descriptions, addresses, phone numbers, complaint reasons, blocker reasons,
and bot tokens.

## Automated scans

Every configured cycle attempts one transaction advisory lock, then:

- reminds the assigned executor once when an active deadline is within two hours;
- creates or reuses one active deadline escalation and alerts scoped operators when overdue;
- reminds scoped operators once when an open complaint review is within four hours;
- alerts scoped operators once when complaint review is overdue.

Deduplication keys include the stable entity/escalation and reminder kind. A reminder and a later
overdue alert are distinct. Staff can acknowledge an active escalation. Resolution is rejected while
the order remains overdue, preventing the next scan from immediately creating a replacement alert.

## Runtime configuration

```text
AUTOMATION_ENABLED=true
AUTOMATION_POLL_SECONDS=30
RESIDENT_BOT_TOKEN=<secret>
STAFF_BOT_TOKEN=<different secret>
```

Keep one application process for the pilot. Both tokens are mandatory when automation is enabled.
Disable automation to stop new scans/delivery without deleting queued intents or history.
