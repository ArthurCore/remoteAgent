# AW-010A Channel Stream Foundation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Extract the minimum generic per-channel sequence and append-only event journal that AW-009 membership mutations require, without introducing messages, outbox, generic idempotency, projections, history APIs, or realtime behavior.

**Architecture:** The messaging module owns one channel-local sequence state and the canonical `channel_events` journal. Conversations and future messaging use the same application port inside their own PostgreSQL transaction. AW-009 remains forbidden from writing `channel_membership_epochs` until this prerequisite commits and is independently approved.

**Tech Stack:** TypeScript 5.9.3, Zod 4.4.3 contracts already shipped by AW-008, PostgreSQL 17.11, Drizzle ORM 0.45.2 / Kit 0.31.10, Vitest 4.1.11, Testcontainers 12.1.0.

---

## 1. Authority and ownership correction

- Authority order: `docs/contracts/sync-contract-v1.md` → `docs/contracts/chat-projection-semantics-v1.md` → `docs/contracts/durable-event-payloads-v1.md` → `docs/architecture/chat-core-adr.md` → this plan.
- AW-008's `0000_aw008_foundation.sql` and `meta/0000_snapshot.json` are immutable.
- `docs/plans/aw-008-contracts-db-foundation.md:143` prohibits product membership rows whose `joined_event_seq` is not the sequence of a committed `channel.member_joined` event.
- The previous board ordering (`AW-009 → AW-010`) is cyclic because AW-009 owns membership while AW-010 owned the stream. This card extracts only the shared stream prerequisite from AW-010.
- AW-009 product code and dependency installation do not begin until AW-010A is merged DONE. Docs/review may proceed, but this serial fence avoids shared chat-core/API/manifest races and prevents any membership/channel-creator auto-join write before the stream exists.

## 2. Exact scope

### In

1. One dedicated channel sequence-state table owned by messaging.
2. One canonical append-only `channel_events` table containing the strict nine-field public envelope.
3. One ORM-agnostic chat-core journal/allocator port.
4. One PostgreSQL adapter in the API composition layer that allocates and appends inside a caller-owned transaction without creating a `db → chat-core` dependency.
5. Unit, real-PostgreSQL, concurrency, rollback, tenant-boundary, role, and migration-integrity tests.
6. Forward-only migration and exact scaffold/checker expansion.

### Out

- messages, message versions, mentions, reactions, read state;
- outbox/relay/NOTIFY and WebSocket delivery;
- generic command/idempotency receipts;
- projection/read models and history/delta endpoints;
- membership routes or membership-row writes;
- Agent, Shared Mind, product Kanban, Orchestrator, Redis, broker, or microservice extraction.

## 3. Frozen schema contract

### `channel_event_sequences`

| Column | Contract |
|---|---|
| `tenant_id` | `varchar(255)`, non-null |
| `channel_id` | `varchar(255)`, non-null |
| `last_event_seq` | signed `bigint`, non-null, default `0`, check `>= 0` |
| `created_at` | `timestamptz(6)`, non-null, default `now()` |

- Primary key `channel_event_sequences_pkey`: `(tenant_id, channel_id)`.
- Tenant-leading `channel_event_sequences_tenant_channel_fk` (`ON DELETE RESTRICT`) to `channels(tenant_id, channel_id)`.
- Check name: `channel_event_sequences_last_event_seq_check`.
- Exact function `initialize_channel_event_sequence()` and `AFTER INSERT` trigger `channels_initialize_event_sequence` create exactly one state row in the channel transaction. The migration backfills `last_event_seq = 0` for existing channels only after proving `channel_membership_epochs` is empty; if a pre-stream membership row exists, migration fails rather than laundering its synthetic marker. `0` means no event has committed.
- Allocation locks the exact tenant-leading state row `FOR UPDATE`, distinguishes missing state from exhaustion, requires `last_event_seq < 9223372036854775807`, then performs one guarded `last_event_seq = last_event_seq + 1` update and returns PostgreSQL `bigint` as a string/`bigint`, never `Number`. Zero-row status maps to `CHANNEL_STREAM_STATE_MISSING` or `CHANNEL_STREAM_EXHAUSTED`, not a generic retry.
- PostgreSQL `MAX(event_seq)+1`, standalone sequences, allocation outside the caller transaction, or JavaScript `Number` conversion are forbidden.

### `channel_events`

| Column | Contract |
|---|---|
| `tenant_id`, `channel_id` | `varchar(255)`, non-null opaque IDs |
| `event_seq` | signed `bigint`, non-null, check `> 0` |
| `event_id` | `varchar(255)`, non-null, nonempty, globally unique |
| `schema_version` | `integer`, non-null, no default; server-supplied literal `1` |
| `event_type` | `text`, non-null; exact seven-event v1 discriminant; no unregistered value |
| `actor_principal_id` | `varchar(255)`, non-null opaque ID from the canonical actor envelope |
| `actor_kind` | `text`, non-null; exact `human | service | system`; do not reuse DB `principal_kind_v1`, which intentionally excludes system |
| `occurred_at` | `timestamptz(6)`, non-null |
| `payload` | `jsonb`, non-null JSON object; strict payload semantics remain enforced by `DurableEventV1` before insert and after read |
| `created_at` | `timestamptz(6)`, non-null, default `now()` |

- Primary key `channel_events_pkey`: `(tenant_id, channel_id, event_seq)`.
- Tenant-leading `channel_events_tenant_channel_fk` (`ON DELETE RESTRICT`) to `channels`.
- Exact constraints: `channel_events_event_id_key`; `channel_events_event_seq_check` (`event_seq > 0`); `channel_events_event_id_nonempty_check` (`length(event_id) > 0`); `channel_events_schema_version_check` (`schema_version = 1`); `channel_events_event_type_check` over the frozen seven literals; `channel_events_actor_principal_id_nonempty_check` (`length(actor_principal_id) > 0`); `channel_events_actor_kind_check` (`actor_kind IN ('human', 'service', 'system')`); and `channel_events_payload_object_check` (`jsonb_typeof(payload) = 'object'`). Every corresponding column remains independently `NOT NULL`. Do not introduce actor-kind or event-type PostgreSQL enums; `principal_kind_v1` intentionally cannot represent system actors.
- Rows are append-only: exact function `reject_channel_event_mutation()` and `BEFORE UPDATE OR DELETE` trigger `channel_events_append_only_guard` reject mutation regardless of application role, while the adapter exposes only append/read behavior. Do not claim that the current generic runtime table grants prevent every direct sequence-state write; stronger routine/group-role privilege separation requires a separate reviewed role design.
- `actor_principal_id` is not a blanket FK because canonical system actors are not rows in the human/service `principals` table. Human/service existence and tenant agreement are application invariants covered by the caller transaction.

### Membership reference and migration/cutover fence

- Add tenant-leading FKs `channel_membership_epochs_joined_event_fk` and `channel_membership_epochs_exited_event_fk` from `(tenant_id, channel_id, joined_event_seq)` and nullable `(tenant_id, channel_id, exited_event_seq)` to the channel-event primary key.
- Existence is insufficient: exact function `enforce_channel_membership_event_types()` and `DEFERRABLE INITIALLY DEFERRED` constraint trigger `channel_membership_epochs_event_type_guard` run on insert or changes to tenant/channel/joined/exited sequence. At commit they require the joined reference to resolve in the same tenant/channel to `channel.member_joined`, and every non-null exited reference to resolve to one of the two authoritative exit discriminants, `channel.member_left` or `channel.member_revoked`. There is no invented `channel.member_exited` literal. The function uses static fully qualified SQL, runs with invoker rights, and emits no row data in errors. Since journal event type is immutable, a valid typed reference cannot later change type.
- The forward migration is one transaction. It acquires `ACCESS EXCLUSIVE` locks in a frozen order on `channels` then `channel_membership_epochs`, proves membership count zero, creates stream objects/triggers/FKs, backfills all channel state rows, and proves before commit that membership remains empty and every channel has exactly one state row.
- Concurrent direct channel/membership DML tests must show that the migration lock excludes the old write window and that post-migration channel inserts receive state automatically while synthetic membership inserts fail the event FK.
- Typed-reference integration tests cover correct joined/left/revoked acceptance, rejection of every other existing event type, missing-event rejection, nullable exit acceptance, wrong tenant/channel rejection, and complete rollback of event/epoch/sequence on commit-time failure. The supported transaction order is event insert first, membership insert/update second, then commit-time type check; epoch-first ordering fails the ordinary immediate FK and is an explicit negative test.
- Deployment order is migration first, then AW-010A-capable application. The pre-AW-010A application exposes only health and no channel/membership writer, which is verified by route inventory. Rolling back application code after migration is data-safe because the old application ignores the additive objects; no down migration or history rewrite is allowed.
- Direct runtime grants currently still permit raw sequence-state update/delete and direct journal insert attempts. The update/delete journal trigger, membership event FKs, constraints, and application ports narrow the risk but are not described as complete protection against a compromised raw-SQL runtime role. Any non-login group role or `SECURITY DEFINER` routine design is a separate reviewed card with fixed `search_path`, fully qualified objects, revoked `PUBLIC` execute, constrained grants, and adversarial tests.

## 4. Application port

Create under `packages/chat-core/src/modules/messaging/`:

```ts
type TrustedChannelActor =
  | Readonly<{ kind: "human" | "service"; principalId: string }>
  | Readonly<{ kind: "system"; principalId: "system:channel-lifecycle" }>;

type DurableEvent = z.infer<typeof DurableEventV1>;
type ChannelEventIntent = {
  [T in DurableEvent["event_type"]]: Readonly<{
    eventType: T;
    payload: Extract<DurableEvent, { event_type: T }>["payload"];
  }>;
}[DurableEvent["event_type"]];

export interface ChannelEventTransaction {
  append(input: Readonly<{
    tenantId: string;
    channelId: string;
    actor: TrustedChannelActor;
    intent: ChannelEventIntent;
  }>): Promise<Readonly<{ eventSeq: bigint; eventId: string; occurredAt: string }>>;
}
```

The final discriminated intent must preserve event-type/payload correlation rather than the broad indexed sketch above. Client input can never supply `schema_version`, `tenant_id`, `channel_id`, `event_seq`, `event_id`, `actor`, or `occurred_at`. The command-owning trusted context supplies tenant/channel/actor/intent; the journal service injects schema `1`, ID generator, clock, and allocated sequence. Human/service actors are checked against the same tenant's principal row and exact kind inside the caller transaction. System actor IDs are an allowlist; AW-009 joins may use only the active human session actor. Adding another system ID requires contract and plan review.

The adapter:

1. receives a caller-owned PostgreSQL transaction client;
2. validates the trusted actor and intent, allocates, constructs the full server-owned envelope, and validates exact `DurableEventV1` before insert;
3. locks/increments the matching sequence-state row;
4. inserts exactly one journal row;
5. returns without committing;
6. leaves commit/rollback to the command-owning use case.

No controller may call the DB adapter directly. No port method may begin or commit an independent transaction.

## 5. Test invariants

- same-channel concurrent allocation produces unique, strictly increasing sequences;
- different channels allocate independently and make no global-order claim;
- rollback after allocation and rollback after insert leave no event and no counter advance;
- every stored event round-trips through `DurableEventV1`, preserving decimal-string wire sequence without precision loss;
- event identity and `(tenant, channel, sequence)` uniqueness are enforced;
- missing/wrong-tenant channel and sequence-state probes fail with zero cross-tenant write;
- runtime behavior through the adapter can allocate/append/select; direct journal update/delete fails by trigger; runtime still cannot DDL or mutate the migration ledger;
- arbitrary system IDs, client-owned envelope overrides, actor-kind/DB-principal mismatch, cross-tenant human/service actors, and mismatched event-type/payload pairs fail before insert;
- `MAX-1`, `MAX`, exhausted, missing-state, unique/validation/insert failure, and concurrent boundary contenders preserve the exact state/event rollback invariant;
- migration tests race direct channel and membership DML, verify lock exclusion/postconditions, and cover application rollback compatibility;
- exact absence of message/outbox/idempotency/projection tables;
- `0000_aw008_foundation.sql` and its hash never change;
- first/second/concurrent/failing/hash-drift migration guarantees remain green with the new ordered migration;
- all cleanup/evidence/no-credential invariants from AW-008 remain active.

## 6. Development Kanban

The path-exact red/green commands and exclusive commit sets in `docs/plans/aw-010a-task-cards.md` are authoritative. The headings below are phase summaries only and do not authorize a worker to improvise a larger card.

### AW-010A0 — Plan exactness and preflight

**Files:** this plan, `docs/execution-board.md`.

1. Independent specification review must freeze exact names, DDL, transaction ownership, and exclusions.
2. Independent quality/security review must assess actor representation, overflow, append-only enforcement, privilege changes, and migration compatibility.
3. No implementation begins until both approve.

### AW-010A1 — Chat-core port, TDD

**Files:**
- Create: `packages/chat-core/src/modules/messaging/channel-event-journal.ts`
- Create: `packages/chat-core/test/channel-event-journal.spec.ts`
- Modify: `packages/chat-core/src/index.ts`, package manifest/config as required.

1. Write failing compile/runtime tests for bigint-safe port boundaries and caller-owned transaction behavior.
2. Run focused test and prove red.
3. Implement the minimum port/types; no DB import.
4. Run focused unit/lint/typecheck and prove green.
5. Run spec review, then quality/security review.
6. Commit only the reviewed paths.

### AW-010A2 — Current Drizzle schema and forward migration, TDD

**Files:**
- Create: `packages/db/src/schema/channel-stream.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/test/schema.spec.ts`
- Create: `packages/db/drizzle/0001_aw010a_channel_stream.sql`
- Create/update: matching Drizzle metadata, never `0000`.
- Modify: `packages/db/src/migration-integrity.ts`, migration tests.

1. Add exact failing schema tests before definitions.
2. Generate the migration with pinned Kit; inspect SQL manually.
3. Freeze new SQL/snapshot/journal hashes while retaining the `0000` hash oracle.
4. Prove first/second/concurrent/failing/hash-drift behavior and no history rewrite.
5. Run focused spec then quality/security reviews.
6. Commit the reviewed forward migration atomically with its metadata/tests.

### AW-010A3 — PostgreSQL adapter and adversarial integration

**Files:**
- Create: `apps/api/src/adapters/postgres/channel-event-journal.adapter.ts`
- Create: `apps/api/test/channel-event-journal.integration.spec.ts`
- Modify: `apps/api/package.json`, `apps/api/vitest.config.ts`, and only public DB exports/boundary rules explicitly approved by A0.

1. Write failing real-PostgreSQL allocation/rollback/concurrency tests.
2. Implement a caller-transaction adapter; never commit internally.
3. Exercise signed-BIGINT boundary, tenant negatives, journal mutation trigger, and caller-owned rollback.
4. Extend role tests and residue/evidence assertions.
5. Spec review first; quality/security review second.
6. Commit only after both approve.

### AW-010A4 — Exact workspace integration

**Files:**
- Modify: `scripts/assert-aw007-tree.mjs` (rename messages/contracts to the new current manifest without weakening exactness).
- Modify: root/package scripts and workflow only as required for real new tests.
- Modify: `.dependency-cruiser.cjs` with a failing fixture for forbidden domain/DB coupling.

1. Update exact file/table/script/dependency oracles.
2. Preserve frozen install, uncached CI, immutable actions, read-only workflow permission, fail-closed artifact upload.
3. Run canonical CI and real Testcontainers integration with cache zero/residue zero.
4. Independent final integration review.

### AW-010A5 — Evidence and merge gate

- Write retained hash/count/concurrency/rollback/role/cleanup evidence without credentials.
- Run Gitleaks final-candidate zero, Trivy config gate, diff check.
- Require an actual public PR workflow success at the final head.
- Only then mark AW-010A DONE and unblock AW-009 membership.

## 7. Exact verification commands

```bash
CI=true pnpm install --frozen-lockfile
pnpm --filter @agent-workspace/chat-core test:unit
pnpm --filter @agent-workspace/db test:unit
pnpm --filter @agent-workspace/db test:integration
pnpm --filter @agent-workspace/api test:integration
pnpm db:check
pnpm boundaries:check
pnpm scaffold:check
TURBO_FORCE=true pnpm run ci
git diff --check
```

The final hosted lane must use the same frozen versions and actual PostgreSQL digest. Retrying product assertions or weakening/removing tests is prohibited.

## 8. Completion rule

AW-010A is DONE only when the generic stream foundation is merged with independent PASS/APPROVED reviews and final-head hosted proof. It does not make AW-010 message/history work complete. AW-009 membership remains blocked until that point.
