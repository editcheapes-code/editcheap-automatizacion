# Product requirements document

## Document status

- Product: EDITCHEAP automation platform
- Branch: `rebuild`
- Status: approved foundation
- Date: 2026-08-26

## Product vision

Provide EDITCHEAP with a dependable operational platform that lets a non-technical operator manage the business through Notion while automation executes quickly, safely, observably, and recoverably across Discord, document systems, and storage.

## Problem statement

The current automation demonstrates valuable workflows but does not provide reliable concurrency control, durable recovery, stable identity, test isolation, or trustworthy operational visibility. Failures can create duplicate or orphaned resources, remain hidden in logs, or leave access permissions inconsistent.

The replacement must preserve the ease of Notion and Discord while introducing explicit business state, durable execution, controlled integrations, and staged migration.

## Goals

1. Preserve Notion as the primary operator experience.
2. Deliver current business capabilities through reliable, recoverable workflows.
3. Process editor claims in real time and select exactly one eligible winner.
4. Prevent duplicate external effects under retries and concurrent delivery.
5. Make every operation and failure visible without requiring log inspection.
6. Protect personal, commercial, and document data.
7. Support isolated development and staging.
8. Permit incremental migration with a safe rollback path.
9. Establish a maintainable foundation for future product development.

## Non-goals

- Replacing Notion with a custom administrative interface.
- Building a client-facing or editor-facing web application.
- Introducing microservices.
- Building a general-purpose workflow engine.
- Changing commercial policy as part of the rebuild.
- Redesigning approved Spanish-language customer and editor messaging without a separate product decision.
- Supporting arbitrary structural Notion edits without migration.
- Running production automation from GitHub Actions.

## Personas and needs

### Operator

The operator needs to:

- Create and update business records in Notion.
- Request supported automated actions explicitly.
- Understand whether an action is pending, processing, complete, delayed, or failed.
- Retry or cancel eligible failed actions safely.
- Resolve ambiguous conflicts with clear guidance.
- Avoid development tools and provider consoles during normal work.

### Client

The client needs to:

- Receive correct collaboration access and information.
- Exchange material through approved links.
- Receive agreements, invoices, and delivery information.
- Lose private access when the collaboration ends.
- Never see another client's private information or space.

### Editor

The editor needs to:

- See available work promptly.
- Claim an order through Discord.
- Receive an unambiguous accepted or rejected outcome.
- Access only assigned collaboration resources.
- Receive agreements and relevant documents.

### Engineer

The engineer needs to:

- Change business automation through tested, reviewed code.
- Validate and migrate Notion contracts.
- Observe system health and individual operations.
- Reconcile provider drift.
- Deploy and roll back without losing accepted work.
- Reproduce failures outside production.

## Product principles

- Notion remains easy; reliability complexity stays behind the interface.
- Human intent is explicit and auditable.
- One capability has one writer.
- Accepted work is durable.
- Provider retries are normal, not exceptional.
- Ambiguous state is surfaced rather than guessed.
- Personal data is minimized and redacted.
- Business history is appended, not overwritten.

## Functional requirements

### Environment and contract management

- **FR-001:** The system shall maintain isolated development, staging, and production configurations and provider resources.
- **FR-002:** The system shall validate required Notion databases, properties, types, relations, and configured status mappings before processing work.
- **FR-003:** The system shall refuse incompatible structural changes and publish a human-readable contract error.
- **FR-004:** Structural Notion changes shall be introduced through versioned migrations.
- **FR-005:** Capability ownership shall be explicit per environment and shall prevent concurrent legacy and replacement writers.

### Identity and people

- **FR-010:** The system shall associate people with immutable Notion and Discord identities.
- **FR-011:** Usernames and display names shall be treated as mutable presentation data.
- **FR-012:** An active editor shall be eligible to claim work only when a valid Discord identity is registered.
- **FR-013:** Identity changes shall preserve historical assignments and audit records.

### Order synchronization and lifecycle

- **FR-020:** The system shall ingest relevant order and related-record changes from Notion.
- **FR-021:** The system shall map configured Notion values to canonical order states.
- **FR-022:** The system shall enforce valid state transitions.
- **FR-023:** The system shall snapshot service, price, compensation, adjustment, currency, and deadline inputs when an order becomes actionable.
- **FR-024:** Later catalogue changes shall not silently alter an actionable or accepted order.
- **FR-025:** A commercial change to an actionable order shall create an explicit revision.
- **FR-026:** Completion and cancellation shall be terminal unless an authorized operator performs an explicit reopen operation.

### Offers and claims

- **FR-030:** An eligible order command shall create at most one active Discord offer.
- **FR-031:** Offer content shall use validated business data and approved message templates.
- **FR-032:** Generated Discord content shall enforce provider length and mention-safety rules.
- **FR-033:** The system shall receive editor claims through real-time Discord events.
- **FR-034:** Exactly one eligible editor shall win a claim for an available order.
- **FR-035:** Claim ordering shall use server receipt order and a transactional uniqueness constraint.
- **FR-036:** Accepted and rejected claim outcomes shall be recorded and communicated.
- **FR-037:** Assigning an editor shall close the active offer and create an assignment history record.
- **FR-038:** Reassignment shall preserve the previous assignment and require an auditable reason.
- **FR-039:** Completed or cancelled orders shall not accept claims unless explicitly reopened.

### Collaboration spaces

- **FR-040:** An eligible active order shall have at most one owned collaboration space.
- **FR-041:** The system shall grant access only to the client, assigned editor, and authorized staff.
- **FR-042:** Membership shall be derived from durable identities and expected ownership.
- **FR-043:** Completion, cancellation, or reassignment shall trigger access reconciliation.
- **FR-044:** The system shall not mark a space released until required access removal is verified or escalated.
- **FR-045:** The system shall detect and report unexpected members or permissions.
- **FR-046:** Welcome, material-link, agreement, and invoice notifications shall be delivered at most once per intended version.

### Documents

- **FR-050:** The operator shall be able to request supported client and editor invoices.
- **FR-051:** The operator shall be able to request supported client and editor collaboration agreements.
- **FR-052:** Every document shall record its type, business subject, template version, input snapshot, generation status, and external identity.
- **FR-053:** Retries shall not create duplicate logical documents.
- **FR-054:** A changed document input shall create a new version rather than silently replacing history.
- **FR-055:** Document delivery shall be recorded separately from document generation.
- **FR-056:** Personal identifiers and document contents shall not appear in application logs.

### Storage

- **FR-060:** The system shall provision project and legal-document locations from validated path components.
- **FR-061:** Storage operations shall reject traversal sequences, invalid names, unexpected media types, and files exceeding configured limits.
- **FR-062:** Remote downloads shall use approved protocols and host policies.
- **FR-063:** Large files shall be streamed rather than loaded completely into application memory.
- **FR-064:** A completed upload shall be verified before the source record is acknowledged.
- **FR-065:** Signed-document handling shall maintain an auditable link between source, destination, and checksum.

### Notifications

- **FR-070:** Notification intent and delivery outcome shall be durable.
- **FR-071:** Notifications shall have a stable idempotency key per recipient, purpose, and content version.
- **FR-072:** Temporary delivery failures shall retry automatically.
- **FR-073:** Permanent delivery failures shall be visible to the operator.
- **FR-074:** Notification content shall not expose data outside the intended audience.

### Reporting and peripheral automation

- **FR-080:** Completion metrics shall use explicit lifecycle timestamps.
- **FR-081:** Revenue reporting shall use an explicit accounting date and documented calculation policy.
- **FR-082:** Recalculation shall correct stale values, including transitions to zero.
- **FR-083:** Metric definitions and commercial percentages shall be versioned configuration.
- **FR-084:** Recent-content synchronization shall be isolated from order processing and shall not delay critical workflows.

### Operations and recovery

- **FR-090:** The operator shall have a Notion view of pending, processing, delayed, failed, and completed operations.
- **FR-091:** Each operation shall provide a human-readable summary and last failure where applicable.
- **FR-092:** Eligible failed operations shall support controlled retry.
- **FR-093:** Eligible pending operations shall support controlled cancellation.
- **FR-094:** Ambiguous provider state shall require human resolution and shall not be repaired destructively.
- **FR-095:** Reconciliation shall compare expected and observed provider state.
- **FR-096:** Safe drift shall be repairable automatically; unsafe drift shall be reported.
- **FR-097:** Manual operational changes shall record actor, reason, time, and outcome.

## Non-functional requirements

### Latency

- **NFR-001:** Eligible Discord claims shall be processed within 5 seconds at the 95th percentile under normal provider operation.
- **NFR-002:** Notion-triggered actions shall show an updated application status within 60 seconds at the 95th percentile.
- **NFR-003:** Document, storage, and reporting jobs shall finish within 5 minutes at the 95th percentile, excluding provider outages and operator intervention.

### Reliability

- **NFR-010:** An accepted command or event shall not be silently lost.
- **NFR-011:** Processing shall tolerate duplicate event delivery and worker restarts.
- **NFR-012:** External side effects shall be idempotent or reconciled through durable identities and state.
- **NFR-013:** Job leases shall expire safely after worker failure.
- **NFR-014:** Transient failures shall use bounded exponential backoff with jitter.
- **NFR-015:** Permanent and exhausted failures shall remain recoverable.

### Integrity and concurrency

- **NFR-020:** Business invariants shall be enforced transactionally in PostgreSQL.
- **NFR-021:** There shall be at most one active editor assignment per order.
- **NFR-022:** There shall be at most one active offer per order and channel purpose.
- **NFR-023:** There shall be at most one active owner per pooled collaboration resource.
- **NFR-024:** Money shall be stored as integer minor units with an explicit currency.
- **NFR-025:** Application timestamps shall be stored in UTC and rendered in the relevant business timezone.

### Security and privacy

- **NFR-030:** Production infrastructure and primary data shall run in an EU region.
- **NFR-031:** Credentials shall be isolated by environment and limited to required permissions.
- **NFR-032:** Logs and telemetry shall redact credentials, signed URLs, personal identifiers, and document contents.
- **NFR-033:** Data retention shall be explicitly configured by data class before production cutover.
- **NFR-034:** Backups and restoration shall be tested before production cutover and periodically thereafter.
- **NFR-035:** Administrative operations shall require authenticated authorization and create audit records.

### Operability

- **NFR-040:** The system shall expose health and readiness independently.
- **NFR-041:** The system shall measure queue depth, oldest-job age, synchronization lag, claim latency, integration failure rates, and reconciliation drift.
- **NFR-042:** Alerts shall identify durable operation records and affected business subjects.
- **NFR-043:** Every production capability shall have a documented disable and rollback mechanism.

### Maintainability and portability

- **NFR-050:** The implementation shall be a strict TypeScript modular monolith.
- **NFR-051:** Domain modules shall not depend directly on provider SDK payloads.
- **NFR-052:** The application shall run in standard containers against standard PostgreSQL.
- **NFR-053:** Development shall not require access to production credentials or data.
- **NFR-054:** The system shall support ten times the measured legacy peak without an architectural change.

## Capability delivery

### Slice 1: foundation

Deliver environment isolation, configuration validation, database migrations, durable jobs, observability, and the Notion contract validator.

### Slice 2: order lifecycle

Deliver order ingestion, canonical states, commercial snapshots, commands, projections, and reconciliation.

### Slice 3: offers and claims

Deliver Discord offers, real-time claims, transactional winner selection, assignment history, and offer closure.

### Slice 4: collaboration

Deliver collaboration-space ownership, membership, notifications, access removal, and drift reconciliation.

### Slice 5: documents

Deliver agreements, invoices, template versions, generation, delivery, and retries.

### Slice 6: storage

Deliver safe folder provisioning, signed-document transfer, validation, verification, and audit records.

### Slice 7: reporting

Deliver corrected operational metrics, commercial reporting, and isolated recent-content synchronization.

## Product acceptance

The replacement is eligible for final production promotion when:

1. Every capability in the agreed replacement scope passes staging acceptance.
2. Critical order scenarios pass end-to-end tests.
3. Concurrency tests prove a single claim winner and no duplicate logical external resources.
4. Crash-recovery tests prove accepted operations resume safely.
5. Notion schema validation detects incompatible changes before work is processed.
6. Production shadow observation reconciles with the legacy system for the agreed period.
7. Capability cutovers and rollbacks have been exercised.
8. Access reconciliation finds no unexplained private-space membership.
9. Backup restoration and database migration recovery have been exercised.
10. The operator can identify, retry, cancel, and resolve supported operations from Notion.
11. Service targets are met under ten times the measured legacy peak.
12. The engineer and operator approve the final cutover.

## Success measures

- Zero orders with more than one active editor assignment.
- Zero duplicate logical offers, invoices, agreements, or delivery notifications.
- Zero known private-space access leaks.
- All accepted operations represented by durable state.
- At least 95% of normal operations meet the defined latency targets.
- All exhausted failures visible to the operator.
- All production structural Notion changes applied through migrations.
- Production testing no longer used for ordinary development validation.
