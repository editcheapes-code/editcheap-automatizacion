# EDITCHEAP rebuild implementation plan

## Goal

Replace the legacy scheduled automation with a reliable TypeScript modular monolith while preserving Notion as the operator interface and migrating production capability by capability with one writer at a time.

## Architecture

The repository remains one package with three entry points: an always-on application, a durable worker, and a scheduler. PostgreSQL owns automation state, concurrency, idempotency, audit history, and reconciliation. Notion, Discord, document generation, WebDAV, and YouTube are typed adapters around business-focused modules.

## Technology

Node.js 24 LTS, TypeScript, pnpm, Zod, Fastify, PostgreSQL, Kysely, pg-boss, discord.js, the Notion SDK, Pino, OpenTelemetry, Biome, Vitest, Testcontainers, and Docker.

## Specifications

- [Business and migration context](./briefing.md)
- [Product requirements](./prd.md)
- [Technical requirements](./trd.md)

## Global constraints

- Use Node.js 24.17.0 or newer within the Node.js 24 LTS line.
- Use one package and one repository; do not introduce workspace or monorepo tooling.
- Keep domain modules independent from provider SDK types and persistence records.
- Validate every external boundary with Zod.
- Store money as integer minor units with an ISO currency code.
- Store timestamps in UTC and inject clocks into domain services.
- Assume every inbound event and job may be delivered more than once.
- Persist business state and outbox intent atomically.
- Never use Notion fields as locks or queue state.
- Never use Discord usernames as identities.
- Keep development, staging, and production credentials and resources isolated.
- Keep the production runtime and primary data in an EU region.
- Use test-driven development for domain behavior and integration boundaries.
- Every task ends with the listed subject-only Conventional Commit.
- Commit subjects remain lowercase except for proper nouns and contain no body or attribution trailer.

## Delivery gates

| Gate | Tasks | Deployable outcome |
| --- | --- | --- |
| Foundation | 1–5 | All three entry points start, validate configuration, connect to PostgreSQL, expose health, and process a durable test job. |
| Orders | 6–9 | Notion contracts validate and orders synchronize read-only into a canonical lifecycle with visible operations. |
| Offers | 10–13 | Discord events are durable, offers are idempotent, and concurrent claims select one editor. |
| Collaboration | 14 | Collaboration-space ownership and membership reconcile safely. |
| Documents and storage | 15–16 | Versioned documents and signed files execute through recoverable workflows. |
| Reporting | 17 | Metrics and peripheral refreshes are deterministic and isolated. |
| Production readiness | 18–20 | Recovery is operator-visible, images are deployable, and capability cutover is rehearsed. |

## Requirements coverage

| Requirements | Implemented and verified by |
| --- | --- |
| FR-001–FR-005 | Tasks 2, 3, 6, 19, and 20 |
| FR-010–FR-013 | Tasks 11 and 13 |
| FR-020–FR-026 | Tasks 7–9 |
| FR-030–FR-039 | Tasks 10–13 |
| FR-040–FR-046 | Tasks 10 and 14 |
| FR-050–FR-056 | Tasks 10 and 15 |
| FR-060–FR-065 | Task 16 |
| FR-070–FR-074 | Task 10 |
| FR-080–FR-084 | Task 17 |
| FR-090–FR-097 | Tasks 9 and 18 |
| NFR-001–NFR-003 | Tasks 7, 13, 15–17, and 20 |
| NFR-010–NFR-015 | Tasks 3, 4, 7, and 9–18 |
| NFR-020–NFR-025 | Tasks 3, 8, and 12–14 |
| NFR-030–NFR-035 | Tasks 2, 5, 15, 16, and 18–20 |
| NFR-040–NFR-043 | Tasks 5 and 18–20 |
| NFR-050–NFR-054 | Tasks 1–5, 19, and 20 |

---

## Task 1: establish the TypeScript toolchain

**Files**

- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `biome.json`
- Create: `.node-version`
- Create: `.gitignore`
- Create: `src/shared/kernel/identity.ts`
- Create: `tests/unit/shared/identity.test.ts`

**Interfaces**

```ts
export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type EntityId = Brand<string, "EntityId">;
export type ExternalIdentityId = Brand<string, "ExternalIdentityId">;

export function entityId(value: string): EntityId;
export function externalIdentityId(value: string): ExternalIdentityId;
```

- [ ] **Step 1: write the failing identity test**

```ts
import { describe, expect, it } from "vitest";
import { entityId } from "../../../src/shared/kernel/identity.js";

describe("entityId", () => {
  it("rejects a non-UUID value", () => {
    expect(() => entityId("not-an-id")).toThrow("invalid entity id");
  });
});
```

- [ ] **Step 2: install and prove the test fails**

Run:

```bash
corepack enable
pnpm install --frozen-lockfile=false
pnpm exec vitest run tests/unit/shared/identity.test.ts
```

Expected: failure because `identity.ts` does not yet export a working validator.

- [ ] **Step 3: configure the toolchain and implement the branded identifier**

The package scripts must include `build`, `typecheck`, `lint`, `format`, `format:check`, `test`, and `test:integration`. Configure ESM, strict TypeScript, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables`. Implement `entityId` with `z.string().uuid()` and provider identities with a non-empty bounded string schema. Keep `.gitignore` limited to runtime secrets, dependencies, build output, coverage, and operating-system artifacts.

- [ ] **Step 4: verify the foundation**

Run:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit zero and the build emits only `dist/` artifacts.

- [ ] **Step 5: commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json biome.json .node-version .gitignore src/shared/kernel/identity.ts tests/unit/shared/identity.test.ts
git commit -m "chore: establish the TypeScript toolchain"
```

## Task 2: validate runtime configuration

**Files**

- Create: `src/platform/config/schema.ts`
- Create: `src/platform/config/load-config.ts`
- Create: `src/platform/config/types.ts`
- Create: `tests/unit/platform/config.test.ts`

**Interfaces**

```ts
export type EnvironmentName = "development" | "staging" | "production";

export interface AppConfig {
  readonly environment: EnvironmentName;
  readonly databaseUrl: string;
  readonly http: { readonly host: string; readonly port: number };
  readonly notion: {
    readonly token: string;
    readonly contractVersion: string;
    readonly operatorUserIds: readonly string[];
  };
  readonly discord: { readonly token: string; readonly applicationId: string; readonly guildId: string };
  readonly capabilities: Readonly<Record<string, "legacy" | "replacement" | "disabled">>;
  readonly retentionDays: Readonly<Record<"inbox" | "audit" | "operations" | "documents", number>>;
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig;
```

- [ ] **Step 1: write failing configuration tests**

Cover valid development configuration, missing secrets, malformed URLs, unsupported environments, and a production configuration that attempts to use development provider identities.

```ts
expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
  "invalid runtime configuration",
);
```

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/platform/config.test.ts`.

Expected: failure because `loadConfig` does not exist.

- [ ] **Step 3: implement one-time Zod parsing**

Parse the complete environment once, return an immutable typed object, and format validation failures without printing values. Do not read `process.env` outside the entry points.

- [ ] **Step 4: verify configuration**

Run `pnpm exec vitest run tests/unit/platform/config.test.ts && pnpm typecheck`.

Expected: all configuration cases pass with no secret values in snapshots.

- [ ] **Step 5: commit**

```bash
git add src/platform/config tests/unit/platform/config.test.ts
git commit -m "feat: validate runtime configuration"
```

## Task 3: establish durable persistence

**Files**

- Create: `src/platform/database/database.ts`
- Create: `src/platform/database/types.ts`
- Create: `src/platform/database/migrator.ts`
- Create: `src/platform/database/migrations/001_foundation.ts`
- Create: `tests/integration/database/foundation.test.ts`
- Create: `tests/support/postgres.ts`

**Interfaces**

```ts
export interface TransactionContext {
  readonly db: Kysely<DatabaseSchema>;
}

export interface Database {
  transaction<Result>(
    operation: (context: TransactionContext) => Promise<Result>,
  ): Promise<Result>;
  destroy(): Promise<void>;
}
```

The first migration creates `capability_ownership`, `inbox_events`, `outbox_events`, `operations`, `external_resources`, `audit_events`, and `reconciliation_findings` with timestamps, uniqueness constraints, and foreign keys defined in the TRD.

- [ ] **Step 1: write the failing migration test**

Start ephemeral PostgreSQL with Testcontainers, migrate from an empty database, assert every table and unique index exists, and verify each supported deployed schema can migrate forward to the current schema.

- [ ] **Step 2: prove the migration test fails**

Run `pnpm test:integration -- tests/integration/database/foundation.test.ts`.

Expected: failure because the migrator and schema do not exist.

- [ ] **Step 3: implement the database boundary and migration**

Use `pg` only inside the platform database adapter. Configure statement and connection timeouts. Map database errors into typed platform errors without leaking SQL parameters. Released migrations are append-only; application rollback remains compatible with the previously deployed schema, and destructive changes use later expand-and-contract releases.

- [ ] **Step 4: verify persistence**

Run:

```bash
pnpm test:integration -- tests/integration/database/foundation.test.ts
pnpm typecheck
```

Expected: clean empty and supported-version upgrades with enforced duplicate inbox and external-resource constraints.

- [ ] **Step 5: commit**

```bash
git add src/platform/database tests/integration/database tests/support/postgres.ts
git commit -m "feat: establish durable persistence"
```

## Task 4: add durable jobs and transactional outbox

**Files**

- Create: `src/platform/jobs/job-definition.ts`
- Create: `src/platform/jobs/job-registry.ts`
- Create: `src/platform/jobs/job-runtime.ts`
- Create: `src/platform/jobs/outbox-repository.ts`
- Create: `src/platform/jobs/outbox-dispatcher.ts`
- Create: `src/platform/jobs/failure.ts`
- Create: `tests/integration/jobs/outbox.test.ts`
- Create: `tests/integration/jobs/recovery.test.ts`

**Interfaces**

```ts
export interface JobDefinition<Name extends string, Payload> {
  readonly name: Name;
  readonly schema: z.ZodType<Payload>;
  readonly timeoutMs: number;
  readonly retryLimit: number;
  idempotencyKey(payload: Payload): string;
  handle(payload: Payload, context: JobContext): Promise<void>;
}

export interface JobContext {
  readonly transaction: TransactionContext;
  readonly signal: AbortSignal;
  readonly attempt: number;
}

export type FailureClass = "transient" | "permanent" | "ambiguous" | "invariant";
export function classifyFailure(error: unknown): FailureClass;
```

- [ ] **Step 1: write failing outbox and crash-recovery tests**

Prove that a rolled-back business transaction publishes no job, duplicate dispatcher delivery produces one logical pg-boss job, and an expired worker lease allows recovery.

- [ ] **Step 2: prove the tests fail**

Run `pnpm test:integration -- tests/integration/jobs`.

Expected: failure because no job runtime exists.

- [ ] **Step 3: implement pg-boss registration and outbox dispatch**

Use stable versioned job names, validated payloads, singleton registration, bounded concurrency, and deterministic idempotency keys. Mark outbox dispatch only after pg-boss accepts the logical job.

- [ ] **Step 4: verify job semantics**

Run `pnpm test:integration -- tests/integration/jobs && pnpm typecheck`.

Expected: atomic intent, duplicate tolerance, and crash recovery pass.

- [ ] **Step 5: commit**

```bash
git add src/platform/jobs tests/integration/jobs
git commit -m "feat: add durable job processing"
```

## Task 5: expose runtime health and telemetry

**Files**

- Create: `src/platform/logging/logger.ts`
- Create: `src/platform/telemetry/telemetry.ts`
- Create: `src/platform/http/health.ts`
- Create: `src/platform/runtime/shutdown.ts`
- Create: `src/entrypoints/app.ts`
- Create: `src/entrypoints/worker.ts`
- Create: `src/entrypoints/scheduler.ts`
- Create: `tests/integration/runtime/health.test.ts`
- Create: `tests/unit/platform/redaction.test.ts`

**Interfaces**

```ts
export interface HealthProbe {
  readonly name: string;
  check(): Promise<{ readonly ready: boolean; readonly detail?: string }>;
}

export function createLogger(config: AppConfig): Logger;
export function installShutdown(signal: AbortSignal, resources: readonly AsyncDisposable[]): void;
```

- [ ] **Step 1: write failing health and redaction tests**

Assert that liveness succeeds while readiness fails for an unavailable database, and that tokens, DNI/CIF/NIE values, signed URLs, and document content are redacted.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/integration/runtime tests/unit/platform/redaction.test.ts`.

Expected: failure because the health routes, redaction policy, and runtime entry points do not exist.

- [ ] **Step 3: implement the three entry points**

The application starts Fastify and health probes. The worker starts pg-boss and the registry. The scheduler enqueues a versioned heartbeat job. All entry points parse config once, initialize telemetry, and shut down gracefully on `SIGTERM`.

- [ ] **Step 4: verify the foundation gate**

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then start each compiled entry point against ephemeral PostgreSQL and verify bounded shutdown.

- [ ] **Step 5: commit**

```bash
git add src/platform/logging src/platform/telemetry src/platform/http src/platform/runtime src/entrypoints tests/integration/runtime tests/unit/platform/redaction.test.ts
git commit -m "feat: expose runtime health and telemetry"
```

## Task 6: validate the Notion contract

**Files**

- Create: `src/integrations/notion/notion-port.ts`
- Create: `src/integrations/notion/notion-adapter.ts`
- Create: `src/integrations/notion/contract.ts`
- Create: `src/integrations/notion/contract-validator.ts`
- Create: `src/integrations/notion/contract-migration.ts`
- Create: `src/integrations/notion/contracts/v1.ts`
- Create: `src/modules/orders/order-state.ts`
- Create: `tests/fixtures/notion/schema-v1.json`
- Create: `tests/unit/integrations/notion/contract-validator.test.ts`
- Create: `tests/contract/notion/notion-adapter.test.ts`
- Create: `tests/integration/notion/contract-readiness.test.ts`

**Interfaces**

```ts
export interface NotionContract {
  readonly version: string;
  readonly dataSources: readonly DataSourceContract[];
  readonly statusMappings: Readonly<Record<string, OrderState>>;
}

export const orderStates = [
  "draft",
  "ready",
  "offered",
  "claimed",
  "active",
  "delivery",
  "completed",
  "cancelled",
] as const;

export type OrderState = (typeof orderStates)[number];

export interface ContractValidation {
  readonly compatible: boolean;
  readonly errors: readonly ContractError[];
}

export function validateNotionContract(
  expected: NotionContract,
  observed: readonly ObservedDataSource[],
): ContractValidation;
```

- [ ] **Step 1: write failing contract tests**

Cover exact compatibility, renamed properties, wrong property types, missing relations, unknown status mappings, additive harmless fields, a reviewed v1-to-v2 structural migration, resumable migration failure, affected-capability readiness, operator-visible incompatibility, and redacted error rendering.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/integrations/notion tests/contract/notion tests/integration/notion/contract-readiness.test.ts`.

Expected: failure because the contract types, adapter, and readiness behavior do not exist.

- [ ] **Step 3: implement the port, adapter, and versioned contract**

The official SDK is confined to the adapter. Convert SDK responses to internal observed-schema types before validation. Resource IDs come from configuration, never the committed contract. Structural changes execute as explicit version-to-version operations with a dry run, compatibility check, resumable progress, and operator-visible result.

- [ ] **Step 4: verify contract behavior**

Run `pnpm exec vitest run tests/unit/integrations/notion tests/contract/notion tests/integration/notion/contract-readiness.test.ts && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/integrations/notion src/modules/orders/order-state.ts tests/fixtures/notion tests/unit/integrations/notion tests/contract/notion tests/integration/notion/contract-readiness.test.ts
git commit -m "feat: validate the Notion contract"
```

## Task 7: synchronize Notion changes durably

**Files**

- Create: `src/integrations/notion/page-normalizer.ts`
- Create: `src/integrations/notion/synchronization-cursor-repository.ts`
- Create: `src/integrations/notion/notion-synchronizer.ts`
- Create: `src/platform/database/migrations/002_notion_sync.ts`
- Create: `tests/integration/notion/synchronizer.test.ts`

**Interfaces**

```ts
export interface NotionChange {
  readonly pageId: string;
  readonly sourceVersion: string;
  readonly editedAt: Date;
  readonly kind: "order" | "person" | "service" | "invoice";
  readonly value: unknown;
}

export interface SyncSummary {
  readonly observed: number;
  readonly inserted: number;
  readonly duplicates: number;
  readonly nextCursor: string | null;
}

export interface NotionSynchronizer {
  synchronize(signal: AbortSignal): Promise<SyncSummary>;
}
```

- [ ] **Step 1: write failing pagination and deduplication tests**

Cover multiple pages, an interrupted cursor, duplicate observations, a page edited during synchronization, and a poll completing within the configured 60-second window.

- [ ] **Step 2: prove the tests fail**

Run `pnpm test:integration -- tests/integration/notion/synchronizer.test.ts`.

- [ ] **Step 3: implement incremental synchronization**

Persist cursors only after durable inbox insertion. Use source versions for deduplication and route each normalized change to a versioned job by kind. The scheduler enqueues synchronization; it never calls Notion directly.

- [ ] **Step 4: verify synchronization**

Run `pnpm test:integration -- tests/integration/notion && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/integrations/notion src/platform/database/migrations/002_notion_sync.ts tests/integration/notion
git commit -m "feat: synchronize Notion changes"
```

## Task 8: model the order lifecycle and commercial snapshot

**Files**

- Create: `src/shared/kernel/money.ts`
- Create: `src/shared/kernel/clock.ts`
- Create: `src/modules/orders/order.ts`
- Modify: `src/modules/orders/order-state.ts`
- Create: `src/modules/orders/commercial-policy.ts`
- Create: `src/modules/orders/deadline-policy.ts`
- Create: `src/modules/orders/application/assemble-commercial-snapshot.ts`
- Create: `src/modules/orders/order-repository.ts`
- Create: `src/platform/database/migrations/003_orders.ts`
- Create: `tests/unit/modules/orders/order.test.ts`
- Create: `tests/unit/modules/orders/commercial-policy.test.ts`
- Create: `tests/unit/modules/orders/deadline-policy.test.ts`
- Create: `tests/integration/modules/orders/order-repository.test.ts`

**Interfaces**

```ts
export type OrderState =
  | "draft"
  | "ready"
  | "offered"
  | "claimed"
  | "active"
  | "delivery"
  | "completed"
  | "cancelled";

export type OrderId = Brand<string, "OrderId">;

export interface Money {
  readonly minorUnits: bigint;
  readonly currency: "EUR";
}

export function transitionOrder(
  order: Order,
  command: OrderTransition,
  clock: Clock,
): OrderTransitionResult;
```

- [ ] **Step 1: write the failing domain tests**

Cover all allowed transitions, rejected regressions, explicit reopen, catalogue changes after snapshot, rounding in minor units, editor and supervisor percentages, adjustment revisions, deadline calculation and revisions, and injected time.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/orders`.

Expected: failure because the aggregate, policies, and value objects do not exist.

- [ ] **Step 3: implement the aggregate and repository**

Keep policy calculations pure. Store immutable order revisions and lifecycle timestamps. Map Notion labels only in the Notion application service, not the aggregate.

- [ ] **Step 4: verify domain and persistence**

Run `pnpm exec vitest run tests/unit/modules/orders tests/integration/modules/orders && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/shared/kernel/money.ts src/shared/kernel/clock.ts src/modules/orders src/platform/database/migrations/003_orders.ts tests/unit/modules/orders tests/integration/modules/orders
git commit -m "feat: model the order lifecycle"
```

## Task 9: process operator commands and Notion projections

**Files**

- Create: `src/modules/operations/operation.ts`
- Create: `src/modules/operations/operation-repository.ts`
- Create: `src/modules/orders/application/process-notion-order.ts`
- Create: `src/integrations/notion/projection-writer.ts`
- Create: `src/platform/database/migrations/004_operations.ts`
- Create: `tests/integration/modules/orders/process-notion-order.test.ts`

**Interfaces**

```ts
export type OperationState = "requested" | "processing" | "succeeded" | "failed" | "cancelled";

export type OperationId = Brand<string, "OperationId">;

export interface NotionProjection {
  readonly pageId: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export type ProjectionResult =
  | { readonly written: true; readonly sourceVersion: string }
  | { readonly written: false; readonly reason: "stale-source" | "missing-page" };

export interface ProcessNotionOrder {
  execute(change: NotionChange, context: TransactionContext): Promise<OperationId>;
}

export interface ProjectionWriter {
  write(projection: NotionProjection, expectedSourceVersion: string): Promise<ProjectionResult>;
}
```

- [ ] **Step 1: write failing command tests**

Prove that one Notion source version creates one operation, state and outbox intent commit atomically, stale projections do not overwrite newer edits, failed commands produce human-readable operation state, and commands from an unconfigured Notion operator are rejected and audited.

- [ ] **Step 2: prove the tests fail**

Run `pnpm test:integration -- tests/integration/modules/orders/process-notion-order.test.ts`.

Expected: failure because command interpretation, operation persistence, and safe projections do not exist.

- [ ] **Step 3: implement command interpretation and projections**

Use explicit command identifiers, state transitions, audit records, and compare-before-write projection jobs. Do not expose pg-boss fields to Notion.

- [ ] **Step 4: verify the orders gate**

Run `pnpm test && pnpm test:integration -- tests/integration/modules/orders tests/integration/notion && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/operations src/modules/orders/application src/integrations/notion/projection-writer.ts src/platform/database/migrations/004_operations.ts tests/integration/modules/orders
git commit -m "feat: process operator commands"
```

## Task 10: deliver durable notifications

**Files**

- Create: `src/modules/notifications/notification.ts`
- Create: `src/modules/notifications/notification-repository.ts`
- Create: `src/modules/notifications/deliver-notification.ts`
- Create: `src/platform/database/migrations/005_notifications.ts`
- Create: `tests/unit/modules/notifications/notification.test.ts`
- Create: `tests/integration/modules/notifications/delivery.test.ts`

**Interfaces**

```ts
export interface NotificationIntent {
  readonly recipient: ExternalIdentityId;
  readonly purpose: NotificationPurpose;
  readonly contentVersion: string;
  readonly content: SafeMessage;
}

export type NotificationPurpose =
  | "offer"
  | "claim-result"
  | "deadline"
  | "document"
  | "storage"
  | "operation";

export interface SafeMessage {
  readonly text: string;
  readonly allowedUserIds: readonly string[];
}

export function notificationKey(intent: NotificationIntent): string;
```

- [ ] **Step 1: write failing notification tests**

Cover stable idempotency keys, explicit allowed mentions, content-length rejection, transient retry, permanent failure, and duplicate delivery attempts.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/notifications tests/integration/modules/notifications`.

Expected: failure because notification intent and durable delivery do not exist.

- [ ] **Step 3: implement intent and delivery**

Separate rendering, intent, provider delivery, and acknowledgement. Store recipient, purpose, content version, attempts, provider identity, and failure class.

- [ ] **Step 4: verify notification semantics**

Run `pnpm exec vitest run tests/unit/modules/notifications tests/integration/modules/notifications && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/notifications src/platform/database/migrations/005_notifications.ts tests/unit/modules/notifications tests/integration/modules/notifications
git commit -m "feat: deliver durable notifications"
```

## Task 11: connect Discord identities and events

**Files**

- Create: `src/integrations/discord/discord-port.ts`
- Create: `src/integrations/discord/discord-adapter.ts`
- Create: `src/integrations/discord/event-normalizer.ts`
- Create: `src/modules/people/person.ts`
- Create: `src/modules/people/identity-repository.ts`
- Create: `src/modules/people/application/process-notion-person.ts`
- Create: `src/platform/database/migrations/006_people.ts`
- Create: `tests/unit/integrations/discord/event-normalizer.test.ts`
- Create: `tests/unit/modules/people/eligibility.test.ts`
- Create: `tests/integration/modules/people/process-notion-person.test.ts`
- Create: `tests/contract/discord/discord-adapter.test.ts`

**Interfaces**

```ts
export interface DiscordMessageEvent {
  readonly eventId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly referencedMessageId?: string;
  readonly authorUserId: string;
  readonly authorIsBot: boolean;
  readonly receivedAt: Date;
}

export interface PublishDiscordMessage {
  readonly resourceKey: string;
  readonly channelId: string;
  readonly nonce: string;
  readonly message: SafeMessage;
}

export interface DiscordResource {
  readonly resourceKey: string;
  readonly channelId: string;
  readonly messageId: string;
}

export interface ObservedDiscordChannel {
  readonly channelId: string;
  readonly memberUserIds: readonly string[];
}

export interface SetMemberAccess {
  readonly channelId: string;
  readonly userId: string;
  readonly allowed: boolean;
}

export interface DiscordPort {
  publishMessage(command: PublishDiscordMessage, signal: AbortSignal): Promise<DiscordResource>;
  inspectChannel(channelId: string, signal: AbortSignal): Promise<ObservedDiscordChannel>;
  setMemberAccess(command: SetMemberAccess, signal: AbortSignal): Promise<void>;
}
```

- [ ] **Step 1: write failing identity and event tests**

Cover immutable identity lookup, changed usernames, active and inactive eligibility, missing Discord identity, Notion person-version deduplication, bot messages, replies, duplicate Gateway delivery, disconnected resume, and payload validation.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/integrations/discord tests/unit/modules/people tests/integration/modules/people tests/contract/discord`.

Expected: failure because identity processing, event normalization, and the Discord port do not exist.

- [ ] **Step 3: implement the adapter and durable event receipt**

The Gateway callback normalizes and inserts an inbox event before acknowledgement to application processing. It performs no cross-provider workflow inline.

- [ ] **Step 4: verify Discord boundaries**

Run `pnpm exec vitest run tests/unit/integrations/discord tests/unit/modules/people tests/integration/modules/people tests/contract/discord && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/integrations/discord src/modules/people src/platform/database/migrations/006_people.ts tests/unit/integrations/discord tests/unit/modules/people tests/integration/modules/people tests/contract/discord
git commit -m "feat: connect Discord identities and events"
```

## Task 12: publish idempotent Discord offers

**Files**

- Create: `src/modules/orders/offer.ts`
- Create: `src/modules/orders/application/publish-offer.ts`
- Create: `src/modules/notifications/templates/offer.ts`
- Create: `tests/unit/modules/orders/offer.test.ts`
- Create: `tests/integration/modules/orders/publish-offer.test.ts`

**Interfaces**

```ts
export interface PublishOffer {
  execute(orderId: OrderId, signal: AbortSignal): Promise<ExternalResourceId>;
}

export type ExternalResourceId = Brand<string, "ExternalResourceId">;

export interface OfferTemplateInput {
  readonly orderId: OrderId;
  readonly serviceName: string;
  readonly budget: Money;
  readonly deliveryAt: Date;
}

export function offerResourceKey(orderId: OrderId, version: number): string;
export function renderOffer(input: OfferTemplateInput): SafeMessage;
```

- [ ] **Step 1: write failing offer tests**

Prove approved Spanish copy, escaped mentions, maximum length, one active logical offer, retry after a successful provider call with a lost acknowledgement, and no offer for an ineligible order.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/orders/offer.test.ts tests/integration/modules/orders/publish-offer.test.ts`.

Expected: failure because offer policy, rendering, and provider reconciliation do not exist.

- [ ] **Step 3: implement offer intent, rendering, and reconciliation**

Persist the logical resource key before dispatch. For ambiguous failure, inspect Discord for the stored nonce or provider resource before publishing again.

- [ ] **Step 4: verify offer behavior**

Run `pnpm exec vitest run tests/unit/modules/orders/offer.test.ts tests/integration/modules/orders/publish-offer.test.ts && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/orders/offer.ts src/modules/orders/application/publish-offer.ts src/modules/notifications/templates/offer.ts tests/unit/modules/orders/offer.test.ts tests/integration/modules/orders/publish-offer.test.ts
git commit -m "feat: publish idempotent Discord offers"
```

## Task 13: assign the first eligible editor transactionally

**Files**

- Create: `src/modules/assignments/assignment.ts`
- Create: `src/modules/assignments/assignment-repository.ts`
- Create: `src/modules/assignments/application/process-claim.ts`
- Create: `src/modules/assignments/application/reassign-editor.ts`
- Create: `src/platform/database/migrations/007_assignments.ts`
- Create: `tests/unit/modules/assignments/claim.test.ts`
- Create: `tests/integration/modules/assignments/concurrent-claims.test.ts`
- Create: `tests/integration/modules/assignments/reassignment.test.ts`

**Interfaces**

```ts
export type ClaimOutcome =
  | { readonly accepted: true; readonly assignmentId: AssignmentId }
  | { readonly accepted: false; readonly reason: "ineligible" | "already-assigned" | "closed" };

export type AssignmentId = Brand<string, "AssignmentId">;

export interface ProcessClaim {
  execute(event: DiscordMessageEvent): Promise<ClaimOutcome>;
}
```

- [ ] **Step 1: write failing eligibility and concurrency tests**

Cover active registered editor, inactive editor, unknown identity, unrelated reply, bot reply, completed order, duplicated event, at least 20 simultaneous eligible claims producing exactly one active assignment, editor reassignment with a required reason, supervisor history, and rejection of an unauthenticated operator.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/assignments tests/integration/modules/assignments`.

Expected: failure because claim selection, assignment history, and reassignment do not exist.

- [ ] **Step 3: implement transactional winner selection**

Lock the offer or use the partial unique assignment constraint inside one transaction. Store every claim outcome. Accepted assignment, order transition, audit event, offer-close intent, deadline intent, and operator projection intent commit atomically. Reassignment ends the previous assignment, links its successor, records the authenticated actor and reason, and reconciles collaboration access without deleting history.

- [ ] **Step 4: verify the offers gate**

Run `pnpm exec vitest run tests/unit/modules/assignments tests/integration/modules/assignments && pnpm typecheck`.

Expected: one winner in every concurrency repetition and durable rejected outcomes.

- [ ] **Step 5: commit**

```bash
git add src/modules/assignments src/platform/database/migrations/007_assignments.ts tests/unit/modules/assignments tests/integration/modules/assignments
git commit -m "feat: assign the first eligible editor"
```

## Task 14: reconcile collaboration spaces

**Files**

- Create: `src/modules/collaboration-spaces/collaboration-space.ts`
- Create: `src/modules/collaboration-spaces/space-repository.ts`
- Create: `src/modules/collaboration-spaces/application/allocate-space.ts`
- Create: `src/modules/collaboration-spaces/application/reconcile-space.ts`
- Create: `src/platform/database/migrations/008_collaboration_spaces.ts`
- Create: `tests/integration/modules/collaboration-spaces/allocation.test.ts`
- Create: `tests/integration/modules/collaboration-spaces/reconciliation.test.ts`

**Interfaces**

```ts
export interface ExpectedMembership {
  readonly clientUserId: string;
  readonly editorUserId?: string;
  readonly staffRoleIds: readonly string[];
}

export interface MembershipChange {
  readonly userId: string;
  readonly access: "grant" | "revoke";
}

export interface ReconciliationFinding {
  readonly code: string;
  readonly summary: string;
  readonly resourceKey: string;
  readonly observedAt: Date;
}

export type ReconciliationDecision =
  | { readonly kind: "consistent" }
  | { readonly kind: "safe-repair"; readonly changes: readonly MembershipChange[] }
  | { readonly kind: "manual-resolution"; readonly findings: readonly ReconciliationFinding[] };
```

- [ ] **Step 1: write failing allocation and privacy tests**

Cover concurrent allocation of one pooled room, editor reassignment, username change, unexpected member, failed access removal, completion, and unknown provider state. Assert the database never assigns one active room to two orders.

- [ ] **Step 2: prove the tests fail**

Run `pnpm test:integration -- tests/integration/modules/collaboration-spaces`.

Expected: failure because transactional allocation and membership reconciliation do not exist.

- [ ] **Step 3: implement ownership and reconciliation**

Reserve ownership transactionally before provider calls. Derive expected members from immutable identities. Do not release local ownership until removal is observed; create a manual finding when observation is ambiguous.

- [ ] **Step 4: verify the collaboration gate**

Run `pnpm test:integration -- tests/integration/modules/collaboration-spaces && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/collaboration-spaces src/platform/database/migrations/008_collaboration_spaces.ts tests/integration/modules/collaboration-spaces
git commit -m "feat: reconcile collaboration spaces"
```

## Task 15: generate versioned invoices and agreements

**Files**

- Create: `src/modules/documents/document.ts`
- Create: `src/modules/documents/document-repository.ts`
- Create: `src/modules/documents/document-port.ts`
- Create: `src/modules/documents/application/generate-document.ts`
- Create: `src/integrations/documents/google-document-adapter.ts`
- Create: `src/platform/database/migrations/009_documents.ts`
- Create: `tests/unit/modules/documents/document.test.ts`
- Create: `tests/integration/modules/documents/generation.test.ts`
- Create: `tests/contract/documents/google-document-adapter.test.ts`

**Interfaces**

```ts
export interface DocumentRequest {
  readonly subjectId: EntityId;
  readonly type: "client-invoice" | "editor-invoice" | "client-agreement" | "editor-agreement";
  readonly logicalVersion: number;
  readonly templateVersion: string;
  readonly input: DocumentInputSnapshot;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };
export type DocumentInputSnapshot = Readonly<Record<string, JsonValue>>;

export interface GeneratedDocument {
  readonly logicalKey: string;
  readonly editableResourceId: string;
  readonly driveResourceId: string;
  readonly generatedAt: Date;
}

export interface DocumentPort {
  generate(request: DocumentRequest, signal: AbortSignal): Promise<GeneratedDocument>;
  findByLogicalKey(key: string, signal: AbortSignal): Promise<GeneratedDocument | null>;
}
```

- [ ] **Step 1: write failing generation and versioning tests**

Cover one logical document per version, explicit regeneration, client and editor input differences, missing identity data, provider timeout after creation, changed template version, and delivery tracked separately.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/documents tests/integration/modules/documents tests/contract/documents`.

Expected: failure because document versioning, generation state, and the provider adapter do not exist.

- [ ] **Step 3: implement document state and the initial Google adapter**

Store the complete validated input snapshot but redact it from logs. Reconcile ambiguous generation by logical key before retry. Record Drive and editable-document identities separately.

- [ ] **Step 4: verify document workflows**

Run `pnpm exec vitest run tests/unit/modules/documents tests/integration/modules/documents tests/contract/documents && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/documents src/integrations/documents src/platform/database/migrations/009_documents.ts tests/unit/modules/documents tests/integration/modules/documents tests/contract/documents
git commit -m "feat: generate versioned documents"
```

## Task 16: provision storage and transfer signed documents safely

**Files**

- Create: `src/modules/storage/storage-port.ts`
- Create: `src/modules/storage/path-policy.ts`
- Create: `src/modules/storage/application/provision-storage.ts`
- Create: `src/modules/storage/application/transfer-signed-document.ts`
- Create: `src/integrations/webdav/webdav-adapter.ts`
- Create: `src/platform/database/migrations/010_storage.ts`
- Create: `tests/unit/modules/storage/path-policy.test.ts`
- Create: `tests/integration/modules/storage/transfer.test.ts`
- Create: `tests/contract/webdav/webdav-adapter.test.ts`

**Interfaces**

```ts
export interface StorageObject {
  readonly path: string;
  readonly size: bigint;
  readonly checksum: string;
  readonly contentType: string;
}

export type SafeStoragePath = Brand<string, "SafeStoragePath">;

export interface TransferLimits {
  readonly maximumBytes: bigint;
  readonly allowedContentTypes: readonly string[];
}

export interface StoragePort {
  ensureDirectory(path: SafeStoragePath, signal: AbortSignal): Promise<void>;
  put(stream: ReadableStream<Uint8Array>, destination: SafeStoragePath, limits: TransferLimits, signal: AbortSignal): Promise<StorageObject>;
  inspect(path: SafeStoragePath, signal: AbortSignal): Promise<StorageObject | null>;
}
```

- [ ] **Step 1: write failing security and recovery tests**

Cover dot segments, separators, reserved names, Unicode normalization, control characters, unapproved hosts, unexpected media type, byte limit, interrupted streaming, checksum mismatch, duplicate retry, and confinement beneath each configured root.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/storage tests/integration/modules/storage tests/contract/webdav`.

Expected: failure because safe path construction, streaming transfer, and the WebDAV port do not exist.

- [ ] **Step 3: implement normalized path policy and streamed transfer**

Never concatenate unvalidated provider names into paths. Abort on byte limit, hash during streaming, verify the destination, then acknowledge the source through an outbox projection.

- [ ] **Step 4: verify the documents and storage gate**

Run `pnpm exec vitest run tests/unit/modules/storage tests/integration/modules/storage tests/contract/webdav && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/storage src/integrations/webdav src/platform/database/migrations/010_storage.ts tests/unit/modules/storage tests/integration/modules/storage tests/contract/webdav
git commit -m "feat: transfer signed documents safely"
```

## Task 17: calculate deterministic reporting and isolate peripheral jobs

**Files**

- Create: `src/modules/reporting/metric-definition.ts`
- Create: `src/modules/reporting/calculate-monthly-metrics.ts`
- Create: `src/modules/reporting/application/project-monthly-metrics.ts`
- Create: `src/modules/reporting/application/process-invoice-change.ts`
- Create: `src/integrations/youtube/youtube-port.ts`
- Create: `src/integrations/youtube/youtube-adapter.ts`
- Create: `src/modules/reporting/application/refresh-recent-content.ts`
- Create: `src/platform/database/migrations/011_reporting.ts`
- Create: `tests/unit/modules/reporting/monthly-metrics.test.ts`
- Create: `tests/integration/modules/reporting/projection.test.ts`
- Create: `tests/integration/modules/reporting/invoice-change.test.ts`

**Interfaces**

```ts
export interface MonthlyMetrics {
  readonly month: string;
  readonly revenue: Money;
  readonly completedOrders: number;
  readonly averageDeliveryMinutes: number | null;
}

export interface ReportingSnapshot {
  readonly orders: readonly ReportingOrder[];
  readonly invoices: readonly ReportingInvoice[];
  readonly timeZone: "Europe/Madrid";
}

export interface ReportingOrder {
  readonly orderId: OrderId;
  readonly workStartedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface ReportingInvoice {
  readonly invoiceId: EntityId;
  readonly amount: Money;
  readonly accountingDate: Date;
  readonly state: "issued" | "voided";
}

export function calculateMonthlyMetrics(input: ReportingSnapshot): readonly MonthlyMetrics[];
```

- [ ] **Step 1: write failing metric tests**

Cover payment-accounting dates, explicit work-start and completion timestamps, one canonical result per Notion invoice version, no completed orders, removed invoices, negative adjustments, month boundaries in Europe/Madrid, and recalculation to zero.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/unit/modules/reporting tests/integration/modules/reporting`.

Expected: failure because canonical invoice processing, metric calculation, and projection do not exist.

- [ ] **Step 3: implement deterministic calculation and isolated refresh queues**

Keep calculations pure. Project full monthly values, including zeros. Use separate job names and concurrency limits for reporting and YouTube so neither can delay order jobs.

- [ ] **Step 4: verify the reporting gate**

Run `pnpm exec vitest run tests/unit/modules/reporting tests/integration/modules/reporting && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/reporting src/integrations/youtube src/platform/database/migrations/011_reporting.ts tests/unit/modules/reporting tests/integration/modules/reporting
git commit -m "feat: calculate deterministic reporting"
```

## Task 18: expose operational recovery and reconciliation

**Files**

- Create: `src/modules/operations/application/retry-operation.ts`
- Create: `src/modules/operations/application/cancel-operation.ts`
- Create: `src/modules/operations/application/resolve-finding.ts`
- Create: `src/modules/operations/application/apply-retention.ts`
- Create: `src/modules/operations/retention-policy.ts`
- Create: `src/modules/operations/reconciliation-service.ts`
- Create: `src/integrations/notion/operations-projection.ts`
- Create: `tests/integration/modules/operations/recovery.test.ts`
- Create: `tests/integration/modules/operations/reconciliation.test.ts`
- Create: `tests/integration/modules/operations/retention.test.ts`

**Interfaces**

```ts
export interface RetryOperation {
  execute(operationId: OperationId, actor: Actor, reason: string): Promise<OperationId>;
}

export interface Actor {
  readonly identity: ExternalIdentityId;
  readonly displayName: string;
}

export type ReconciliationScope =
  | { readonly kind: "all" }
  | { readonly kind: "capability"; readonly capability: string }
  | { readonly kind: "resource"; readonly resourceKey: string };

export interface ReconciliationService {
  reconcile(scope: ReconciliationScope, signal: AbortSignal): Promise<readonly ReconciliationFinding[]>;
}
```

- [ ] **Step 1: write failing recovery tests**

Cover retry eligibility, cancellation before dispatch, cancellation after side effects, manual resolution with reason, safe repair, ambiguous drift, repeated reconciliation, operation projections that omit internal queue details, and authenticated dry-run and bounded retention by configured data class.

- [ ] **Step 2: prove the tests fail**

Run `pnpm test:integration -- tests/integration/modules/operations`.

Expected: failure because controlled recovery, reconciliation, and retention operations do not exist.

- [ ] **Step 3: implement audited recovery**

Retry creates a new operation linked to the failed operation. Cancellation and manual resolution append audit events. Reconciliation adapters report observations; domain policy decides safe repair versus manual resolution. Retention first produces an operator-visible candidate summary, then deletes eligible records in bounded batches through a separate authenticated and audited operation while preserving legally or operationally held records.

- [ ] **Step 4: verify operational acceptance**

Run `pnpm test:integration -- tests/integration/modules/operations && pnpm typecheck`.

- [ ] **Step 5: commit**

```bash
git add src/modules/operations src/integrations/notion/operations-projection.ts tests/integration/modules/operations
git commit -m "feat: expose operational recovery"
```

## Task 19: build immutable containers and continuous integration

**Files**

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `tests/smoke/container.test.ts`

**Interfaces**

The container accepts exactly one command: `app`, `worker`, `scheduler`, or `migrate`. It runs as a non-root user, contains production dependencies and compiled output only, exposes no secrets, and handles `SIGTERM` within the configured grace period.

- [ ] **Step 1: write the failing container smoke test**

Build the image, inspect the configured user, start the application against test PostgreSQL, verify liveness and readiness, send `SIGTERM`, and assert a clean bounded exit.

- [ ] **Step 2: prove the test fails**

Run `pnpm exec vitest run tests/smoke/container.test.ts`.

Expected: failure because no image exists.

- [ ] **Step 3: implement build and CI**

Use a multi-stage build with frozen pnpm dependencies. CI runs formatting verification, linting, type checking, unit tests, PostgreSQL integration tests, migration verification, dependency review, secret scanning, and the container build. Pin third-party actions by commit digest and declare least-privilege permissions.

- [ ] **Step 4: verify production readiness checks**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
docker compose build
pnpm exec vitest run tests/smoke/container.test.ts
```

Expected: all commands exit zero from a clean checkout.

- [ ] **Step 5: commit**

```bash
git add Dockerfile .dockerignore compose.yaml .github tests/smoke/container.test.ts
git commit -m "ci: build and verify immutable images"
```

## Task 20: rehearse migration and capability cutover

**Files**

- Create: `docs/runbooks/deployment.md`
- Create: `docs/runbooks/backup-restoration.md`
- Create: `docs/runbooks/capability-cutover.md`
- Create: `docs/runbooks/provider-reconciliation.md`
- Create: `.github/workflows/delivery.yml`
- Create: `src/modules/operations/capability-ownership.ts`
- Create: `tests/integration/modules/operations/capability-ownership.test.ts`
- Create: `tests/end-to-end/order-lifecycle.test.ts`
- Create: `tests/end-to-end/cutover-rollback.test.ts`
- Create: `tests/end-to-end/service-targets.test.ts`

**Interfaces**

```ts
export type CapabilityOwner = "legacy" | "replacement" | "disabled";

export type Capability =
  | "notion-orders"
  | "discord-offers"
  | "discord-claims"
  | "collaboration-spaces"
  | "documents"
  | "storage"
  | "reporting";

export interface TransferCapabilityOwnership {
  readonly capability: Capability;
  readonly from: CapabilityOwner;
  readonly to: CapabilityOwner;
  readonly reason: string;
}

export interface CapabilityOwnership {
  assertCanWrite(capability: Capability, owner: CapabilityOwner): Promise<void>;
  transfer(command: TransferCapabilityOwnership, actor: Actor): Promise<void>;
}
```

- [ ] **Step 1: write failing end-to-end and ownership tests**

Prove that two owners cannot write one capability, read-only shadowing creates no external effects, transfer is atomic and audited, and rollback restores legacy ownership. Under ten times the measured legacy peak, verify p95 claim processing within 5 seconds, Notion action visibility within 60 seconds, and document, storage, and reporting jobs within 5 minutes when providers operate normally.

- [ ] **Step 2: prove the tests fail**

Run `pnpm exec vitest run tests/integration/modules/operations/capability-ownership.test.ts tests/end-to-end`.

Expected: failure because write ownership enforcement and cutover orchestration do not exist.

- [ ] **Step 3: implement ownership enforcement and operational runbooks**

Every production write use case checks capability ownership before creating intent. Select the managed deployment platform using the approved requirements: an EU region, long-running application and worker processes, an independent scheduler, managed PostgreSQL with point-in-time recovery, a secret manager, immutable image promotion, private service networking, and observable rollback. Record the selected platform's exact deployment and verification commands in the runbook without introducing its SDK into domain or integration code. Add controlled image promotion with protected environments and explicit production approval. The runbooks specify prerequisites, exact verification queries, provider observations, rollback triggers, responsible actor, and evidence captured for each capability slice.

- [ ] **Step 4: execute the staging rehearsal**

Run all automated checks, restore a current sanitized backup into staging, migrate it, perform each capability transfer and rollback, reconcile provider state, and record evidence in the deployment system rather than committing environment output.

Expected: no dual writes, no unexplained drift, successful restoration, and successful rollback for every slice.

- [ ] **Step 5: commit**

```bash
git add docs/runbooks .github/workflows/delivery.yml src/modules/operations/capability-ownership.ts tests/integration/modules/operations/capability-ownership.test.ts tests/end-to-end
git commit -m "feat: enforce capability cutover"
```

## Final verification

Before promoting `rebuild`:

- [ ] Run `pnpm install --frozen-lockfile` from a clean checkout.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm test:integration` against ephemeral PostgreSQL.
- [ ] Run the full staging end-to-end suite.
- [ ] Build and scan the production image.
- [ ] Restore a backup and migrate it to the release schema.
- [ ] Reconcile Notion, Discord, documents, and storage.
- [ ] Demonstrate operator retry, cancellation, and manual resolution.
- [ ] Demonstrate one-writer transfer and rollback for every capability.
- [ ] Confirm the 5-second, 60-second, and 5-minute service targets.
- [ ] Confirm ten-times-legacy-peak capacity.
- [ ] Obtain operator and engineering cutover approval.
