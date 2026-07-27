# Glossary

| Term                | Canonical meaning                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| MCK                 | Mahalla Service Company operating the platform.                                                                   |
| Resident            | A person requesting or receiving service; called customer when a commercial relationship exists.                  |
| Telegram user       | A Telegram identity. It is not automatically a verified resident or authorized staff identity.                    |
| Request             | The original report of a need from one source. It remains immutable enough to preserve provenance.                |
| Order               | The operational unit planned, assigned and executed by MCK. Multiple requests may support one order.              |
| Ticket number       | Human-readable identifier returned to a resident; it is not the database primary key.                             |
| Request source      | Telegram, telephone, household survey, street leader, building representative, operator or future integration.    |
| Service category    | Configurable grouping such as plumbing, electrical, repair or landscaping.                                        |
| Service area        | Configurable geographical or operational boundary, initially one mahalla.                                         |
| Duplicate candidate | A request that may describe an existing problem. It is never silently discarded.                                  |
| Shared incident     | A common problem to which multiple original resident requests may be linked.                                      |
| Priority score      | Versioned weighted assessment of business impact.                                                                 |
| Priority band       | Human-readable urgent, important or planned classification derived from a score or authorized override.           |
| Feasibility         | Cost, workforce, material and dependency information used for scheduling, separate from impact priority.          |
| Assignment          | A time-bounded offer of responsibility to an executor and its acceptance/rejection history.                       |
| Executor            | Staff member or later contractor responsible for performing work.                                                 |
| Evidence            | Controlled photo or record associated with intake, execution or acceptance. Pilot photos are not legal documents. |
| Acceptance          | Confirmation that delivered work is accepted or requires rework.                                                  |
| Rework              | Corrective execution required after failed acceptance or a valid complaint.                                       |
| Complaint           | A resident report that service or outcome was unsatisfactory and requires formal review.                          |
| Overdue             | Derived condition where a nonterminal order has passed its applicable target deadline.                            |
| Revenue source      | Resident payment, organizational contract, grant, social funding or additional paid service.                      |
| Audit event         | Append-only security/business record of who did what, when, why and against which subject.                        |
| Outbox event        | Transactionally stored instruction for a notification or integration, retried outside the business transaction.   |
| Business timezone   | `Asia/Tashkent`, used for display, working calendars and reports. Stored timestamps remain UTC.                   |
| KPI                 | A metric with an approved definition, formula, time window, exclusions and owner.                                 |
| PDCA                | Plan–Do–Check–Act cycle used to improve recurring operational problems.                                           |
