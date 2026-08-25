# AW-008A0 Payload Contract Review — xhigh

## Scope, authority, and decision

- Reviewed only `docs/contracts/durable-event-payloads-v1.md` (A0) at baseline `fa0372f` plus its uncommitted addition; no implementation, DB, board, plan, or manifest behavior is reviewed.
- Authority order used: `S` = `docs/contracts/sync-contract-v1.md`; `P` = `docs/contracts/chat-projection-semantics-v1.md`; `A` = `docs/architecture/chat-core-adr.md` (`A:9-11`).
- **AW-008A0-R1: AMEND.** The strict-minimal principle is valid, but the present field set omits the stable mention-item identity needed for deterministic projection and acknowledgement. Runtime Zod work may not start unchanged.

## Severity-classified findings

| ID | Severity | Finding and exact authority |
|---|---|---|
| B-01 | **BLOCKER** | A0 freezes only principal-ID mention sets (`A0:15,45-48,54-56`). Yet authorized server/client projections must converge (`P:74-80`), each mention item has an opaque stable `mention_item_id` keyed by `(membership_epoch, viewer_principal_id, message_id)` (`P:397-417`), acknowledgement addresses that ID (`P:229-237,444`), and output exposes it (`P:772-781`). The create/edit transition invents/updates an item from only the event (`P:701-709`) but no authority defines an ID derivation. A replaying client therefore cannot produce the server ID or issue a portable acknowledgement. R1 omits projection-critical data.
| H-01 | **HIGH** | Join history is under-constrained. A0 says the epoch is new but expressly forbids only joining an “already-active epoch” (`A0:78-80`); that wording permits an already-active principal to join under a different fresh epoch. The authority requires one current active epoch, a new epoch on rejoin (`P:84-98,120`), and “no currently active viewer epoch” before join (`P:717-721`).
| M-01 | **MEDIUM** | Edited/deleted `version` is an unbounded “JSON integer” (`A0:21,55,63`) although the authoritative wire type is a JSON number (`P:172-181`) and the follow-on runtime is JavaScript/Zod (`S:124-149`). Beyond `9007199254740991`, JSON-number parsing cannot preserve exact consecutive integers, so “prior + 1” is not interoperably testable. Freeze a safe numeric range (or first change the higher authority to a decimal string).
| M-02 | **MEDIUM** | Validation ownership is not explicit enough for the runtime handoff. A0 acknowledges canonical history (`A0:124`) but later says consumers reject all violated invariants and Zod must reproduce the strict payloads (`A0:138-140`). Zod can reject shape/local refinements; it cannot prove target existence, prior version, epoch state, authorization, or purge delivery. The fixture table must identify its validation phase.
| — | **LOW** | None.

## Exact seven-event field-set matrix (current A0)

All fields below are required; each payload and `ActorV1 {principal_id,kind}` is strict (`A0:22-23,39-96`; `S:111-120,144-149`).

| `event_type` | Exact current payload field set |
|---|---|
| `message.created` | `message_id: OpaqueIdV1`; `thread_root_id: OpaqueIdV1 \| null`; `version: 1`; `resolved_mention_principal_ids: OpaqueIdV1[]` (distinct set) |
| `message.edited` | `message_id: OpaqueIdV1`; `version: JSON integer`; `resolved_mention_principal_ids: OpaqueIdV1[]` (distinct replacement set) |
| `message.deleted` | `message_id: OpaqueIdV1`; `version: JSON integer` |
| `reaction.changed` | `message_id: OpaqueIdV1`; `reactor_principal_id: OpaqueIdV1`; `reaction_key: string`; `present: boolean` |
| `channel.member_joined` | `principal_id: OpaqueIdV1`; `membership_epoch: OpaqueIdV1`; `history_mode: "full" \| "since_join"` |
| `channel.member_left` | `principal_id: OpaqueIdV1`; `membership_epoch: OpaqueIdV1`; `reason_code: non-empty string` |
| `channel.member_revoked` | `principal_id: OpaqueIdV1`; `membership_epoch: OpaqueIdV1`; `reason_code: non-empty string` |

## Parser-vs-stateful invariant assessment

| Owner | Invariants |
|---|---|
| **Zod / context-free parse** | Exact nine-field envelope, strict ActorV1, schema/type discriminants, opaque-ID bounds, UTC timestamp, positive canonical decimal `event_seq`, strict payload closure/requiredness/types, create version `1`, mention uniqueness, history enum, non-empty reason, and non-system actor/reactor equality (`S:105-122`; `A0:19-23,100-103,128-134`). |
| **Stateful semantic validator/reducer** | Message uniqueness; root existence/top-level/same channel; live target; exact prior-version transition; second distinct delete; authorized-system reaction exception and canonical tuple state; target tenant/channel; fresh/inactive membership and matching active exit epoch; repeated-event semantic identity (`P:47,62,467-478,696-728`; `A0:45-105`). |
| **Projection/delivery behavior, never Zod** | Author derives from actor, join baseline/history visibility/no mention backfill, leave-vs-revoke effects, ended epoch and unchanged `reason_code` in purge control, and post-exit delivery fence (`P:23-24,115-133,280-284,583-595`; `A0:103-105`). |

## Fixture audit

- **Positive count PASS:** `A0:113-119` contains exactly seven JSONL fragments, one for each and only each registry literal at `A0:31-37`.
- **Negative quality AMEND:** the seven candidates at `A0:128-134` are meaningful parser/local-refinement cases, but omit `channel.member_left`, discriminant/payload mismatch, mention-item mapping, and concrete stateful histories. The blanket prerequisite sentence at `A0:124` is not a state fixture and must not make these look like exhaustive Zod tests.

## Required corrections before runtime contracts

1. Add required `resolved_mention_items` to both create and edit: an order-insensitive array of strict `{principal_id: OpaqueIdV1, mention_item_id: OpaqueIdV1}` objects, unique by `principal_id`, whose principal set exactly equals `resolved_mention_principal_ids`; reuse the same ID for the logical key across remove/re-add. Keep the existing principal-ID field required by `P:165-176`. Any alternative deterministic derivation must first be normative, exact, and shared—not implementation-defined.
2. Replace `A0:79` with: the principal is inactive immediately before join; the epoch is fresh/never previously used for that principal/channel; it becomes the sole active epoch; rejoin after exit uses a different fresh epoch.
3. Freeze edit/delete `version` as a safe positive JSON integer (locally at least `2`, at most `9007199254740991`) while retaining the stateful exact-prior-plus-one rule, or revise the higher authority and wire type first.
4. Label every negative as `parse` or `stateful`; retain exactly seven positives; add canonical prerequisites/expected errors for missing/nested root, wrong prior version, second delete, inactive/live reaction target, active-principal rejoin, wrong exit epoch (including `member_left`), conflicting `event_id`, cross-envelope target, and mention mapping mismatch. State explicitly that production Zod owns only parse/context-free checks.

Verdict: REQUEST_CHANGES
