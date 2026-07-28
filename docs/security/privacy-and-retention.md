# Privacy and retention — provisional pilot policy

This document is an engineering default, not legal advice or a compliance claim. OQ-003 and OQ-004 block processing real resident data.

| Data                                  | Purpose                                            | Current storage             | Provisional retention                                                              |
| ------------------------------------- | -------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Telegram user ID                      | account continuity, retry safety, ticket ownership | user, update receipt        | account/case lifetime; receipt cleanup target 7 days                               |
| Consent version/update ID/time        | demonstrate the notice accepted                    | privacy consent             | same period as resident account or required evidence                               |
| Phone                                 | contact about the request                          | resident profile            | anonymize with closed-request policy (default 12 months)                           |
| Full name                             | identify/contact the resident during service       | resident profile            | anonymize with closed-request policy (default 12 months)                           |
| Staff name/Telegram ID/role/scope     | authenticate and operate the staff bot             | user, staff profile/role    | employment/authorization lifetime plus approved audit retention                    |
| Address/coordinates and description   | understand and perform service                     | address and service request | default 12 months after closure pending approval                                   |
| Declared urgency/preferred visit time | triage input and visit coordination                | service request             | default 12 months after closure pending approval                                   |
| Telegram photo file IDs               | retrieve pilot evidence from Telegram              | attachment metadata         | default 90 days after closure; not contractual evidence                            |
| Conversation draft                    | resume unfinished intake                           | intake session              | clear immediately after submission; expire abandoned drafts in a later cleanup job |
| Stored Telegram response              | replay safely after retry                          | update receipt              | cleanup target 7 days; automation pending                                          |
| Audit/history                         | accountability and incident investigation          | append-only audit/history   | retention requires approved policy; access is restricted                           |
| Assignment decisions and work logs    | executor accountability and operational history    | assignment/work-log tables  | provisional 24 months after closure; policy approval required                      |
| Before/after evidence metadata        | support completion and later quality review        | Telegram evidence metadata  | provisional 90 days unless complaint/quality/legal hold applies                    |
| SLA clocks and escalation history     | delay review and performance management            | SLA/escalation tables       | provisional 24 months; exclude resident content from escalation audit              |
| Inspection and acceptance facts       | prove quality decision and responsible actor       | quality/acceptance tables   | provisional 24 months; checklist summary may contain no unnecessary resident PII   |
| Rating and optional comment           | measure satisfaction and improve service           | quality feedback            | provisional 12 months after closure                                                |
| Complaint and rework reason           | review defects and control correction              | complaint/rework tables     | retain while case is open, then provisional 24 months; legal hold may override     |
| Warranty dates                        | show the pilot correction window                   | order warranty              | same period as order quality history                                               |
| Notification intent/attempt metadata  | deliver and diagnose material updates              | outbox and attempt history  | provisional 90 days after delivery; dead letters until corrected/reviewed          |
| PDCA action/history                   | assign and prove operational improvement           | PDCA and audit tables       | provisional 24 months after completion; policy/legal hold may override             |

Reports are generated on demand and are not persisted by the application. CSV exports may contain
operational category and performance data and become copies outside application access control;
recipients must store/share them only in an approved location. Report queries do not export resident
names, Telegram IDs, phones, addresses, descriptions, complaint reasons, or evidence identifiers.

Residents need a future authenticated workflow for access, correction, deletion/anonymization requests, and account recovery. Physical deletion of audit evidence must not be improvised; approved anonymization and legal-hold rules are required first.

Staff request details are restricted by the existing `request.read.area` grant. Callback data
contains only the ticket reference; it never embeds the resident's name, phone, address or selected
time. The submission audit records declared urgency/ASAP state but does not duplicate raw PII.

`/myid` discloses only the requesting Telegram account's own numeric ID. Staff-management callbacks
contain stable `STF` references rather than Telegram IDs or names. Authorized administrator list
output contains staff identity data and must not be forwarded outside the approved owner channel.
