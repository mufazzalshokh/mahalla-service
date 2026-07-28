# ADR-0010: Manual commercial ledger and immutable text documents

## Status

Accepted for CP-09.

## Context

The presentation requires quotation, contract, acceptance, payment, revenue, expense and
profitability records. The first-sale budget is almost zero, while tax, fiscal receipt, signature,
refund, allocation and provider rules remain unapproved. Pretending that a gateway, PDF generator
or accounting system exists would create more risk than value.

## Decision

- Add optional order commercial profiles with `NO_CHARGE` and `FIXED_PRICE` modes.
- Store whole UZS as integers and reject imprecise/fractional input.
- Treat accepted quotation total as agreed operational revenue; calculate collection, expense and
  gross margin exactly at order level.
- Record contract numbers and customer approval as manual external references, not electronic
  signatures.
- Generate limited bilingual text snapshots in PostgreSQL with stable codes and SHA-256 checksums.
- Make generated documents immutable at the database boundary.
- Keep payment gateways, e-signature, fiscalization, tax/accounting, refunds, multiple currencies,
  binary uploads and object storage disabled.
- Keep commercial records separate from the order state machine and quality acceptance.

## Consequences

The bot can demonstrate a complete commercial paper trail and credible gross-margin view without a
new service or recurring cost. It cannot claim legal contract execution, fiscal payment proof,
settlement confirmation, tax compliance, net profit or durable off-host document custody. Those
capabilities require approved rules and funded integrations.
