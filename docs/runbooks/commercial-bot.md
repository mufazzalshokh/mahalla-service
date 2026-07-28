# Staff bot commercial workflow

## Before using real financial data

OQ-009 requires finance/legal approval. Until then, use synthetic demonstration values only. CP-09
documents are operational text records, not signed contracts, tax invoices or fiscal receipts.

## Button workflow

Open the staff bot, press `/start`, then choose `💰 Moliya / 💰 Финансы`.

1. **Configure mode** — enter `ORDER | FIXED_PRICE or NO_CHARGE | SOURCE | REQUIRED or OPTIONAL`.
2. **Quotation** — for fixed-price work, enter order, whole-UZS labor/material/other amounts,
   validity date and scope. The bot returns `QUO-...` and `DOC-...`.
3. **Accept quotation** — record how and when the customer's approval was received. This is a
   responsible staff assertion and is audited.
4. **Contract** — if applicable, record the external paper/approved-system reference and short
   terms. The bot does not sign a contract.
5. **Acceptance certificate** — after the order is completed and operationally accepted, generate
   the `ACT-...` record. A configured required contract must already exist.
6. **Payment** — record a whole-UZS amount, method, date and proof reference. Total confirmed
   payment cannot exceed the accepted quotation.
7. **Expense** — record labor, material, transport or other cost with date and description.
8. **Order finance** — view agreed revenue, collection, expense, outstanding amount and operational
   gross margin.
9. **Get document** — enter a `DOC-...` code. The bot returns the stored `.txt` snapshot and a short
   SHA-256 prefix.

Dates use `DD.MM.YYYY`; amounts use whole UZS without decimal separators. Spaces or underscores are
accepted inside an amount entered through a pipe-delimited prompt.

## Support command fallback

```text
/commercial ORDER | FIXED_PRICE | RESIDENT | REQUIRED
/quote ORDER | labor | material | other | DD.MM.YYYY | scope
/acceptquote QUO | approval reference
/contract ORDER | external reference | terms summary
/certificate ORDER | acceptance summary
/payment ORDER | amount | CASH/BANK_TRANSFER/OTHER | DD.MM.YYYY | proof reference
/expense ORDER | amount | LABOR/MATERIAL/TRANSPORT/OTHER | DD.MM.YYYY | description
/finance ORDER
/document DOC_CODE
```

Do not enter card numbers, bank credentials, passport details, full contract bodies or unnecessary
resident PII. A duplicate/contradictory record or concurrency failure must be reviewed from the
finance summary before retrying.
