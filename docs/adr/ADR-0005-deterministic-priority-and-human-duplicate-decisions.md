# ADR-0005: Deterministic priority and human duplicate decisions

- Status: Accepted for pilot
- Date: 2026-07-27

## Context

The first sellable bot must work on an almost-zero infrastructure budget. Operators need to explain why one request is ahead of another, and similar resident submissions must never disappear through an automated merge.

## Decision

Use a versioned five-factor weighted model stored in PostgreSQL. Each input is an integer from 0 to 5. The pilot weights are safety 30, urgency 25, residents affected 20, social impact 15, and source confidence 10. The normalized score is `sum(input × weight) / sum(maximum × weight) × 100`. Bands are urgent at 80+, important at 55+, planned at 30+, and monitor below 30.

Source confidence is derived from the persisted request source, not typed by the operator. Every assessment stores model version, inputs, contributions, score, band, explanation, actor, and time. Authorized overrides require a 10–1000 character reason and retain both calculated and effective values.

Duplicate detection is a deterministic candidate suggestion using category, area, address-token similarity, description-token similarity, and optional coordinate distance. A staff member must confirm or dismiss each suggestion. Requests remain separate records; confirmation only permits them to link to the same order.

## Consequences

- No AI service, vector database, queue, or per-call fee is needed.
- Scores and duplicate evidence are reproducible and auditable.
- Model weights can be versioned without rewriting historical assessments.
- Text similarity is intentionally modest; operators remain responsible for decisions.
- Later evidence may justify a learned model, but it must preserve explanations, human review, and historical versioning.
