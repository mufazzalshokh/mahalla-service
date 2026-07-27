# ADR-0009: Live operational reporting and audited PDCA

## Status

Accepted for the first-sale pilot.

## Context

Managers need a credible weekly/monthly review and improvement loop, but the near-zero budget does
not justify a BI platform, warehouse, scheduler, or separate reporting service. KPI ambiguity is a
larger pilot risk than query latency. Financial profitability also cannot be claimed before CP-09
defines contracts, revenue, cost, and accounting ownership.

## Decision

Build current-to-date operational reports directly from PostgreSQL in the modular monolith. Store
timestamps in UTC, interpret week/month boundaries in `Asia/Tashkent`, use half-open event windows,
and keep point-in-time backlog fields explicitly separate from period flows. Formulas are versioned
in documentation and application tests. Return a concise Telegram summary and a long-form CSV; do
not persist duplicate KPI snapshots in the pilot.

Authorize report read and export separately and filter every source by the caller's explicit service
area grants. Neutralize spreadsheet formula prefixes in exported cells.

Persist PDCA actions and append-only history. Enforce `PLAN -> DO -> CHECK -> ACT -> COMPLETED`, with
reasoned revision from CHECK/ACT back to PLAN and cancellation from an open stage. Use optimistic
versions, actor identity, deadlines, outcomes, and audit facts. No automatic text classification or
automatic improvement action is introduced.

## Consequences

- PostgreSQL remains the only data/reporting dependency and the feature can be sold before hosting a
  dashboard.
- Every number has an inspectable definition, timezone, scope, and denominator.
- Reports are live projections: historical backlog cannot be reconstructed exactly after later state
  changes. Persisted snapshots are deferred until a buyer requires immutable period close.
- Queries are suitable for the small pilot. Material latency or data volume will trigger indexes,
  read replicas, materialized views, or a warehouse based on measurements.
- Profitability remains excluded until the financial model and source-of-truth rules are approved.
