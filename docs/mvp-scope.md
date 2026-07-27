# Sell-first Telegram MVP

## Commercial goal

Demonstrate enough operational value to sell a paid pilot before investing in the
broader ecosystem. The product must prove that MCK can receive, assign, track and
close work without losing requests or leaving residents uninformed.

## Pilot boundary

- one mahalla and one configured business timezone;
- two bot identities: resident and staff;
- one application deployment and one PostgreSQL database;
- Uzbek Latin and Uzbek Cyrillic resource files;
- four initial configurable categories: plumbing, electrical, repair and
  landscaping;
- four pilot roles: resident, operator/manager, executor and administrator;
- low-volume long polling with one active consumer per bot;
- controlled JPEG/PNG photos;
- basic weekly Telegram summary and CSV export.

## Resident journey

1. Start the resident bot.
2. Choose Uzbek Latin or Uzbek Cyrillic.
3. Read and accept the versioned privacy notice.
4. Share the Telegram account's phone contact.
5. Select a configured service category.
6. Describe the problem.
7. Enter an address or share a location.
8. Optionally attach controlled photos.
9. Answer short safety/impact questions.
10. Review and confirm.
11. Receive one ticket number despite Telegram retries.
12. View current status and respond to information requests.
13. Receive material status notifications.
14. Accept completed work or request review.
15. Rate service or submit a complaint.

## Staff journey

1. An administrator links a pre-approved staff record to a Telegram account.
2. An operator reviews new requests and requests missing information.
3. The operator confirms or rejects duplicate candidates.
4. The operator registers a valid request as an order and reviews its score.
5. The operator assigns an executor and deadline.
6. The executor accepts/rejects, starts, blocks or submits completion.
7. The operator or resident accepts the outcome or requests rework.
8. Staff can inspect audit history and failed notification delivery within their
   permission scope.
9. The manager receives a simple weekly operational summary.

## MVP acceptance outcomes

- a confirmed Telegram retry never creates a second request;
- every ticket is human-readable and unique;
- a request cannot be assigned before validation and registration;
- a user cannot act as staff merely by knowing a command or callback payload;
- concurrent lifecycle changes cannot silently overwrite one another;
- duplicate linking preserves every source request;
- priority is explainable and overrides are attributable;
- residents are notified reliably or staff can see the delivery failure;
- completion and rework decisions are auditable;
- the system can be reproduced locally and restored from backup before a paid
  production launch.

## Explicitly outside the first sale

- public administrative web dashboard;
- mobile application or Mini App;
- online payment-provider integration;
- electronic signature or legally binding digital certificate;
- complete accounting, profitability and contract automation;
- videos, archives and general document uploads;
- object-storage cluster, Redis, Kafka, Kubernetes or microservices;
- AI classification, AI priority decisions or chatbot-generated commitments;
- contractor, call-center, government or BI integrations;
- complex multi-organization tenancy.

## Commercial staging

### Demonstration

Run both bots through long polling on an existing computer with local Docker
PostgreSQL and non-sensitive demonstration data. This requires no public domain or
TLS endpoint.

### First paid pilot

Deploy the same application and PostgreSQL schema to one small Linux host. Add
persistent volumes, encrypted off-host database backups, process restart, basic
health monitoring and failure alerts. Continue long polling while usage is low.

### After proven revenue

Add a public webhook/API boundary, durable object storage, staff web interface,
deeper reporting and commercial records in approved checkpoints.
