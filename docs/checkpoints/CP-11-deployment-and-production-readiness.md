CHECKPOINT: CP-11 — Deployment and production readiness
STATUS: IMPLEMENTED — AWAITING APPROVAL

## 1. Objective

Make the sell-first Telegram pilot reproducibly deployable and recoverable at near-zero pre-sale
cost, while keeping real resident data blocked until a funded host and named operating decisions exist.

## 2. Scope completed

- Multi-stage, non-root runtime image with immutable release metadata and production-only Compose.
- Digest-pinned production image policy, internal PostgreSQL network, loopback health exposure,
  read-only application filesystem, dropped capabilities, bounded resources and logs.
- File-only production secrets, strict allowlisted configuration validation and rejection of shell
  syntax, mutable releases, shared bot tokens, unsafe paths and inconsistent database credentials.
- One-shot forward migration before application start and a PostgreSQL advisory session lease that
  prevents a second Telegram long-polling consumer.
- Clean-commit deployment, exact-release smoke, encrypted pre-deploy/daily backup, readiness alert
  and schema-compatible rollback scripts.
- CI release checks for shell syntax, resolved production Compose, runtime image build, complete
  quality gates, PostgreSQL integration tests and dependency audit.
- Provider-neutral topology, deployment/rollback runbook and evidence-based production-readiness
  checklist.

## 3. Zero-budget commercial decision

The current machine remains a synthetic-data sales demo. No infrastructure is purchased before the
first sale. The first customer funds a small dedicated Linux VPS and buyer-controlled off-host backup
destination as part of the pilot. Kubernetes, public ingress, a paid registry, managed queues and paid
monitoring remain deliberately excluded.

## 4. Verification evidence

- Formatting, changed-file zero-warning lint, strict TypeScript, module boundaries and production
  build: PASS.
- Unit suite: 178/178 PASS across 41 files.
- Production policy/environment/health focus: 23/23 PASS.
- PostgreSQL singleton lease integration: PASS against two independent database clients.
- Production Compose resolves with immutable dummy release/image digests and external secret mounts:
  PASS.
- Bash deployment/backup/monitor syntax, Node smoke syntax and loopback release smoke: PASS.
- The clean GitHub Actions gate for commit `ea8ccf7` passed `pnpm check`, Bash/Node syntax, production
  Compose rendering, runtime image build, all 213 PostgreSQL-backed coverage tests and the
  high-severity dependency audit. This supplied the isolated container/database evidence after the
  developer machine experienced Docker Hub TLS timeouts and could not start its local PostgreSQL
  service without host administrator access.

## 5. Safety and privacy

No bot token, database password, resident record, backup passphrase or production environment file is
committed. Health/metrics stay on loopback, PostgreSQL has no host port, and deployment validation
reports secret names rather than values. Backup output is encrypted before it reaches disk. This work
does not claim legal, privacy, tax or signature compliance.

## 6. Real-data blockers

External production deployment was intentionally not performed. Real-data go-live remains blocked
until the checklist records: a buyer-funded host, approved Uzbek/Russian privacy and retention rules,
real rotated secrets, a primary and backup responder, an off-host backup destination and restore
evidence, reviewed image digests, synthetic bilingual lifecycle smoke, and explicit stakeholder
authorization.

## 7. Rollback

Use only a last-known-good release documented as compatible with the additive schema. Preserve audit
and migration evidence, take an encrypted backup before rollback, deploy the exact prior Git SHA, and
repeat release smoke plus a synthetic resident/staff lifecycle. Restore a damaged database into an
isolated database first; never edit migration history or drop production tables as a shortcut.

## 8. Recommended next action

Approve CP-11 and use the existing synthetic bot demo to sell the paid pilot. Execute the external
readiness checklist only after the customer funds the host. CP-12 ecosystem integrations remain
future work, not a prerequisite for the first sale.

## 9. Approval

Awaiting the exact stakeholder phrase `APPROVE CP-11`.
