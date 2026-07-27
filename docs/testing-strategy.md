# Testing strategy

## CP-01 gates

- Prettier check for deterministic formatting.
- ESLint with type-aware rules and zero warnings.
- Strict TypeScript compilation.
- Source dependency-boundary check.
- Unit tests for environment validation and readiness behavior.
- Fastify injection tests for health, readiness, safe errors and request IDs.
- Real PostgreSQL readiness integration test.
- V8 coverage with an 80% threshold for the current foundation.
- Production TypeScript build.
- High-severity dependency audit.
- Docker Compose validation and, where available, container health smoke test.

## Continuous policy

Tests must verify externally meaningful behavior and invariants. Domain transitions,
priority calculation and authorization introduced later require at least 90% useful
coverage. A skipped test is reported as unverified rather than passed.

CI uses the same pnpm scripts as local execution and a real PostgreSQL service.

## CP-02 gates

- Exhaustive request/order transition metadata and valid/invalid-edge unit tests.
- Ownership and global/service-area authorization tests.
- Application-service tests for missing entities, stale versions, and executor eligibility.
- Real PostgreSQL migration and idempotent seed execution.
- Real repository tests for atomic update/history/audit behavior and concurrent writers.
- Database constraint and audit-immutability tests.
- At least 80% overall executable-code coverage and 90% for request/order state-machine files.

Declarative Drizzle schema definitions and thin migration/seed command entry points are excluded
from executable coverage percentages; their behavior is verified by the real database suite.

## CP-03 gates

- Pure intake planner tests for valid flow, consent, ownership, callback tampering, text/location, and photo limits.
- Thin Telegram controller/localization tests without Telegram network access.
- Real PostgreSQL full-intake test covering consent, profile, address, request, attachment, initial history, and audit.
- Same-update retry and distinct-update double-confirm concurrency tests proving one request.
- Owner-only ticket status test and replayable update-response verification.
- At least 90% statements, branches, functions, and lines for the critical intake planner.

The thin grammY event-registration/bootstrap file is excluded from executable coverage. Its normalized
controller and application behavior are tested without requiring a live bot token.

## CP-06 gates

- Pure checklist, feedback, complaint, and rework-policy boundary tests.
- Staff command parsing and application dispatch tests.
- Resident-owner, operator-area, category-policy, and inspection authorization tests.
- Real PostgreSQL inspection, acceptance, warranty, feedback, complaint, controlled-reopen,
  rework assignment/SLA, audit, and concurrency tests.
- At least 90% statements, branches, functions, and lines for the critical quality policy.
- Additive migration review, repeated migration/seed execution, and full prior integration suite.
