# Technical requirements document

## Document status

- Product: EDITCHEAP automation platform
- Branch: `rebuild`
- Status: approved foundation
- Date: 2026-08-26

## Technical objective

Build a reliable TypeScript modular monolith that coordinates Notion, Discord, documents, and storage while using PostgreSQL for durable execution, concurrency control, audit history, and reconciliation.

The system must preserve Notion as the operator interface without using Notion properties as locks, queues, or the sole record of external side effects.

## Architecture principles

1. Model the business independently of providers.
2. Keep one deployable codebase until independent scaling or ownership requires separation.
3. Validate all data at trust boundaries.
4. Assume duplicate delivery and partial failure.
5. Persist intent before side effects.
6. Make business invariants database constraints where possible.
7. Keep one writer per production capability.
8. Prefer explicit SQL, configuration, and state transitions over hidden conventions.
9. Preserve history through append-only records and versioned snapshots.
10. Surface ambiguity rather than repairing it destructively.

## System topology

The system is one repository and one package with three runtime entry points:

### Application

Responsibilities:

- Maintain the Discord Gateway connection.
- Receive supported provider callbacks.
- Authenticate restricted operational endpoints.
- Validate and persist inbound events.
- Expose liveness and readiness.

The application does not execute long-running business workflows inline.

### Worker

Responsibilities:

- Consume durable jobs.
- Execute application use cases.
- Call external adapters.
- Record outcomes and external identities.
- Schedule retries.
- Publish Notion projections.

Workers are horizontally scalable. Database leases and constraints prevent duplicate ownership.

### Scheduler

Responsibilities:

- Schedule incremental Notion synchronization.
- Schedule provider reconciliation.
- Schedule reporting and peripheral refreshes.
- Enqueue work rather than performing it directly.

Only one logical schedule occurrence is created for a given schedule key and time window.

## Source layout

The initial implementation remains one package:

```text
src/
  entrypoints/
    app.ts
    worker.ts
    scheduler.ts
  modules/
    orders/
    people/
    assignments/
    collaboration-spaces/
    documents/
    storage/
    notifications/
    reporting/
    operations/
  integrations/
    notion/
    discord/
    documents/
    webdav/
    youtube/
  platform/
    config/
    database/
    jobs/
    logging/
    telemetry/
    http/
  shared/
    kernel/
tests/
  fixtures/
  integration/
  end-to-end/
```

`shared/kernel` contains only stable cross-domain primitives such as identifiers, money, time, result types, and domain errors. It is not a general utility directory.

Each module exposes an explicit public surface. Internal persistence and provider details are not imported across module boundaries.

## Module responsibilities

### Orders

- Canonical order lifecycle.
- State-transition policy.
- Commercial and service snapshots.
- Deadline calculation inputs.
- Notion command interpretation.

### People

- Canonical person records.
- Roles and active eligibility.
- Immutable external identities.
- Display-name synchronization.

### Assignments

- Claim evaluation.
- Transactional winner selection.
- Editor and supervisor assignment history.
- Reassignment and revocation.

### Collaboration spaces

- Space ownership.
- Expected membership.
- Permission reconciliation.
- Welcome and lifecycle intents.

### Documents

- Invoice and agreement requests.
- Input and template versions.
- Generation state.
- External document identities.
- Delivery intent.

### Storage

- Validated path construction.
- Folder provisioning.
- Streamed file transfer.
- Content verification and checksums.

### Notifications

- Versioned message templates.
- Recipient resolution.
- Delivery intent and attempts.
- Mention and audience safety.

### Reporting

- Metric definitions.
- Lifecycle and commercial aggregations.
- Peripheral content synchronization.

### Operations

- Operator-visible operation summaries.
- Retry and cancellation policy.
- Reconciliation findings.
- Manual resolution and audit.

## Domain model

### Order

Key fields:

- Internal UUID.
- Notion page identity.
- Canonical state.
- Observed Notion version.
- Client identity.
- Currency.
- Total amount in minor units.
- Editor and supervisor policy snapshots.
- Service and adjustment snapshots.
- Relevant lifecycle timestamps.
- Active revision.

Canonical lifecycle:

`draft → ready → offered → claimed → active → delivery → completed`

`cancelled` is terminal from supported non-terminal states. Reopening is an explicit authorized command that creates an audit event.

Notion status labels map through versioned configuration. They are not used as domain enum values.

### Assignment

An assignment records:

- Order.
- Person.
- Role.
- State.
- Claim receipt time.
- Start and end time.
- Superseded assignment.
- Actor or event responsible.
- Reason.

A partial unique index enforces one active editor assignment per order. Claim acceptance and assignment creation occur in one transaction.

### External identity

An external identity records provider, provider account or workspace, immutable subject ID, internal subject, and validity period.

Discord usernames are never keys.

### External resource

An external resource records:

- Provider.
- Resource type.
- Provider identity.
- Owning business subject.
- Logical purpose.
- Content or input version.
- Lifecycle state.
- Creation and verification timestamps.

Unique constraints prevent more than one active logical resource for the same owner, purpose, and version.

### Collaboration space

A collaboration space records provider channel identity, owning order, state, expected membership version, and last reconciliation.

Pooled resources use a database lease and unique active ownership constraint. A resource is not released until provider access removal is verified or a reconciliation finding is escalated.

### Document

A document records type, subject, template version, input snapshot, logical version, generation state, provider identity, checksum where available, and delivery state.

Document generation and delivery are separate workflows.

### Operation

An operation is the operator-facing representation of requested work. It records command, subject, state, progress summary, last error, retry eligibility, cancellation eligibility, and timestamps.

Operations refer to internal jobs but do not expose queue internals in Notion.

## Persistence

PostgreSQL is the source of truth for automation state.

Required persistence concepts include:

- Domain tables and history tables.
- `inbox_events` for deduplicated inbound delivery.
- `outbox_events` for transactional publication intent.
- `operations` for operator-visible work.
- `external_resources` for provider identities.
- `audit_events` for business and administrative history.
- pg-boss schemas for durable job execution.
- `reconciliation_findings` for expected-versus-observed drift.
- `capability_ownership` for migration write ownership.

All primary application identifiers are UUIDs. Provider IDs retain their native string representation.

Money uses integer minor units and ISO currency codes. Timestamps use UTC with explicit clocks in testable domain services.

Database migrations are ordered, immutable after release, and tested from every supported deployed version. Destructive changes use expand-and-contract releases.

## Inbound event processing

Inbound delivery follows:

1. Authenticate the provider.
2. Enforce request size and time limits.
3. Parse the minimal envelope.
4. Validate it with Zod.
5. Insert an inbox record using a provider event ID or deterministic fingerprint.
6. Acknowledge duplicate delivery without reapplying business state.
7. Enqueue normalized processing.
8. Process the event through an application use case.

Raw payload retention is minimized. Retained payloads are redacted and bounded.

## Outbox and job processing

Business transactions write state and outbox intent atomically. An outbox dispatcher converts unpublished intent into a durable pg-boss job and records dispatch.

Each handler defines:

- A versioned job name.
- A Zod-validated payload.
- An idempotency key.
- Timeout and lease duration.
- Maximum attempts.
- Retry classification.
- Cancellation policy.
- Observable progress.

Handlers may be delivered more than once. Correctness never depends on exactly-once queue delivery.

External side effects are not held inside open database transactions. The database records logical intent and reconciles the result through provider identities.

## Failure model

Failures are classified as:

- **Transient:** timeouts, rate limits, temporary provider failure, and recoverable connection errors.
- **Permanent:** invalid input, missing permission, incompatible schema, rejected content, and unsupported state.
- **Ambiguous:** the request outcome is unknown because the connection failed after dispatch.
- **Invariant:** local state violates a business or database invariant.

Transient failures retry with bounded exponential backoff and jitter while honoring provider retry instructions.

Permanent failures stop and become operator-visible.

Ambiguous failures reconcile before any repeated side effect.

Invariant failures stop affected work, page engineering, and prohibit automated destructive repair.

Every outbound network operation uses an explicit abort deadline. Worker shutdown stops leasing new work, allows bounded completion, and releases expired leases through pg-boss semantics.

## Notion integration

Notion is a business interface and integration boundary.

### Contract

The adapter defines a versioned contract containing:

- Database identities.
- Required properties and types.
- Relation targets.
- Supported select and status mappings.
- Writable projections.
- Operator command fields.

Startup and scheduled validation compare the live schema with the expected contract. Incompatible changes disable affected capabilities and create an operation visible to the operator.

### Synchronization

Supported change notifications are used when they provide the necessary signal. An incremental poller independently guarantees the 60-second requirement and reconciliation.

The synchronizer stores cursor state and observed page versions. Updates use compare-before-write rules to avoid overwriting newer human edits.

### Commands and projections

Operator intent is converted into a durable command. User-visible status follows:

`requested → processing → succeeded`

or:

`requested → processing → failed`

Retry and cancellation create new audited commands; they do not mutate history.

## Discord integration

`discord.js` maintains the Gateway connection and exposes Discord through an internal port.

Requirements:

- Store immutable guild, channel, message, role, and user IDs.
- Record Gateway resume state where supported by the library.
- Reject claims from bots, inactive editors, completed orders, and unrelated messages.
- Use database receipt time and sequence for claim ordering.
- Resolve the winner transactionally.
- Configure allowed mentions explicitly.
- Validate message length and attachment policy before dispatch.
- Respect Discord rate-limit responses.
- Reconcile offer existence, collaboration-space ownership, membership, and permissions.

Discord callbacks enqueue work after durable receipt. They do not run multi-provider workflows on the Gateway event loop.

## Document integration

Document generation is behind a typed port. The initial adapter may preserve the existing Google Docs and Drive workflow if it satisfies idempotency, authorization, and verification requirements.

Each request includes a stable logical document key and input version. Provider output is not acknowledged until an external identity is stored.

Generated links are treated as sensitive. Logs contain resource IDs and operation IDs, not document contents or signed URLs.

## Storage integration

The WebDAV adapter:

- Builds paths only from normalized safe segments.
- Rejects empty, dot, dot-dot, separator, control-character, and reserved-name segments.
- Confines all paths beneath configured roots.
- Streams downloads and uploads with byte limits.
- Applies protocol and host allowlists.
- Validates expected content types.
- Records size and checksum.
- Verifies the destination before acknowledging completion.

Client project material and legal documents use separate roots and access policy.

## Reporting and peripheral jobs

Reporting consumes canonical lifecycle and commercial state rather than reparsing provider records.

Completion time uses explicit work and completion timestamps. Revenue uses an explicitly configured accounting date and formula.

Metric recomputation is deterministic and writes zeros when a previously populated aggregation becomes empty.

YouTube and other peripheral refreshes use independent queues and concurrency limits. They cannot block or fail the critical order path.

## Technology stack

- Node.js 24 LTS, minimum version 24.17.0.
- TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables`.
- pnpm with a frozen lockfile.
- Zod for runtime validation.
- Fastify for HTTP endpoints.
- PostgreSQL as the durable store.
- Kysely for explicit typed SQL and migrations.
- pg-boss for durable PostgreSQL-backed jobs.
- discord.js for Discord Gateway and API integration.
- The official Notion SDK behind an internal adapter.
- Pino for structured logging.
- OpenTelemetry-compatible traces and metrics.
- Biome for formatting and baseline linting.
- Vitest for unit and integration test orchestration.
- Docker for reproducible runtime artifacts.

Bun is not used as runtime, package manager, or test runner in the initial production system. Using one runtime across development, testing, and production avoids compatibility drift.

No ORM record is a domain object. No provider SDK type crosses an integration boundary. No dependency-injection container or decorator framework is required.

## Configuration

Configuration is parsed once at startup through Zod and passed explicitly.

Configuration categories:

- Environment identity.
- Database connection.
- Integration credentials and resource identities.
- Notion contract versions and mappings.
- Capability ownership switches.
- Timeouts and bounded concurrency.
- Commercial policy versions.
- Retention and redaction rules.

Missing or incompatible required configuration prevents readiness. Secrets are supplied by the deployment platform and never fall back to committed defaults.

## Security and privacy

- Deploy production and primary data in an EU region.
- Use separate credentials and provider resources per environment.
- Apply least privilege to every integration.
- Authenticate callbacks and restricted operational endpoints.
- Redact credentials, personal identifiers, document contents, and signed URLs from logs and telemetry.
- Encrypt provider transport and managed data at rest.
- Restrict production access and audit administrative actions.
- Define retention per data class before cutover.
- Test backup restoration before cutover and periodically thereafter.
- Scan dependencies, containers, and committed changes in CI.

Development fixtures contain sanitized synthetic data only.

## Observability

Logs are structured and include:

- Environment.
- Trace and correlation ID.
- Operation and job ID.
- Business subject ID.
- Integration and action.
- Attempt and outcome.

Metrics include:

- Discord Gateway connection and event lag.
- Notion synchronization lag.
- Queue depth and oldest-job age by job type.
- Job duration, attempts, and failures.
- Claim processing latency.
- External request latency and failure class.
- Reconciliation findings by severity.
- Product SLO attainment.

Alerts reference durable operation and subject identities. Health endpoints distinguish process liveness from dependency readiness.

## Testing strategy

### Unit tests

Pure tests cover:

- State transitions.
- Claim eligibility and winner selection.
- Money and compensation policy.
- Deadline policy.
- Versioning and idempotency keys.
- Path normalization.
- Retry classification.

### Database integration tests

Tests run against ephemeral real PostgreSQL and cover:

- Migrations.
- Constraints.
- Concurrent claims.
- Outbox atomicity.
- Job leasing and recovery.
- Capability ownership.
- Reconciliation persistence.

### Adapter contract tests

Adapters are tested against sanitized versioned fixtures for success, pagination, rate limits, malformed responses, permission failures, and provider changes.

### Staging tests

Isolated provider resources validate real authentication, event delivery, permissions, message formatting, documents, and storage.

### End-to-end tests

Critical scenarios include:

- Order to offer to accepted claim.
- Simultaneous eligible claims.
- Crash after provider dispatch but before local acknowledgement.
- Reassignment and collaboration access reconciliation.
- Document generation and delivery retry.
- Completion and verified access removal.
- Legacy-to-replacement capability handoff and rollback.

CI requires formatting, linting, type checking, tests, migration verification, dependency review, secret scanning, and container build.

## Deployment

The system deploys as immutable containers to a managed EU-region platform with managed PostgreSQL, point-in-time recovery, and a secret manager.

The same image is promoted between environments. Application, worker, and scheduler use different commands and may receive different credentials.

Release sequence:

1. Verify the release against staging.
2. Apply backward-compatible migrations.
3. Deploy application and worker.
4. Verify readiness, Gateway health, and queue processing.
5. Enable new capability behavior deliberately.
6. Monitor SLOs and reconciliation.
7. Remove obsolete schema only in a later release.

GitHub Actions performs continuous integration, image creation, and controlled delivery. Actions are pinned, permissions are explicit, dependencies are frozen, and production automation does not execute from a scheduled repository workflow.

## Migration and cutover

Migration follows the capability slices in the PRD.

For each capability:

1. Implement and test against isolated environments.
2. Observe production inputs without external writes.
3. Compare expected results with legacy outcomes.
4. Reconcile identities and historical state.
5. Set replacement capability ownership in one controlled operation.
6. Disable the matching legacy writer.
7. Monitor operations and drift.
8. Roll back ownership if acceptance fails.

Dual writes are prohibited. Read-only shadow operation is permitted.

The final branch promotion requires all product acceptance criteria, a verified data reconciliation, tested restoration and rollback, and explicit operator and engineering approval.
