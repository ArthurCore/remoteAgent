# Durable event payload contracts v1 (AW-008A0)

- **Status:** Normative authority freeze; runtime contracts not yet implemented
- **Version:** 1 (`schema_version` wire value `1`)
- **Owner:** Chat Core contracts
- **Applies to:** the discriminant and strict `payload` object of each durable channel event listed here
- **Normative language:** `MUST`, `MUST NOT`, `SHOULD`, and `MAY` have their RFC 2119 meanings.

## 1. Authority, scope, and reviewer decision

For envelope fields and scalar rules, `docs/contracts/sync-contract-v1.md` controls. For event meaning, membership epochs, visibility, and projection effects, `docs/contracts/chat-projection-semantics-v1.md` controls. `docs/architecture/chat-core-adr.md` is next in the hierarchy. Within those constraints, this document is the sole v1 authority for concrete durable-event discriminants and payload field sets.

This contract covers payload data and assigns validation ownership. It does not define reducers, commands, HTTP, WebSocket/Socket.IO wrappers, database/outbox storage, code-generation layout, or runtime implementation.

**Explicit reviewer decision AW-008A0-R1 — strict-minimal closure with mention identity:** projection §4.1 says omitted message body, attachment, and display fields may be additive, while the sync contract requires strict concrete payloads. V1 therefore includes only the fields enumerated below, including the stable mention-item identity required for deterministic projection and acknowledgement. Future fields require a reviewed contract revision; unspecified fields are not admitted now.

## 2. Shared wire scalars and object closure

- `OpaqueIdV1` means the sync contract's opaque, non-empty JSON string (maximum 255 characters). Its shape conveys no authorization or tenancy.
- `EventSeqV1` is a canonical positive base-10 JSON string in `1..9223372036854775807`: no sign, whitespace, decimal, exponent, or leading zero. It MUST NOT pass through JavaScript `Number`.
- `VersionAfterCreateV1` is a positive safe JSON integer represented as a JSON number in `2..9007199254740991`, not a string, and is also subject to the stateful prior-version transition.
- `ActorV1` is the strict object `{"principal_id": OpaqueIdV1, "kind": "human" | "service" | "system"}`. Both fields are required; no others are allowed. It is immutable and server-derived.
- `ResolvedMentionItemV1` is the strict object `{"principal_id": OpaqueIdV1, "mention_item_id": OpaqueIdV1}`. Both fields are required; no others are allowed.
- Every payload below is a JSON object. Every listed field is required. Unknown payload fields are forbidden; no payload defines an extension map. JSON `null` is allowed only where the exact wire type includes it.

## 3. Discriminant registry

The complete v1 durable-event union has exactly these entries:

| `event_type` literal | Payload contract |
|---|---|
| `message.created` | §4.1 `MessageCreatedPayloadV1` |
| `message.edited` | §4.2 `MessageEditedPayloadV1` |
| `message.deleted` | §4.3 `MessageDeletedPayloadV1` |
| `reaction.changed` | §4.4 `ReactionChangedPayloadV1` |
| `channel.member_joined` | §4.5 `MemberJoinedPayloadV1` |
| `channel.member_left` | §4.6 `MemberLeftPayloadV1` |
| `channel.member_revoked` | §4.7 `MemberRevokedPayloadV1` |

## 4. Strict payload objects

### 4.1 Event `message.created`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `message_id` | `OpaqueIdV1` | required | New message identity in the envelope channel; duplicate identity is invalid history. |
| `thread_root_id` | `OpaqueIdV1` or JSON `null` | required | `null` means top-level; otherwise identifies an existing top-level root in the same channel. Nested or missing roots are invalid. |
| `version` | JSON number literal `1` | required | Creation always starts at version 1. |
| `resolved_mention_principal_ids` | JSON array of `OpaqueIdV1` | required | Distinct server-resolved IDs; authoritative full set. Order has no meaning and rendered text MUST NOT be reparsed. |
| `resolved_mention_items` | JSON array of `ResolvedMentionItemV1` | required | Order-insensitive mapping; `principal_id` and `mention_item_id` are each unique, and its principal set exactly equals `resolved_mention_principal_ids`. |

### 4.2 Event `message.edited`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `message_id` | `OpaqueIdV1` | required | Identifies an existing live message in the envelope channel. |
| `version` | `VersionAfterCreateV1`: positive safe JSON integer `2..9007199254740991` | required | Exactly the target's prior version plus 1. |
| `resolved_mention_principal_ids` | JSON array of `OpaqueIdV1` | required | Distinct, authoritative replacement set; order has no meaning. |
| `resolved_mention_items` | JSON array of `ResolvedMentionItemV1` | required | Order-insensitive replacement mapping; both ID columns are unique, and its principal set exactly equals `resolved_mention_principal_ids`. |

For both message events, each `mention_item_id` is server-issued for the logical `(membership_epoch, viewer_principal_id, message_id)` and MUST be reused across edits and remove/re-add transitions within that epoch. Strict item shape, both within-array uniqueness rules, and exact same-event principal-set equality are context-free parser checks. Mapping identity across event history is a stateful check, not a Zod claim.

### 4.3 Event `message.deleted`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `message_id` | `OpaqueIdV1` | required | Identifies an existing live message in the envelope channel; a distinct second delete is invalid history. |
| `version` | `VersionAfterCreateV1`: positive safe JSON integer `2..9007199254740991` | required | Exactly the target's prior version plus 1. |

### 4.4 Event `reaction.changed`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `message_id` | `OpaqueIdV1` | required | Identifies an existing live target in the envelope channel. |
| `reactor_principal_id` | `OpaqueIdV1` | required | Equals `actor.principal_id` unless an authorized `system` actor performs the change. |
| `reaction_key` | JSON string | required | Identifies the reaction in the canonical `(message_id, reaction_key, reactor_principal_id)` tuple. |
| `present` | JSON boolean | required | Authoritative desired membership of that tuple; replay is idempotent. |

### 4.5 Event `channel.member_joined`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `principal_id` | `OpaqueIdV1` | required | Principal MUST be inactive immediately before join and has exactly one active epoch immediately after it. Rejoin is valid only after an exit. |
| `membership_epoch` | `OpaqueIdV1` | required | Fresh and never previously used for this principal/channel; becomes the sole active epoch. A rejoin MUST use a different fresh epoch. |
| `history_mode` | JSON string literal `"full"` or `"since_join"` | required | Controls pre-join visibility. Either mode establishes a no-unread baseline at this event's `event_seq` and never backfills mentions. |

### 4.6 Event `channel.member_left`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `principal_id` | `OpaqueIdV1` | required | Principal whose voluntary exit ends access in the envelope channel. |
| `membership_epoch` | `OpaqueIdV1` | required | Exactly the active epoch being ended. |
| `reason_code` | non-empty JSON string | required | Stable, non-sensitive machine code carried unchanged into the affected principal's purge control. |

### 4.7 Event `channel.member_revoked`

| Field | Exact wire type | Requiredness | Invariant |
|---|---|---|---|
| `principal_id` | `OpaqueIdV1` | required | Principal whose administrative removal ends access in the envelope channel. |
| `membership_epoch` | `OpaqueIdV1` | required | Exactly the active epoch being ended. |
| `reason_code` | non-empty JSON string | required | Stable, non-sensitive machine code carried unchanged into the affected principal's purge control. |

## 5. Validation and behavior ownership

- **Zod/context-free parse:** owns the exact nine-field envelope, strict `ActorV1`, discriminant/payload pairing, scalar types/ranges, payload closure/requiredness, create version `1`, mention item shape/uniqueness/same-event mapping equality, history enum, non-empty reason, and non-system actor/reactor equality. It MUST NOT claim to validate history.
- **Stateful semantic validator/reducer:** owns message/root existence, uniqueness, liveness, tenant/channel relation, exact prior version plus 1, mention mapping stability, authorized-system reaction exception, membership state/epoch transitions, second delete, and repeated-ID semantic identity.
- **Projection/delivery behavior (never Zod):** owns author derivation from actor, visibility, join baselines/history and no mention backfill, unread/mention/reaction effects, exit purge control with unchanged epoch/reason, and the post-exit public-event delivery fence.

## 6. Envelope and cross-field invariants

1. Every event uses exactly `schema_version,event_id,tenant_id,channel_id,event_seq,event_type,actor,occurred_at,payload`; all nine are required and unknown top-level fields are rejected. Documentation order is canonical, but JSON member order has no meaning.
2. `schema_version` is the JSON number `1`; `occurred_at` is RFC 3339 UTC ending in `Z`; envelope IDs are `OpaqueIdV1`; `event_seq` is `EventSeqV1` and orders only within `(tenant_id, channel_id)`.
3. `event_type` MUST be one registry literal and select its corresponding strict payload. Unknown v1 types and discriminant/payload mismatches are protocol incompatibilities.
4. Payload message/member targets belong to the envelope tenant/channel. `message.created` derives immutable author from `actor.principal_id`; edit/delete actor authorization is a command concern, not a payload field.
5. A leave/revoke commit ends the named epoch. The affected principal MUST NOT receive that public channel event after access ends; it receives a principal-scoped purge control carrying the same epoch and `reason_code`. Remaining authorized members may receive the public event.
6. A repeated `event_id` MUST preserve the entire semantic envelope and payload. Mention arrays are order-insensitive; changing either principal set or principal-to-item mapping is semantic change. Conflicting reuse fails closed.
7. A cursor is not part of any payload or durable envelope. No payload field aliases, embeds, or makes `event_seq` opaque.

## 7. Canonical positive JSONL fixtures

Each line is one valid event-specific fragment; apply the seven lines in order with valid common envelope fields, distinct event IDs/sequences, an active mention-target epoch for `prn_202`, existing live `msg_202`, and active epoch `mep_707` for `prn_606`.

```json
{"event_type":"message.created","payload":{"message_id":"msg_101","thread_root_id":null,"version":1,"resolved_mention_principal_ids":["prn_202"],"resolved_mention_items":[{"principal_id":"prn_202","mention_item_id":"mit_202_101"}]}}
{"event_type":"message.edited","payload":{"message_id":"msg_101","version":2,"resolved_mention_principal_ids":["prn_202"],"resolved_mention_items":[{"principal_id":"prn_202","mention_item_id":"mit_202_101"}]}}
{"event_type":"message.deleted","payload":{"message_id":"msg_101","version":3}}
{"event_type":"reaction.changed","payload":{"message_id":"msg_202","reactor_principal_id":"prn_303","reaction_key":"thumbs_up","present":true}}
{"event_type":"channel.member_joined","payload":{"principal_id":"prn_404","membership_epoch":"mep_505","history_mode":"since_join"}}
{"event_type":"channel.member_left","payload":{"principal_id":"prn_404","membership_epoch":"mep_505","reason_code":"left"}}
{"event_type":"channel.member_revoked","payload":{"principal_id":"prn_606","membership_epoch":"mep_707","reason_code":"policy_revoked"}}
```

## 8. Canonical negative fixtures by validation phase

Each candidate has otherwise-valid omitted common envelope and payload fields unless the row names the defect. “Prior” is canonical state immediately before the candidate; every row MUST be rejected by its named phase and is not an exhaustive test suite.

| Phase | Candidate and canonical prior state | Expected rejection |
|---|---|---|
| parse | `message.created` with `version:2` and otherwise exact fields | Creation version is not literal `1`. |
| parse | `message.edited` with `version:9007199254740992` and matching mention arrays | Version exceeds the safe JSON-integer maximum. |
| parse | `message.edited` with duplicate `resolved_mention_principal_ids` | Mention principal IDs are not unique. |
| parse | Mention principals `["prn_1"]`, but items map `prn_2` to `mit_2` | Same-event mention principal sets do not match. |
| parse | Two mention items use `mention_item_id:"mit_1"` | Mention item IDs are not unique. |
| parse | `event_type:"message.edited"` with the exact `message.deleted` payload | Discriminant and strict payload mismatch. |
| parse | `message.deleted` payload includes `extra:true` | Unknown payload field. |
| parse | Human actor `prn_1` emits a reaction for reactor `prn_2` | Non-system actor/reactor mismatch. |
| parse | Joined payload uses `history_mode:"recent"` | Unknown `history_mode`. |
| parse | Revoked payload omits `reason_code` | Missing required field. |
| parse | `event_seq:"01"` | Non-canonical `event_seq`. |
| stateful | Create `msg_reply` with `thread_root_id:"msg_missing"`; no such message exists | Referenced root is missing. |
| stateful | Create `msg_reply_2` rooted at existing reply `msg_reply_1` | Referenced root is nested, not top-level. |
| stateful | Live `msg_1` has version 4; edit supplies version 6 | Version is not exactly prior plus 1. |
| stateful | `msg_1` was deleted by another event; a distinct event deletes it again | Second distinct delete targets a non-live message. |
| stateful | Reaction targets existing deleted `msg_1` | Reaction target is not live. |
| stateful | `prn_1` is active in `mep_1`; join attempts fresh `mep_2` | Principal is active immediately before join. |
| stateful | `prn_1` is active in `mep_1`; `channel.member_left` supplies `mep_2` | Exit epoch is not the active epoch. |
| stateful | Prior event `evt_1` had `present:true`; reuse `evt_1` with `present:false` | Conflicting semantic envelope for one `event_id`. |
| stateful | Envelope is channel `chn_A`; target message exists only in `chn_B` | Payload target is outside the envelope channel. |
| stateful | Prior mapping for the same epoch/principal/message is `mit_1`; edit supplies `mit_2` | Stable mention-item identity changed across history. |

## 9. Compatibility, exclusions, and ownership handoff

V1 consumers MUST reject unknown event types, payload fields, missing fields, wrong JSON types, and violations owned by their phase; they MUST NOT ignore or coerce them. No aliases are accepted. Adding a strict payload field is wire-incompatible for older consumers and requires a reviewed compatibility window or new schema version. Breaking meaning, type, requiredness, or invariant requires a new schema version and migration policy.

This freeze excludes message bodies/formatting, attachment/display data, retention, snapshots/cursors, command/API and transport shapes, persistence/outbox, private principal records, and `access_revoked` shape. Runtime-contract work MUST reproduce the registry and context-free strict payload parsing in Zod without widening it; the stateful validator/reducer and projection/delivery layers MUST separately enforce the history and behavioral ownership in §5.
