# ADR-0012: Single-host production deployment after the first sale

## Status

Accepted and implemented in approved CP-11; external real-data go-live approval remains pending.

## Context

The Telegram MVP needs a credible deployment and rollback path, but there is almost no pre-sale
budget. Kubernetes, managed queues, public ingress, a container registry and paid observability would
add cost before demand is proven. A developer laptop cannot provide production availability,
restricted administration or off-host durability.

## Decision

- Keep the synthetic sales demonstration on the developer machine at zero infrastructure cost.
- After a customer funds the pilot, deploy one digest-pinned application image and PostgreSQL on one
  dedicated, buyer-funded Linux VPS using Docker Compose v2.
- Use Telegram long polling; expose no public application port. Bind health and metrics to host
  loopback and keep PostgreSQL on an internal Docker network.
- Mount secrets as mode-`600` files outside Git and validate the release SHA, image digests, paths,
  secret relationships and operator ownership before deployment.
- Run migrations as a one-shot container before the application. PostgreSQL holds an exclusive
  session lease so a second long-polling process fails closed.
- Build from a clean, exact Git commit on the host. Back up before upgrades, use additive migrations,
  and roll application code back only to a schema-compatible release.
- Generate encrypted daily database backups and copy the artifact/checksum to a buyer-controlled
  off-host destination. Run monthly isolated restore rehearsals.
- Use the existing private staff Telegram channel for zero-cost readiness alerts. The provisional
  primary responder is the MCK owner; a backup responder must be named before real-data go-live.

## Consequences

The first paid pilot has one affordable operational unit and no inbound web attack surface. The host
and database remain a single availability zone and cannot meet high-availability promises. Host-down
alerts need an external checker later because an on-host monitor cannot report when the whole host or
network is unavailable. Scaling beyond one process requires a shared rate limiter and a reviewed bot
consumption model.
