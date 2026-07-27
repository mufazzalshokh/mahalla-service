# ADR-0002: Telegram long polling for the first pilot

- Status: Accepted for CP-01
- Date: 2026-07-27

## Context

A webhook needs public HTTPS ingress, TLS and operational ownership. The first pilot
is low-volume and must be demonstrable from an existing computer with almost no
budget.

## Decision

Use long polling for local development, demonstrations and the first single-instance
pilot. Enforce one active consumer per bot and database idempotency independently of
the delivery mode. Keep the Telegram adapter replaceable with a webhook adapter.

## Consequences

- no public domain or inbound port is required initially;
- only one active polling replica can consume a bot safely;
- process supervision and graceful shutdown are required;
- move to verified webhooks when multiple replicas, throughput or external ingress
  requirements justify it.
