CHECKPOINT: CP-09 — Contracts, documents, and finance foundation
STATUS: APPROVED — 2026-07-28

## 1. Objective

Deliver the smallest credible commercial foundation that helps sell and operate a paid MCK pilot
without buying a payment gateway, e-signature product, PDF service or object store.

## 2. Scope completed

- Optional order commercial profile: no-charge/fixed-price, UZS, contract-required flag and one of
  five seeded revenue-source classes.
- Exact whole-UZS quotation breakdown, validity, explicit manual approval reference and one active
  quotation per order.
- External contract reference and terms summary; no signature or legal-validity claim.
- Acceptance certificate only after operational completion/acceptance, with required-contract
  enforcement.
- Multiple manual confirmed payments and categorized expenses; transactional overpayment
  prevention.
- Exact agreed revenue, collection, outstanding, recorded expense and operational gross-margin
  calculations.
- Bilingual immutable quotation, contract-reference, acceptance-certificate and payment-receipt text
  snapshots stored in PostgreSQL with stable codes and SHA-256.
- Bilingual button-driven staff workflow plus support-command fallback.
- Separate scoped finance read/manage and document-read permissions, backend enforcement and audit.

## 3. Deliberately excluded

- Payment-provider settlement, card/bank credentials, refunds and chargebacks.
- Electronic signature, fiscal receipt, tax invoice and legal contract generation.
- VAT/tax, payroll, depreciation, allocations, net profit, general ledger and period close.
- Multiple currencies, exchange rates, discounts and variable price formulas.
- Uploaded scans/binaries, public document links and object storage.
- Resident payment UI and automatic order-state transitions from finance records.

## 4. Verification evidence

- Formatting, zero-warning lint, strict TypeScript, module boundaries and production build: PASS.
- Unit tests: 163/163 PASS across 38 files.
- Isolated PostgreSQL commercial lifecycle: PASS, including migration/seed reapplication,
  overpayment rejection, exact totals, audit and document tamper rejection.
- Complete isolated PostgreSQL integration suite: 33/33 PASS across 10 files.
- Drizzle migration journal consistency: PASS.
- Additive migration and idempotent seed applied to the live smoke database; 8/8 commercial
  tables, 3/3 scoped owner permissions and HTTP readiness verified.

## 5. Security and privacy

Commercial audit excludes document bodies, terms, proof text and resident PII. Generated documents
are area-scoped and immutable. All visible documents state their non-fiscal/non-signing nature.
OQ-009 blocks real financial records until finance/legal approves the operating rules.

## 6. Cost and rollback

Incremental infrastructure cost is zero: the existing process and PostgreSQL database are reused.
Rollback deploys CP-08.1-compatible code and leaves additive commercial records unread. Do not drop
tables, sequences, immutable documents or audit records; restore a verified backup into a separate
database if schema rollback is mandatory.

## 7. Recommended next checkpoint

CP-10 — security, reliability and observability hardening: rate limiting, secure upload boundaries,
metrics/alerts, backup-restore rehearsal, authorization matrix, failure recovery and load checks.

## 8. Approval

Stakeholder approval received on 2026-07-28 with the exact phrase `APPROVE CP-09`.
