PASS

# AW-010A S3 Scalar Storage-Type Specification Review — xhigh

**Verdict:** **PASS for the proposed correction.** It removes the remaining SQL-type ambiguity in parent §3 and is complete for the focused S3 scalar-storage surface. Parent §3 and the S3 type assertions must incorporate this exact freeze before implementation begins; this PASS does not approve the currently abbreviated `integer/smallint` or type-unspecified rows unchanged.

## Scope reviewed

- `docs/plans/aw-010a-channel-stream-foundation.md` §3
- `docs/plans/aw-010a-task-cards.md` S3/S4
- `docs/contracts/sync-contract-v1.md` durable envelope rules
- `docs/contracts/chat-projection-semantics-v1.md` seven-event union
- `packages/contracts/src/primitives.ts` and `packages/contracts/src/events.ts`
- existing AW-008 PostgreSQL ID, bigint, timestamp, and enum declarations
- the approved focused S3 check-constraint reviews

This is a focused pre-S3 specification review. No S3 implementation or test evidence is claimed.

## Required exact freeze

Amend the `channel_events` column contract to freeze these declarations exactly:

| Column | Exact PostgreSQL declaration | Required companion rule |
|---|---|---|
| `schema_version` | `integer NOT NULL` with **no default** | `channel_events_schema_version_check` with normalized predicate `schema_version = 1` |
| `event_type` | `text NOT NULL` | `channel_events_event_type_check` with normalized predicate `event_type IN ('message.created', 'message.edited', 'message.deleted', 'reaction.changed', 'channel.member_joined', 'channel.member_left', 'channel.member_revoked')` |
| `actor_kind` | `text NOT NULL` | `channel_events_actor_kind_check` with normalized predicate `actor_kind IN ('human', 'service', 'system')` |
| `payload` | `jsonb NOT NULL` | `channel_events_payload_object_check` with normalized predicate `jsonb_typeof(payload) = 'object'` |

Retain the already intended exact scalar declarations for the rest of S3:

- every ID column in both new tables—`tenant_id`, `channel_id`, `event_id`, and `actor_principal_id` as applicable—is `varchar(255)` and independently `NOT NULL`;
- `last_event_seq` and `event_seq` are PostgreSQL signed `bigint` and independently `NOT NULL`;
- `created_at` and `occurred_at` are `timestamptz(6)` and independently `NOT NULL`;
- `channel_event_sequences.last_event_seq` retains default `0`, both `created_at` columns retain default `now()`, and `channel_events.occurred_at` remains caller-supplied;
- no actor-kind or event-type PostgreSQL enum is introduced or reused.

S3's exact column/type assertion must distinguish `integer` from `smallint`, `text` from `varchar` or an enum, `jsonb` from `json`, and `timestamptz(6)` from a timestamp without time zone or a different precision. Its check assertion must continue to freeze names and normalized predicates, not merely check cardinality.

## Completeness and conflict assessment

- `integer` is sufficient for the sole stored schema version `1`; the named equality check closes the value domain. Removing the default is consistent with the parent application contract: the journal constructs and validates the complete server-owned envelope before insert rather than allowing storage to synthesize a missing protocol field.
- `text` plus the exact seven-literal named check matches the authoritative `DurableEventV1` union. It admits no unregistered v1 event while avoiding an additional PostgreSQL enum object and its migration coupling.
- `text` plus the exact three-literal named check reconstructs `ActorV1.kind`, including `system`. Reusing `principal_kind_v1` would conflict because that enum intentionally contains only `human | service`.
- `jsonb NOT NULL` is the necessary storage type for the already approved `jsonb_typeof(payload) = 'object'` predicate. The database check correctly freezes only the top-level object shape; strict event-type/payload correlation remains enforced by `DurableEventV1` before insert and after read.
- `varchar(255)` remains aligned with `OpaqueIdV1`'s maximum, `bigint` with `EventSeqV1`'s signed PostgreSQL range, and `timestamptz(6)` with the existing database timestamp convention and parent contract.
- The correction neither changes keys/check ownership nor adds a table, enum, payload-schema check, actor FK, default, or application behavior outside S3.

With this exact parent/card amendment, the S3 scalar storage-type specification is complete and non-conflicting.
