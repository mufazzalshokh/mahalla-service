CHECKPOINT: CP-00 — Discovery and requirements

STATUS: PASS

## 1. Objective

Convert the source presentation and sell-first constraints into an evidence-backed,
traceable specification that is safe to use as the basis for engineering decisions.

## 2. Scope completed

- audited the empty greenfield workspace and available local toolchain;
- parsed all 17 presentation slides and available notes;
- verified and visually inspected all eight image-only slide assets;
- documented business processes, terminology, actors and contradictions;
- proposed a canonical conditional workflow and explainable priority model;
- defined the end-to-end Telegram pilot and explicit exclusions;
- compared three architecture options and recommended a lean TypeScript modular
  monolith;
- recorded requirements traceability, assumptions, confirmation items and risks.

No application, schema, dependency, container or deployment was created.

## 3. Files created or modified

- `docs/README.md`
- `docs/00-discovery.md`
- `docs/01-business-requirements.md`
- `docs/02-glossary.md`
- `docs/requirements-traceability.md`
- `docs/mvp-scope.md`
- `docs/assumptions.md`
- `docs/open-questions.md`
- `docs/risk-register.md`
- `docs/architecture/options.md`
- `docs/architecture/system-context.md`
- `docs/checkpoints/CP-00-discovery.md`

## 4. Architecture decisions

- recommended TypeScript, Fastify, grammY, PostgreSQL, Drizzle, Zod, Pino and
  Vitest, subject to approval and a CP-01 ADR;
- one package, one process and one database for the pilot;
- separate resident/staff bot tokens with shared application/domain services;
- long polling for demonstration and low-volume paid pilot;
- PostgreSQL transactional outbox rather than Redis or a broker;
- pricing, contracts, payment and advanced reporting remain conditional/deferred;
- Telegram transport types and rules must not enter the core domain.

## 5. Commands executed

- PowerShell repository, manifest, documentation, test, CI, Docker and presentation
  inventory commands;
- direct Open XML inspection of the PPTX package, slide text, notes, media and slide
  relationship files;
- visual inspection of extracted temporary slide images;
- local tooling version checks;
- PowerShell documentation validation for local links, UTF-8 replacement characters,
  code-fence balance, placeholder markers and requirement-ID traceability.

No dependency installation or destructive command was executed.

## 6. Test results with actual outcomes

The first documentation validation run failed as intended on real findings:

- `docs/README.md` referenced this checkpoint record before it existed;
- BR-006, BR-013 and BR-016 appeared only inside shorthand ranges and were not
  explicit traceability identifiers.

The traceability references were expanded and this checkpoint record was added. The
second validation run completed with exit code 0:

- 12 Markdown files inspected;
- 24 business requirement IDs defined and all 24 explicitly traced;
- local Markdown links passed;
- UTF-8 replacement-character scan passed;
- code/Mermaid fence balance passed;
- placeholder scan passed.

## 7. Acceptance-criteria matrix

| Criterion                                   | Evidence                                            | Result                |
| ------------------------------------------- | --------------------------------------------------- | --------------------- |
| Actual presentation inspected               | `docs/00-discovery.md` and direct slide/media audit | PASS                  |
| Repository and stack classified             | `docs/00-discovery.md`                              | PASS                  |
| Business requirements documented            | `docs/01-business-requirements.md`                  | PASS                  |
| Canonical terminology documented            | `docs/02-glossary.md`                               | PASS                  |
| Requirements traceable to checkpoints/tests | `docs/requirements-traceability.md`                 | PASS after correction |
| Sell-first MVP and exclusions defined       | `docs/mvp-scope.md`                                 | PASS                  |
| Architecture alternatives compared          | `docs/architecture/options.md`                      | PASS                  |
| Assumptions and confirmation items captured | `docs/assumptions.md`, `docs/open-questions.md`     | PASS                  |
| Initial risks and responses recorded        | `docs/risk-register.md`                             | PASS                  |
| Documentation validation passes             | Final validation, exit code 0                       | PASS                  |

## 8. Security and privacy review

The discovery specifies separate staff identity linking, backend authorization,
least-privilege scopes, idempotency, audit, redaction, controlled photo types and
data-minimization defaults. Legal/privacy wording and binding retention rules remain
confirmation items before real resident data is accepted.

## 9. Database and migration review

No schema or migration exists. PostgreSQL is recommended because uniqueness,
transactions and concurrency protection are critical. Aggregate boundaries,
constraints and the initial migration belong to CP-02 after architecture approval.

## 10. Known limitations

- the presentation is training material rather than a complete specification;
- exact pilot staff, area, consent language and operating calendar are not confirmed;
- pilot photos stored through Telegram metadata are not independent contractual
  archives;
- internal service targets are not contractual SLAs;
- no software behavior exists yet.

## 11. Risks and technical debt

The highest risks are premature scope expansion, mistaken staff identity, duplicate
updates, PII leakage, arbitrary scoring and treating a demonstration host as a
production environment. Responses and owners are recorded in `docs/risk-register.md`.

No implementation technical debt has been created; the main future risk is allowing
the recommended one-process structure to erode its documented module boundaries.

## 12. Rollback procedure

CP-00 is documentation-only. Before Git initialization, rollback consists of
reviewing and removing the `docs` files created by this checkpoint. After Git is
initialized, revert the CP-00 documentation commit. No data or external service needs
rollback.

## 13. Recommended next checkpoint

CP-01 — Engineering foundation: initialize Git and the TypeScript project, record
ADRs, enforce module boundaries, add validated configuration, local PostgreSQL,
quality gates, CI, structured logging and health/readiness baselines.

## 14. Waiting for: APPROVE CP-00

Do not begin CP-01 until the stakeholder explicitly provides `APPROVE CP-00`.
