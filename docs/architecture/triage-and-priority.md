# Validation, duplicate review, and priority architecture

## Workflow

1. An area-authorized operator moves a received request to `VALIDATING`.
2. The operator either requests missing information, rejects with a reason, or completes triage.
3. A resident can answer only their own `NEEDS_INFORMATION` request; the answer returns it to `VALIDATING` and both messages remain in the timeline.
4. The operator records the four judgment factors. Source confidence is injected from the request source. The active versioned model produces a stored explanation and band.
5. The system suggests possible duplicates. Staff explicitly confirms or dismisses; no request is deleted or automatically merged.
6. Registration atomically changes the request to `REGISTERED`, creates or links one order, adds history, and writes audit. Optimistic version matching prevents two orders from concurrent commands.

## Pilot priority model

| Factor             | Weight | Operator supplied    |
| ------------------ | -----: | -------------------- |
| Safety risk        |     30 | Yes                  |
| Urgency            |     25 | Yes                  |
| Residents affected |     20 | Yes                  |
| Social impact      |     15 | Yes                  |
| Source confidence  |     10 | No; persisted source |

All inputs are integers 0–5. The score is normalized to 0–100. Bands: `URGENT ≥ 80`, `IMPORTANT ≥ 55`, `PLANNED ≥ 30`, otherwise `MONITOR`.

## Consistency boundary

The register/link transaction uses the request status and version as a compare-and-set guard. It then finds a confirmed counterpart already linked to an order. If present, it adds the current request link; otherwise it allocates `ORD-YYYY-NNNNNNNN` and creates an order with the effective assessment. Status history and audit commit in the same transaction. A failure rolls everything back.

Legacy/pre-CP-04 orders may have nullable priority fields. Every order created by the CP-04 registration service has assessment, score, and band populated.
