# Pilot incident response

Use this zero-cost procedure for bot outage, database unavailability, repeated Telegram failures,
suspected token disclosure, or unexplained authorization behavior.

1. **Protect people and evidence.** Stop the affected bot process if unauthorized access or token
   disclosure is suspected. Do not delete records, rotate unrelated credentials, or paste logs into
   public chat.
2. **Classify.** Treat database loss, token disclosure, cross-area access, or altered audit/commercial
   records as critical. Treat isolated update failures or temporary Telegram delivery problems as
   warnings unless they persist.
3. **Contain.** Revoke the affected BotFather token, suspend affected staff access through an existing
   administrator, or disable automation as narrowly as possible.
4. **Diagnose safely.** Check `/ready`, `/metrics`, sanitized structured alerts, PostgreSQL health, and
   notification dead letters. Use request/update correlation IDs; do not log message text, phone,
   address, file IDs, tokens, or database URLs.
5. **Recover.** Restart only after the cause is controlled. For data loss, restore the latest verified
   backup into an isolated database first and follow the database migration runbook before switching.
6. **Verify.** Confirm both bots, readiness, notification processing, staff authorization boundaries,
   and a synthetic request lifecycle. Notify affected stakeholders through an approved channel.
7. **Learn.** Record a sanitized timeline, impact, cause, corrective action, owner, and due date in
   PDCA. Never rewrite audit history.

CP-11 must name the on-call owner, alert delivery channel, response targets, and buyer-approved breach
communication process before real resident data is accepted.
