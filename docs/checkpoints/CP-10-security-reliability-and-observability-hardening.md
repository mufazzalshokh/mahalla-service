CHECKPOINT: CP-10 — Security, reliability and observability hardening
STATUS: IMPLEMENTED — AWAITING STAKEHOLDER APPROVAL

## 1. Objective

Harden the sell-first Telegram pilot against common abuse and operational failure without adding a
paid service or a new runtime dependency, and produce real recovery/load evidence before deployment.

## 2. Scope completed

- Separate configurable resident/staff in-memory update limits, bounded subject storage, localized
  retry messages and concurrent-burst tests.
- Controlled error metadata that excludes messages/stacks, expanded Pino redaction, safe request and
  Telegram update correlation, bounded request bodies and hardened HTTP response headers.
- Prometheus-compatible `/metrics` counters for process uptime, bounded HTTP routes/status classes,
  resident/staff update outcomes/duration sums and fixed operational alert codes.
- Sanitized structured alerts for resident-bot, staff-bot and automation-cycle failures.
- One domain role-permission matrix shared by seed logic, exact unit assertions and a real PostgreSQL
  persisted-matrix test.
- Strict Telegram photo-reference identity/control-character/length/size checks while preserving the
  JPEG/PNG, 10 MB and three-per-phase boundaries.
- Guarded PostgreSQL custom backup and isolated restore rehearsal, schema/core-count comparison,
  SHA-256 calculation and cleanup.
- Loopback-only bounded HTTP load smoke, incident-response runbook and explicit production handoffs.

## 3. Deliberately excluded

- Redis/shared rate limiting, WAF/CDN, SIEM, paid monitoring or an external paging subscription.
- Downloading Telegram media, content sniffing, malware scanning, private object storage or claiming
  Telegram-held photos are contractual archives.
- Production backup destination, encryption-key custody, retention, recovery objectives and on-call
  ownership; these require the CP-11 host and buyer decisions.
- Multi-replica bot consumption, webhook ingress and production capacity claims.

## 4. Verification evidence

- Formatting, zero-warning lint, strict TypeScript, module boundaries, production build and Drizzle
  migration consistency: PASS.
- Unit suite: 172/172 PASS across 40 files.
- Complete PostgreSQL integration suite: 34/34 PASS across 11 files, including the exact persisted
  authorization matrix.
- Clean isolated coverage suite: 206/206 PASS across 51 files; 86.98% statements, 74.02% branches,
  92.10% functions and 90.74% lines. The two honest branch ratchets are documented and may only rise;
  all existing critical-policy 90% targets remain.
- Backup/restore rehearsal against the smoke database: PASS; 54 schema tables and core record counts
  matched, SHA-256 was produced, and the guarded restore database/artifact were removed.
- Loopback load smoke: 500 requests at concurrency 25, zero failures, 135.5 ms p95 and 199.0 ms max
  on the developer machine. This is regression evidence, not a production capacity promise.
- Live watcher: `/ready` returned ready and `/metrics` returned 200 with request ID, no-store and safe
  low-cardinality metrics.
- Local dependency audit was not sent to npm because that external metadata disclosure was not
  authorized in this session; the existing GitHub CI audit remains the publishing gate.

## 5. Security and privacy

Rate-limit subject keys remain process-local and are never logged or exported. Metrics use fixed
labels and contain no Telegram user ID, phone, address, ticket/order code, file ID, arbitrary URL or
error message. Structured alerts contain only a fixed code, severity and timestamp. Photo checks
validate metadata only; bytes remain under Telegram's control and are explicitly not malware-scanned.

## 6. Cost and limitations

Incremental infrastructure cost is zero and no package was added. In-memory limits reset at restart
and apply per process. Metrics and alert logs do not contact a human by themselves. A paid pilot must
network-restrict metrics, choose a log/alert route and owner, and place encrypted backups off-host.

## 7. Rollback and recovery

The change adds no database migration. Rollback deploys the CP-09 code; existing data remains
compatible. Keep the new backup/restore and incident procedures even if the runtime change is rolled
back. Do not delete audit, evidence or commercial records to recover from an application defect.

## 8. Recommended next checkpoint

CP-11 — production readiness and first paid pilot deployment: host selection, real secret handling,
single-consumer process supervision, encrypted off-host backups, network restrictions, alert owner and
channel, deployment/rollback rehearsal and buyer-approved real-data/privacy operating rules.

## 9. Approval

Pending the exact stakeholder phrase `APPROVE CP-10`.
