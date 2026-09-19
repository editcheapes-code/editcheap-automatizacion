# EDITCHEAP automation rebuild briefing

## Purpose

This document captures the business context, operational reality, constraints, and decisions that define the rebuild of EDITCHEAP's automation platform. It is the shared starting point for product and technical work.

The rebuild replaces a working but fragile collection of scheduled scripts with reliable software while preserving Notion as the primary interface for the business operator.

## Business overview

EDITCHEAP is a managed video-editing and social-media services business. Clients place orders that are coordinated by EDITCHEAP and fulfilled with external editors and supervisors.

The operating model is:

1. A client and order are recorded in Notion.
2. Eligible work is offered to editors through Discord.
3. The first eligible editor to claim the work is assigned.
4. EDITCHEAP coordinates the collaboration, material exchange, documentation, delivery, and payment records.
5. Completed work contributes to operational and financial reporting.

Current commercial rules include an editor share of 70% of the order total and, when a supervisor is assigned, a supervisor share of 5%. These values are business policy, not architectural constants, and must be versioned configuration.

## People and roles

### Operator

Jorge manages day-to-day operations. He must be able to create and update orders, clients, editors, services, and workflow commands without using development tools.

### Client

A client purchases a service, supplies source material, receives deliveries and documents, and may use a private Discord collaboration space.

### Editor

An editor is an external collaborator who may claim eligible work, access the assigned collaboration space, receive order information, and receive agreements and payment documents.

### Supervisor

A supervisor oversees assigned work and may receive a configured commission.

### Engineer

An engineer owns application changes, integration contracts, infrastructure, migrations, and structural changes to Notion.

## Existing system landscape

The legacy automation uses:

- Notion as the operational database and user interface.
- Discord for editor offers, claims, notifications, direct messages, and private meeting spaces.
- Google Apps Script, Google Docs, and Google Drive for document generation and storage.
- DIGI Storage through WebDAV for project folders and signed documents.
- YouTube APIs and Notion embeds for a recent-content grid.
- GitHub Actions and an external scheduler as the execution environment.

The production implementation remains on `master` while the replacement is developed on `rebuild`. The production revision at the start of the rebuild is preserved by the `legacy-automation-2026-08-26` tag.

## Existing capability inventory

### Order lifecycle

- Detect orders marked for publication.
- Publish formatted job opportunities to Discord.
- Store the Discord message identity.
- Calculate and store editor compensation.
- Find the first eligible editor response and assign the editor.
- Calculate a delivery deadline from the service catalogue.
- Close an assigned offer.
- Remove offer messages after completion.

### Collaboration

- Allocate a private Discord meeting space.
- Grant access to the client and assigned editor.
- Send welcome and material-link notifications.
- Notify clients about agreements and invoices.
- Notify editors about agreements through direct messages.
- Revoke access and release the space after completion.

### Documents and storage

- Generate client and editor invoices.
- Generate client and editor collaboration agreements.
- Store generated documents in Google Drive.
- Create project and legal-document folders through WebDAV.
- Download signed agreements into controlled storage.

### Business support

- Calculate supervisor commissions.
- Record order completion dates.
- Calculate monthly revenue, completed-order count, and average delivery time.
- Refresh selected Notion pages with recent YouTube content.
- Notify staff when automation fails.

## Problems to solve

The legacy implementation proves the business workflows but has material operational risks:

- Multiple schedulers can run concurrently without a shared lock.
- External side effects and Notion acknowledgements are not atomic.
- Many item-level errors are logged but reported as successful runs.
- Mutable Discord usernames are used as identities.
- Meeting-space ownership and access revocation are not durable.
- Business rules, provider payloads, and orchestration are coupled in one large script.
- Structural Notion assumptions are neither versioned nor validated.
- Production has been used for diagnostics, migrations, and testing.
- Recovery depends on reading transient logs rather than durable operation state.
- Document and file handling lacks sufficient validation and data controls.

The rebuild must address these problems without making normal business operation harder.

## Approved product boundaries

### Notion owns

- Human-authored business data.
- Business workflow intent and operator commands.
- Views, filters, and presentation used for daily operations.
- User-visible status and outcomes projected by the application.

### PostgreSQL owns

- Durable automation state.
- Immutable integration identities.
- Synchronization cursors and observed source versions.
- Jobs, attempts, leases, retries, and failure records.
- Idempotency keys and external resource identities.
- Outbox events and delivery records.
- Audit history and reconciliation results.

Required Notion databases, properties, types, relations, and statuses form a versioned integration contract. The operator may freely manage records and views; structural contract changes require an engineering migration.

## Approved engineering direction

- Build a modular monolith in strict TypeScript.
- Use one repository and one package with multiple entry points.
- Run an always-on application and durable worker backed by PostgreSQL.
- Use real-time Discord events for claims.
- Use change notifications where suitable and reconciliation polling for Notion.
- Treat all provider delivery as at least once.
- Persist intent before executing external side effects.
- Keep external APIs behind typed ports.
- Use immutable provider IDs as identities.
- Maintain isolated development, staging, and production integrations.
- Deploy portable containers in an EU region.
- Use GitHub Actions for continuous integration and controlled delivery, not as the application runtime.

## Service expectations

- Eligible Discord claims are processed within 5 seconds.
- Notion-triggered actions are reflected within 60 seconds.
- Document, storage, and reporting jobs complete within 5 minutes under normal provider operation.
- Transient failures retry automatically.
- No accepted operation is silently lost.
- Failed and delayed work is visible and manually recoverable.
- The architecture supports ten times the measured legacy peak without structural redesign.

## Delivery posture

The replacement is delivered in capability slices. Legacy and replacement systems may coexist, but exactly one system owns writes for a capability at any moment.

The intended order is:

1. Platform foundation and Notion contract validation.
2. Order ingestion and lifecycle.
3. Discord offers and transactional editor claims.
4. Collaboration spaces and access reconciliation.
5. Agreements, invoices, and document delivery.
6. Storage provisioning and signed-document handling.
7. Reporting, metrics, and peripheral automation.

The `rebuild` branch becomes the default only after the agreed replacement scope is complete, production data reconciles, recovery is tested, and cutover is approved.

## Repository policy

- The long-lived replacement branch is `rebuild`.
- Commit messages follow Conventional Commits.
- Commit subjects are lowercase except for proper nouns.
- Commit messages contain one subject line only.
- Commit bodies and attribution trailers are not used.
- Only durable product and engineering artifacts are committed.

## Vocabulary

| Term | Meaning |
| --- | --- |
| order | A purchased unit of client work coordinated by EDITCHEAP. |
| offer | A Discord publication advertising eligible work to editors. |
| claim | An editor's request to take an available order. |
| assignment | The durable relationship between an order and an editor or supervisor. |
| collaboration space | A private Discord space associated with an active order. |
| command | Explicit operator intent that requests an automated action. |
| projection | Application-owned status written back to Notion for human use. |
| capability owner | The single system currently permitted to write a class of production effects. |
| reconciliation | Comparison of expected and provider state to detect or repair drift. |
| external resource | A message, channel, file, document, page, or other provider object created or managed by the application. |
