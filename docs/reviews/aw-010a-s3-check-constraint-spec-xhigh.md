PASS

# AW-010A S3 Missing Check-Constraint Specification Review — xhigh

**Verdict:** **PASS for the proposed correction.** The four proposed checks are necessary, correctly named, and complete for the focused S3 declaration gap. The current parent §3 must incorporate them, and S3 must test them, before implementation begins; this PASS does not approve the presently abbreviated four-constraint list unchanged.

## Scope reviewed

- `docs/plans/aw-010a-channel-stream-foundation.md` §3 (`channel_event_sequences` and `channel_events`)
- `docs/plans/aw-010a-task-cards.md` S3/S4
- `packages/contracts/src/events.ts`
- `packages/contracts/src/primitives.ts`
- existing AW-008 `channels` key/FK/nonempty declarations

This is a focused specification review. No S3 implementation or runtime evidence exists yet, and no test execution is claimed.

## Required pre-S3 freeze

Add these exact `channel_events` constraints in addition to the already frozen unique/event-sequence/schema-version/event-type constraints:

| Exact constraint name | Exact normalized predicate |
|---|---|
| `channel_events_event_id_nonempty_check` | `length(event_id) > 0` |
| `channel_events_actor_principal_id_nonempty_check` | `length(actor_principal_id) > 0` |
| `channel_events_actor_kind_check` | `actor_kind IN ('human', 'service', 'system')` |
| `channel_events_payload_object_check` | `jsonb_typeof(payload) = 'object'` |

The corresponding columns remain independently `NOT NULL`; PostgreSQL `CHECK` expressions alone do not reject SQL `NULL`. `event_id` and `actor_principal_id` remain `varchar(255)`, so the type enforces the `OpaqueIdV1` maximum while the new checks enforce its nonempty minimum. `payload` must be a non-null `jsonb` column for the frozen predicate.

Parent §3's exact `channel_events` constraint set must therefore contain:

1. `channel_events_pkey`;
2. `channel_events_tenant_channel_fk`;
3. `channel_events_event_id_key`;
4. `channel_events_event_seq_check`;
5. `channel_events_event_id_nonempty_check`;
6. `channel_events_schema_version_check`;
7. `channel_events_event_type_check` over the authoritative seven literals;
8. `channel_events_actor_principal_id_nonempty_check`;
9. `channel_events_actor_kind_check`; and
10. `channel_events_payload_object_check`.

S3's red/green contract must freeze both the names and normalized predicates of all checks, not names alone. Its existing **6 tests / 18 assertions** cardinality may remain exact by expanding the aggregate expected constraint metadata within those assertions. The same S3 surface must reject any new PostgreSQL enum declaration.

## Why these four checks are required

- `OpaqueIdV1` is `string().min(1).max(255)`, so unique/non-null `event_id` still needs the nonempty check, and the non-FK actor principal needs the same minimum enforcement.
- `ActorV1.kind` is exactly `human | service | system`; a non-null free scalar without the proposed check would admit unregistered kinds.
- `EventEnvelopeV1.payload` is a record/object. `jsonb NOT NULL` alone would still admit arrays, scalars, and JSON `null`; `jsonb_typeof(payload) = 'object'` closes only that top-level shape gap.
- The strict event-type-correlated payload schemas remain application invariants enforced by `DurableEventV1` before insert and after read. Reproducing those payload schemas in database checks is neither required nor approved here.

## No enum

Do not reuse `principal_kind_v1`: it intentionally contains only `human | service` and cannot represent canonical system actors. Do not introduce a new `actor_kind_v1` or event-type PostgreSQL enum either. A new enum would be an additional schema/migration object outside the frozen two-table S3 surface and would replace, rather than implement, the required named check. Keep the actor/event discriminants as scalar columns constrained by the exact checks.

## No other missing S3 declaration check

No further declaration check is required for the frozen envelope:

- `tenant_id` and `channel_id` are non-null and must satisfy the tenant-leading FK to `channels`; the referenced channel key already carries exact nonempty checks, so duplicate child checks add no invariant.
- signed `bigint` plus `channel_events_event_seq_check (event_seq > 0)` already matches `EventSeqV1`'s positive PostgreSQL-BIGINT range.
- `channel_events_schema_version_check` and the seven-literal `channel_events_event_type_check` already close their discriminator domains.
- `timestamptz(6) NOT NULL` covers stored occurrence-time validity; canonical RFC 3339 UTC serialization remains an application boundary concern.
- Human/service actor existence, tenant agreement, actor-kind agreement with `principals`, the system-actor allowlist, and strict correlated payload semantics remain explicitly assigned to the caller transaction and `DurableEventV1`; no blanket actor FK or extra payload checks should be added.
- `channel_event_sequences` already has its only required local check, `channel_event_sequences_last_event_seq_check (last_event_seq >= 0)`; its tenant/channel IDs are covered by the channel FK in the same way.

With this exact parent/card amendment, the focused S3 check-constraint specification is complete.
