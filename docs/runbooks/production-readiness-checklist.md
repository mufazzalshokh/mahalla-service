# First paid-pilot production-readiness checklist

Every required item needs evidence and a named approver. “Script exists” is not evidence that an
external deployment or legal/business approval happened.

## Product and policy — blocking real data

- [ ] Pilot mahalla, service area, categories and participating staff are named.
- [ ] Uzbek/Russian privacy and consent wording is approved by the responsible reviewer.
- [ ] Retention, deletion, resident-access and incident-communication rules are approved.
- [ ] Acceptance, inspection, warranty, complaint and achievable operating targets are approved.
- [ ] Fiscal/tax/signature rules are approved before real commercial records are used.
- [ ] Residents are told that preferred time is a request, not a guaranteed booking.

## Host and access

- [ ] Dedicated buyer-funded host exists; developer laptop is not the production host.
- [ ] Primary responder (provisional: MCK owner) and backup responder are named with availability.
- [ ] Key-only restricted SSH, non-root operator, firewall, updates and time synchronization verified.
- [ ] No public app, metrics or PostgreSQL port; only required outbound Telegram/DNS/NTP access.
- [ ] Docker/Compose versions, host capacity and disk-alert thresholds recorded.

## Release and secrets

- [ ] Clean, approved full Git SHA and release notes recorded.
- [ ] Node/PostgreSQL images pinned to reviewed SHA-256 digests.
- [ ] Production validator passes; secret/config files have correct owner and modes `700`/`600`.
- [ ] Separate BotFather tokens rotated from development and stored only in secret files.
- [ ] Administrator Telegram identity verified through the approved onboarding procedure.
- [ ] Second application instance is proven to fail the PostgreSQL consumer lease.

## Data, recovery and monitoring

- [ ] Pre-deploy encrypted backup, SHA-256 and buyer-controlled off-host copy verified.
- [ ] Isolated restore rehearsal passes and actual recovery time is recorded.
- [ ] Daily backup and one-minute readiness monitor schedules are active and their failures alert.
- [ ] Private Telegram ops alert arrives to the primary and backup responders.
- [ ] Disk, container health, readiness, dead letters and operational-alert metrics are reviewed.
- [ ] Host-down detection limitation is explicitly accepted or an external checker is configured.

## Go-live and rollback

- [ ] One-shot migration succeeds before the app; migration and app logs contain no secrets/PII.
- [ ] Production smoke verifies exact release, health, readiness, metrics and security headers.
- [ ] Synthetic resident-to-closure flow passes in Uzbek and Russian with authorized staff.
- [ ] Last compatible release and rollback decision owner are recorded.
- [ ] Stakeholder explicitly authorizes real-data go-live after reviewing all remaining risks.
