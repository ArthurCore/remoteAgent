APPROVED

# AW-010A Membership Event-Type Guard Security Review — xhigh

**Exact blocker:** none.

## Scope

Focused review only of:

- `docs/plans/aw-010a-channel-stream-foundation.md` §3, especially lines 80–88;
- `docs/plans/aw-010a-task-cards.md` S4/S5;
- authoritative literals in `packages/contracts/src/events.ts`.

This is a design/task-card review of the newly exact typed membership reference. It does not reopen the previously approved broader AW-010A quality/security closure and does not claim implementation or test execution.

## Decision

The proposed two-layer database invariant is security- and correctness-sound for the stated scope:

1. ordinary tenant-leading foreign keys enforce referenced-event existence and exact tenant/channel/sequence identity; and
2. the `DEFERRABLE INITIALLY DEFERRED` row constraint trigger enforces the additional event-type predicate against the same fully qualified journal row at constraint-check time.

The append-only event guard makes the validated discriminator immutable after insertion. Together these close the prior hole in which any existing event sequence could satisfy a membership reference.

The authoritative exit literals are exactly:

- `channel.member_left`
- `channel.member_revoked`

`packages/contracts/src/events.ts` defines both as literal discriminants in `ChannelMemberLeftV1` and `ChannelMemberRevokedV1` and includes them in `DurableEventV1`. The revised plan correctly rejects the invented `channel.member_exited` spelling.

## Focused assessment

| Area | Result | Assessment |
|---|---|---|
| Tenant-leading FKs | PASS | `(tenant_id, channel_id, joined_event_seq)` and the nullable exited equivalent bind the epoch to the journal primary key in the same tenant and channel. A same-sequence event in another tenant or channel cannot satisfy either FK. |
| Joined type | PASS | At deferred check time, the joined reference must resolve to `channel.member_joined`; every other one of the seven existing event types is invalid. |
| Exited type | PASS | A non-null exited reference may resolve only to `channel.member_left` or `channel.member_revoked`. The union matches the authoritative contract. |
| Nullable exit | PASS | With ordinary `MATCH SIMPLE` FK behavior, a null `exited_event_seq` is permitted; the trigger must skip only that exited lookup while still validating the non-null joined reference. |
| Commit-time behavior | PASS | The constraint trigger is deferred by default, so the type predicate is checked at commit (or earlier if constraints are explicitly made immediate). Commit-time failure aborts the whole transaction. |
| Event immutability | PASS | `channel_events_append_only_guard` rejects update/delete, so a correctly typed referenced event cannot later be changed to another type or removed through ordinary DML. |
| Direct DML | PASS, scoped | Raw epoch insert/update cannot bypass the FKs or typed trigger. Raw journal insert remains possible under the acknowledged generic runtime grants, but it must still use an allowed event type and does not defeat this typed-reference invariant. The plan correctly does not overclaim protection against a compromised raw-SQL role. |
| Rollback | PASS | A deferred-trigger exception at commit rolls back event, epoch, and sequence-state changes in the transaction; S5 explicitly requires proof of that complete rollback. |
| Function rights and SQL | PASS | Invoker rights add no privilege elevation. Static, schema-qualified relation access avoids object-name substitution and dynamic-SQL injection. The invoking DML role must retain the required `SELECT` visibility on the journal for the check; AW-010A already requires runtime append/read behavior. |
| Error data | PASS, implementation gate | The plan expressly requires constant errors that emit no row identifiers, payload, or looked-up event data. PostgreSQL FK diagnostics may echo the caller-supplied key, but the custom trigger must not add stored-row data. S4 quality review must reject identifier-bearing `RAISE` formatting. |
| Migration locking | PASS with operational cost | `ACCESS EXCLUSIVE` locks on `channels` and then `channel_membership_epochs`, held by the one forward transaction across preflight, object creation, backfill, and postconditions, close the legacy channel/membership write window. The order is frozen and the second emptiness/state proof catches an incomplete cutover. The lock is intentionally availability-impacting; deployment must preserve migration-first ordering and allow enough lock/statement time. |

## Timing clarification that S4/S5 must preserve

The foreign keys are ordinary, not deferred. Therefore the referenced journal event must already exist when the membership insert/update statement finishes. The supported caller order is:

1. insert the joined/left/revoked journal event;
2. insert or update the membership epoch to reference it;
3. commit, when the deferred type check runs.

The deferred type trigger does **not** make epoch-first/event-later DML valid. S5's “deferred event+epoch order” is consistent only with the event-first order above; no test or implementation should claim order independence unless the FKs are separately redesigned and re-reviewed as deferred.

## S4/S5 adequacy

- S4 freezes the function, trigger, and both FK names, owns the only unpublished migration, preserves migration/hash history, and requires one-transaction lock/preflight/backfill/postcondition construction.
- S5 owns real-PostgreSQL evidence for correct joined/left/revoked acceptance; rejection of every other existing type; missing and wrong-tenant/channel references; nullable exit; event-first same-transaction behavior; concurrent cutover locking; and full rollback on commit failure.
- If S5 exposes an SQL defect, correction is constrained to the still-unpublished `0001` artifacts and requires S4 re-review. After merge, no migration history rewrite is allowed.

## Implementation review gates

Approval assumes the S4 implementation matches the frozen design exactly. Its reviewers must verify that:

- the trigger is `AFTER ... FOR EACH ROW`, `CONSTRAINT`, `DEFERRABLE INITIALLY DEFERRED`, and covers insert plus changes to all four reference-defining fields;
- both lookups compare tenant, channel, and sequence using static schema-qualified SQL;
- a non-null joined value and non-null journal `event_type` cannot fall through SQL three-valued logic (use an explicit found/type check or `IS DISTINCT FROM`-equivalent logic);
- the exited branch is skipped only when `NEW.exited_event_seq IS NULL`;
- exception message/detail/hint fields are constant and contain no row values;
- the function remains invoker-rights and does not acquire a `SECURITY DEFINER` or mutable-path privilege surface; and
- event update/delete rejection and the runtime role's lack of DDL/trigger-disable capability remain intact.

Within this focused scope, no security or correctness blocker remains.