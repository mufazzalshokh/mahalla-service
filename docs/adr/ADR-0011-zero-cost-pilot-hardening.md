# ADR-0011: Zero-cost pilot hardening and operational signals

## Status

Accepted. CP-10 stakeholder approval received on 2026-07-28.

## Context

The sell-first pilot needs credible abuse protection, diagnostics and recovery evidence, but cannot
justify Redis, a metrics SaaS, a SIEM, an object store, a malware scanner, or an external paging
service. Adding those products before a paying deployment would raise cost and operational burden
without resolving ownership or retention decisions.

## Decision

- Apply separate bounded in-memory update limits to resident and staff bots. Database idempotency and
  authorization remain the consistency and security boundaries.
- Log only controlled error name/code metadata, correlation IDs and fixed operational alert events;
  never error messages/stacks that may contain resident input or secrets.
- Export Prometheus-compatible process, HTTP, bot and alert counters with fixed labels from `/metrics`.
- Accept only bounded Telegram photo references and explicitly keep them non-contractual. The
  application does not download or malware-scan Telegram bytes.
- Define the seed role-permission matrix once in the domain and verify both the policy and persisted
  database grants.
- Rehearse custom-format PostgreSQL backup/restore into a guarded temporary database, and keep a
  bounded loopback load smoke check in the repository.
- Use structured alert logs plus metrics during the local pilot. CP-11 must route them to a named
  human through the selected host's free or funded monitoring channel.

## Consequences

The pilot gains meaningful controls without another runtime dependency or subscription. In-memory
rate limits reset on restart and are per process. `/metrics` must be network-restricted in a paid
deployment. Telegram-held media is still unsuitable as durable or contractual evidence. Local
backup rehearsal proves the procedure, not off-host durability; CP-11 must select encryption,
destination, schedule and owner.
