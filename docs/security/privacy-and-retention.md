# Privacy and retention — provisional pilot policy

This document is an engineering default, not legal advice or a compliance claim. OQ-003 and OQ-004 block processing real resident data.

| Data                                 | Purpose                                            | Current storage             | Provisional retention                                                              |
| ------------------------------------ | -------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Telegram user ID                     | account continuity, retry safety, ticket ownership | user, update receipt        | account/case lifetime; receipt cleanup target 7 days                               |
| Consent version/update ID/time       | demonstrate the notice accepted                    | privacy consent             | same period as resident account or required evidence                               |
| Phone                                | contact about the request                          | resident profile            | anonymize with closed-request policy (default 12 months)                           |
| Address/coordinates and description  | understand and perform service                     | address and service request | default 12 months after closure pending approval                                   |
| Telegram photo file IDs              | retrieve pilot evidence from Telegram              | attachment metadata         | default 90 days after closure; not contractual evidence                            |
| Conversation draft                   | resume unfinished intake                           | intake session              | clear immediately after submission; expire abandoned drafts in a later cleanup job |
| Stored Telegram response             | replay safely after retry                          | update receipt              | cleanup target 7 days; automation pending                                          |
| Audit/history                        | accountability and incident investigation          | append-only audit/history   | retention requires approved policy; access is restricted                           |
| Assignment decisions and work logs   | executor accountability and operational history    | assignment/work-log tables  | provisional 24 months after closure; policy approval required                      |
| Before/after evidence metadata       | support completion and later quality review        | Telegram evidence metadata  | provisional 90 days unless complaint/quality/legal hold applies                    |
| SLA clocks and escalation history    | delay review and performance management            | SLA/escalation tables       | provisional 24 months; exclude resident content from escalation audit              |
| Inspection and acceptance facts      | prove quality decision and responsible actor       | quality/acceptance tables   | provisional 24 months; checklist summary may contain no unnecessary resident PII   |
| Rating and optional comment          | measure satisfaction and improve service           | quality feedback            | provisional 12 months after closure                                                |
| Complaint and rework reason          | review defects and control correction              | complaint/rework tables     | retain while case is open, then provisional 24 months; legal hold may override     |
| Warranty dates                       | show the pilot correction window                   | order warranty              | same period as order quality history                                               |
| Notification intent/attempt metadata | deliver and diagnose material updates              | outbox and attempt history  | provisional 90 days after delivery; dead letters until corrected/reviewed          |

Residents need a future authenticated workflow for access, correction, deletion/anonymization requests, and account recovery. Physical deletion of audit evidence must not be improvised; approved anonymization and legal-hold rules are required first.
