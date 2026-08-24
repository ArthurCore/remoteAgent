# Chat event and projection semantics v1 (AW-006B)

- **Status:** Normative Chat Foundation contract
- **Version:** 1
- **Work item:** AW-006B
- **Applies to:** channel/DM durable events, per-principal unread/mention/thread projections, notification intents, and revocation cache control
- **Normative language:** `MUST`, `MUST NOT`, `SHOULD`, and `MAY` have their RFC 2119 meanings.

## 1. Authority, scope, and decisions

This document is the normative answer to finding C-02 in `docs/reviews/foundation-review-xhigh.md`. Where an earlier document describes a principal read-cursor update as a shared channel event, this contract controls: read state is durable **private principal state**, not a public channel event and not a read receipt.

Version 1 makes these decisions:

1. Only committed channel mutations in §4 enter the durable per-channel `event_seq` order. `event_seq` is a PostgreSQL `BIGINT` and a decimal string on public wires.
2. A principal's `channel_read_event_seq` covers only top-level timeline messages. A reply never creates ordinary channel unread.
3. A principal has a separate `thread_read_event_seq[root_message_id]` for each one-level thread. Its values are channel event sequences, but each value applies only to replies in that root's thread.
4. Explicit **mark unread** writes a separate, private, non-monotonic attention register. It never rolls either read cursor backward.
5. Channel and thread read values merge by numeric maximum across devices. The attention register does not merge by marker position; it is a server-revisioned compare-and-set register so it may intentionally move backward, forward, or to null.
6. Edits, deletes, reactions, and membership changes consume channel `event_seq` values but do not become ordinary unread merely because their sequence is newer than a read cursor.
7. Mention identity is stable per membership epoch, principal, and message. Removing and re-adding a mention increments its generation; only an absent-to-present transition creates a new mention notification intent.
8. Soft deletion retains a tombstone. Deleting a root does not delete its replies. `reply_count` counts only non-deleted replies; deleting a reply decrements it exactly once.
9. A membership join establishes a no-unread baseline at the join event. History may be `full` or `since_join`, but visible pre-join history is never retroactively unread and never backfills mentions.
10. Voluntary leave and administrative revoke both end access. The affected principal does not receive the public leave/revoke channel event after access ends; it receives a separate best-effort `access_revoked` cache-purge control over its principal-scoped connection.

This contract does not define message-content formatting, notification-provider transport, retention purge, search indexing, or the snapshot/live barrier. It does define the projection facts those systems consume.

## 2. Terms and scalar rules

### 2.1 Sequence types

```text
Seq             := unsigned integer in [0, 2^63-1]
SeqOnWire       := canonical base-10 string matching /^(0|[1-9][0-9]*)$/
PrivateRevision := unsigned 64-bit integer, also a decimal string on wire
```

All comparisons in this document are numeric. Lexicographic string comparison is forbidden.

- `event_seq`: position of one durable public mutation in one channel stream.
- `sync cursor`: opaque, channel-bound delta token. It may encode an `event_seq`, but a client MUST NOT construct or compare it.
- `last_applied_cursor`: private client replication checkpoint. It is not proof that a human read anything.
- `channel_read_event_seq`: private human-read boundary for top-level messages.
- `thread_read_event_seq[root_message_id]`: private human-read boundary for replies under one root.
- transport ACK: delivery acknowledgement only. It changes none of the projections in this document.

A channel event list is ordered by `(channel_id, event_seq)`. Gaps are legal; duplicate `event_seq` values for different events are invalid. Physical delivery may duplicate or reorder events. Consumers MUST deduplicate by `event_id`, recover an ordered stream, and then reduce it.

### 2.2 Message shape and one-level threads

Every message has immutable:

```text
message_id
channel_id
author_principal_id
created_event_seq
thread_root_id = null                    // top-level root
              | root message_id          // reply
```

If `thread_root_id` is non-null, it MUST identify an existing top-level root in the same channel. A reply cannot be a root for another reply. `created_event_seq` never changes after edit or delete.

Definitions used below:

- **root**: message with `thread_root_id = null`.
- **reply**: message with non-null `thread_root_id`.
- **live message**: not soft-deleted.
- **tombstone**: deleted message identity/order/thread context with ordinary content and attachment access removed.
- **resolved mention set**: distinct principal IDs authorized as mention targets at command commit. Duplicate tokens and direct-plus-group overlap still yield one target principal.

### 2.3 Principal projection unit

The reference reducer runs for one tuple:

```text
(tenant_id, channel_id, viewer_principal_id)
```

Server-side canonical message facts may include data the viewer cannot currently receive. `project(state)` MUST apply §3 visibility before returning any client output. A client reducer receives only authorized public events plus its own private records and must converge to the same authorized output.

## 3. Membership epochs and visibility

### 3.1 Current membership epoch

Each successful join creates an opaque `membership_epoch`. For viewer `P`, current access is:

```text
membership = {
  active: boolean,
  membership_epoch: string | null,
  joined_event_seq: Seq | null,
  exited_event_seq: Seq | null,
  history_mode: "full" | "since_join" | null
}
```

A private read/attention/mention record MUST carry the current `membership_epoch`. A stale device using an old epoch receives `409 STALE_MEMBERSHIP_EPOCH`; it cannot alter current state.

### 3.2 Message-object visibility

While membership is inactive, no channel object is visible. While it is active with join sequence `J`:

```text
root_visible(root) =
  history_mode == "full"
  OR root.created_event_seq > J

reply_visible(reply) = root_visible(root(reply))
  AND (history_mode == "full" OR reply.created_event_seq > J)
```

Because a valid since-join reply's visible root must itself be newer than `J`, both checks are stated explicitly for auditing and future migrations. A deleted but otherwise visible object remains visible only as a tombstone. Physically purged history is not visible.

Consequences:

- `full` exposes retained history that policy permits, including roots/replies before `J`, but the join baseline makes it read.
- `since_join` exposes only messages created after `J`. A new reply to a hidden pre-join root is also hidden; no parent existence, count, mention, or notification may leak.
- Joining never creates mention items for old text. A later edit that adds `P` creates a mention only if the target message is visible under the current epoch.
- Rejoining creates a new epoch. Old attention and mention state is ignored. Old cursors may be retained internally, but `J` is the minimum effective read boundary for the new epoch.

### 3.3 Event visibility

At read/fan-out time, authorization is rechecked. Event visibility is:

| Event family | Viewer may receive/read it only when |
|---|---|
| `message.*`, `reaction.changed` | membership is currently active and the target message is visible under §3.2 |
| `channel.member_*` about any principal | viewer membership is active after the event, event is in the viewer's current epoch (`event_seq >= J`), and roster policy permits the minimal member payload |
| principal-private records | authenticated viewer is exactly the owning principal and epoch matches; other members and ordinary admins cannot query them |
| `access_revoked` control | authenticated principal is the affected principal; it contains no message/member content |

Authorization overrides queued delivery. A gateway MUST tag channel queue entries with the authorized membership epoch and drop them after that epoch ends. The affected principal MUST NOT be sent `channel.member_left` or `channel.member_revoked` as an allegedly authorized channel event after the transaction has removed access.

## 4. Normative input contracts

### 4.1 Durable channel envelope

Every event in the durable channel order has this envelope:

```ts
type ChannelEvent = {
  schema_version: 1;
  event_id: string;
  tenant_id: string;
  channel_id: string;
  event_seq: string; // SeqOnWire
  event_type:
    | "message.created"
    | "message.edited"
    | "message.deleted"
    | "reaction.changed"
    | "channel.member_joined"
    | "channel.member_left"
    | "channel.member_revoked";
  actor: { principal_id: string; kind: "human" | "service" | "system" };
  occurred_at: string; // RFC 3339 UTC
  payload: object;
};
```

Payloads relevant to this reducer are:

```ts
type MessageCreated = {
  message_id: string;
  thread_root_id: string | null;
  version: 1;
  resolved_mention_principal_ids: string[]; // distinct, authoritative full set
};

type MessageEdited = {
  message_id: string;
  version: number; // exactly prior version + 1
  resolved_mention_principal_ids: string[]; // authoritative replacement set
};

type MessageDeleted = {
  message_id: string;
  version: number; // exactly prior version + 1
};

type ReactionChanged = {
  message_id: string;
  reactor_principal_id: string;
  reaction_key: string;
  present: boolean; // authoritative membership for this reactor/key tuple
};

type MemberJoined = {
  principal_id: string;
  membership_epoch: string;
  history_mode: "full" | "since_join";
};

type MemberExited = {
  principal_id: string;
  membership_epoch: string; // epoch being ended
  reason_code: string;       // non-sensitive, stable machine code
};
```

Message bodies, attachment metadata, and display data are omitted above but may be additive fields. Mention targets MUST be server-resolved IDs, not reparsed from rendered text by a projection consumer.

### 4.2 Private principal records

Private records are durable and replicate to the owning principal's devices, but they do **not** allocate a channel `event_seq`, do not enter `channel_events`, do not fan out to other members, and do not create read receipts.

```ts
type PrincipalRecord = {
  schema_version: 1;
  record_id: string;
  tenant_id: string;
  channel_id: string;
  principal_id: string;
  membership_epoch: string;
  private_revision: string; // monotonic per principal/channel, SeqOnWire form
  record_type:
    | "channel_read.advanced"
    | "thread_read.advanced"
    | "attention.set"
    | "attention.cleared"
    | "mention.acknowledged";
  occurred_at: string;
  payload: object;
};
```

Payloads are:

```ts
{ merged_channel_read_event_seq: string }                     // channel_read.advanced
{ root_message_id: string, merged_thread_read_event_seq: string } // thread_read.advanced
{ root_message_id: string }                                  // attention.set
{ expected_attention_revision: string }                      // attention.cleared
{ mention_item_id: string, acknowledged_generation: number } // mention.acknowledged
```

The stored values are authoritative merged results, not untrusted client candidates. Commands that produce them obey §9.

### 4.3 Non-durable principal control

```ts
type AccessRevokedControl = {
  control_type: "access_revoked";
  control_id: string;
  tenant_id: string;
  scope_type: "channel" | "workspace";
  scope_id: string;
  ended_membership_epoch: string;
  reason_code: string;
  action: "purge_cached_scope";
};
```

This control has no `event_seq`, no message content, and is not replay truth. It is a prompt to enforce already-committed authorization. Missing it never preserves access: the next HTTP, delta, socket-subscribe, search, or file authorization denial MUST cause the same purge.

## 5. Complete event/effect matrix

Symbols in the table:

- **D**: included in durable shared channel stream.
- **O**: can alter ordinary top-level unread.
- **M**: can alter mention inbox/count.
- **T**: can alter thread unread.
- **F**: can alter top-level or thread first-unread identity.
- **N**: notification intent behavior before preference/foreground/quiet-hour filtering in §10.

All `+`/`-` effects are conditional on viewer visibility, non-self rules, cursor predicates, and prior state in §§6–8. “Recompute” means select from live eligible identities; counts MUST never be adjusted below zero.

| Input/event form | D | Visibility | O | M | T | F | N | Normative reducer effect |
|---|:---:|---|---|---|---|---|---|---|
| `message.created` root | yes | active members for whom root is visible | may add one | activate generation 1 for each eligible target | none | recompute channel first | `mention` for targets, otherwise `activity` for other viewers | insert immutable root facts/version/mention set |
| `message.created` reply | yes | active members for whom reply/root is visible | none | activate generation 1 for each eligible target | may add one reply | recompute thread first only | `mention` for targets, otherwise `thread_activity` for other viewers | insert reply; derived root `reply_count` may increase one |
| `message.edited` root | yes | target-visible active members | none | apply 0→1/1→0 table in §7.2 | none | no ordinary change | only a 0→1 mention creates `mention` | replace mention set, increment version; created sequence unchanged |
| `message.edited` reply | yes | target-visible active members | none | apply §7.2 | none | no thread-unread change | only a 0→1 mention creates `mention` | replace mention set, increment version; reply identity/count unchanged |
| `message.deleted` root | yes | target-visible active members; tombstone remains | remove root if it was ordinary unread | deactivate target mention item | replies remain unchanged | recompute channel first | cancel undelivered intents for root | mark root deleted, clear its reactions/ordinary content; do not cascade to replies or change `reply_count` |
| `message.deleted` reply | yes | target-visible active members; reply tombstone remains | none | deactivate target mention item | remove reply if it was thread-unread | recompute that thread first | cancel undelivered intents for reply | mark reply deleted, clear its reactions; derived `reply_count` decreases exactly one |
| `reaction.changed` root or reply | yes | only viewers who can see target | none | none | none | none | none in v1 | set/remove `(message, reaction_key, reactor)` membership idempotently |
| `channel.member_joined` for viewer | yes | other post-commit members; viewer starts authorized but baseline consumes this position | output starts at zero | no history backfill | output starts at zero | null | none | start new epoch; set read baseline to at least join `event_seq`; old attention/mentions ignored |
| `channel.member_joined` for someone else | yes | current authorized roster viewers | none | none | none | none | none | optional roster projection only |
| `channel.member_left` for viewer | yes | other remaining members, not departed viewer | output becomes zero/inaccessible | output becomes zero/inaccessible | output becomes zero/inaccessible | null | cancel all undelivered channel intents | end epoch; emit `access_revoked(reason=left)` control; purge required |
| `channel.member_revoked` for viewer | yes | other remaining members, not revoked viewer | output becomes zero/inaccessible | output becomes zero/inaccessible | output becomes zero/inaccessible | null | cancel all undelivered channel intents | end epoch; fence delivery; emit `access_revoked` control; purge required |
| `channel.member_left`/`revoked` for someone else | yes | current authorized roster viewers | none | none | none | none | none | optional roster projection only |
| `channel_read.advanced` | **no; private durable** | owning principal/devices only | rederive against max cursor; marker range remains | top-level mentions at/below cursor cease to be unread | none | recompute channel first | cancel still-pending top-level intents now observed | set numeric maximum; never move backward |
| `thread_read.advanced` | **no; private durable** | owning principal/devices only | none | reply mentions at/below that thread cursor cease to be unread | rederive selected thread | recompute selected thread first | cancel still-pending reply intents now observed | set numeric maximum for one root |
| `attention.set` | **no; private durable** | owning principal/devices only | may add attention-range roots without changing cursor | none | none | recompute channel first using anchor | none | replace attention register at newer private revision |
| `attention.cleared` | **no; private durable** | owning principal/devices only | remove attention-only roots; natural unread remains | none | none | recompute channel first | none | clear only with current expected attention revision |
| `mention.acknowledged` | **no; private durable** | owning principal/devices only | none | remove one active generation from unread mention count | none | none | cancel matching pending mention intent | max-merge acknowledged generation |
| `access_revoked` | **no; non-durable control** | affected principal only | locally discard | locally discard | locally discard | null | none | stop subscription and purge all cached data in scope |
| typing/presence transport hint | no; ephemeral | currently authorized participants only | none | none | none | none | none | TTL UI state only; outside this reducer |

No event type omitted from the v1 union in §4.1 is permitted in a v1 reducer. Additive payload fields are allowed; a new event type requires a new compatible schema/reducer decision.

## 6. Ordinary unread, attention, first unread, and thread unread

Let viewer be `P`, current join baseline be `J`, and:

```text
C = max(stored channel_read_event_seq, J)
TR(root) = max(stored thread_read_event_seq[root] or 0, J)
A = current-epoch attention marker, or null
A.floor = created_event_seq of A.root_message_id
```

### 6.1 Top-level ordinary unread

For a visible root `r`:

```text
natural_unread(r) =
  r is live
  AND r.author_principal_id != P
  AND r.created_event_seq > C

attention_range_unread(r) =
  A != null
  AND r is live
  AND r.author_principal_id != P
  AND r.created_event_seq >= A.floor

ordinary_unread(r) = natural_unread(r) OR attention_range_unread(r)
ordinary_unread_count = count(distinct r where ordinary_unread(r))
```

The set union prevents double counting. Edits, deletes, reactions, replies, and membership events are never ordinary unread candidates.

An attention marker also has an anchor:

```text
attention_anchor = earliest visible live root (including a self-authored root)
                   with created_event_seq >= A.floor; else null
```

A self-authored message never automatically increments unread. If the user explicitly marks from a self-authored root, the attention anchor may make `has_unread` true while `ordinary_unread_count` remains zero; that is an explicit personal reminder, not self-message-generated unread.

```text
has_unread = ordinary_unread_count > 0 OR attention_anchor != null
first_unread = earliest by (created_event_seq, message_id) of:
  - all roots satisfying ordinary_unread(r), and
  - attention_anchor when non-null
```

`first_unread` is null iff `has_unread` is false. Its output includes source `cursor`, `attention`, or `both`. If an attention target is deleted, the anchor moves to the next visible live root at or after its immutable floor; if none exists, attention has no visible effect until a later root arrives or the marker is cleared.

### 6.2 Top-level truth table

`eligible` below means visible, live, top-level. `in_attention_range` means `A != null && created_event_seq >= A.floor`.

| eligible | authored by P | `created_event_seq > C` | in attention range | ordinary unread | may be attention anchor | automatic notification |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| no | any | any | any | no | no | no |
| yes | yes | no | no | no | no | no |
| yes | yes | yes | no | no | no | no |
| yes | yes | any | yes | no | **yes** (explicit marker only) | no |
| yes | no | no | no | no | no | no |
| yes | no | yes | no | yes | no | yes, subject to §10 |
| yes | no | no | yes | yes | yes if earliest | no new notification from marker |
| yes | no | yes | yes | yes once | yes if earliest | yes once from create |

### 6.3 Thread unread and reply count

For visible reply `q` under root `r`:

```text
thread_unread(q) =
  q is live
  AND q.author_principal_id != P
  AND q.created_event_seq > TR(r)

thread_unread_reply_count[r] = count(distinct q under r where thread_unread(q))
thread_first_unread_reply[r] = earliest such q by (created_event_seq, message_id), else null
reply_count[r] = count(distinct visible live replies under r)
latest_reply_id[r] = latest visible live reply by (created_event_seq, message_id), else null
threads_with_unread_count = count(r where thread_unread_reply_count[r] > 0)
total_thread_unread_reply_count = sum(thread_unread_reply_count[r])
```

A deleted root remains a thread root tombstone. Its live replies still contribute to `reply_count`, thread unread, latest reply, and reply mentions. Deleting the root does not alter those reply-derived values. A deleted reply contributes to none of them, though its tombstone remains ordered in authorized thread history.

### 6.4 Reply truth table

| visible reply | live | authored by P | `created_event_seq > TR(root)` | ordinary unread | thread unread | `reply_count` contribution |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| no | any | any | any | no | no | 0 |
| yes | no | any | any | no | no | 0 |
| yes | yes | yes | any | no | no | 1 |
| yes | yes | no | no | no | no | 1 |
| yes | yes | no | yes | no | yes | 1 |

Channel attention never changes thread unread. Version 1 has no thread mark-unread attention marker.

## 7. Mention semantics

### 7.1 Identity and unread predicate

For a current membership epoch, a mention item's logical unique key is:

```text
(membership_epoch, viewer_principal_id, message_id)
```

The persisted `mention_item_id` is opaque but stable for that key. It stores:

```ts
type MentionItem = {
  mention_item_id: string;
  membership_epoch: string;
  principal_id: string;
  message_id: string;
  context: "root" | "reply";
  root_message_id: string;
  active: boolean;
  generation: number;               // starts at 1, increments on each 0→1
  trigger_event_seq: Seq;           // create or latest 0→1 edit sequence
  acknowledged_generation: number; // starts at 0, max-merged
};
```

A mention is eligible only if, at its trigger event:

1. viewer membership is active;
2. the target message is visible in the current epoch;
3. the target is live;
4. viewer is in the authoritative resolved mention set; and
5. viewer is not the message author.

Mention unread is:

```text
context_cursor(item) = C for a root item
                     = TR(item.root_message_id) for a reply item

mention_unread(item) =
  item belongs to current epoch
  AND item.active
  AND target is visible and live
  AND item.acknowledged_generation < item.generation
  AND context_cursor(item) < item.trigger_event_seq

unread_mention_count = count(distinct item where mention_unread(item))
```

A specific `mention.acknowledged` record may mark only that generation read after its context is successfully shown, without advancing an unrelated timeline. Advancing the relevant context cursor past `trigger_event_seq` also makes it read. Mention inbox output is sorted by `(trigger_event_seq DESC, mention_item_id)` and contains one row per active item, not one per token or delivery.

### 7.2 Edit transition truth table

`old` and `new` are membership of viewer `P` in the authoritative resolved mention set before and after an edit. The table applies only when the viewer/message is eligible under §7.1; otherwise no current-epoch mention is activated.

| old | new | Item action | generation | trigger sequence | unread mention effect | notification effect |
|:---:|:---:|---|---|---|---|---|
| 0 | 0 | none | unchanged/absent | unchanged | none | none |
| 0 | 1 | activate or reactivate stable item | previous + 1 (or 1) | edit `event_seq` | becomes unread unless already covered by a later context cursor | upsert one `mention` intent for new generation |
| 1 | 1 | keep current item | unchanged | unchanged | unchanged | **none**; ordinary content edits do not re-notify |
| 1 | 0 | deactivate item | unchanged | unchanged | remove from count immediately | cancel undelivered mention intent for active generation |

Removing then re-adding a mention produces the same `mention_item_id` with a new generation and may produce a new notification. Replaying the same edit event cannot increment generation twice because `event_id` is deduplicated.

### 7.3 Delete and membership interaction

- Deleting a mentioned root/reply deactivates its mention item and removes it from unread count/inbox. An already displayed external notification cannot be retracted; opening it resolves to an authorized tombstone/safe unavailable state.
- Root deletion does not deactivate mentions on its replies.
- Leaving/revocation makes all current-epoch mention output inaccessible and cancels pending notification intents.
- Rejoin does not reactivate old items, even in `full` history. A later eligible 0→1 edit may create a current-epoch generation.
- Mentions of inactive/non-member principals MUST NOT create mention items or notification intents. Product rendering may leave unauthorized raw text as plain text.

## 8. Tombstones and deletion truth table

Soft deletion is idempotent at the command layer: one logical delete yields at most one `message.deleted` event. The event reducer rejects a second distinct delete event for an already deleted target as invalid history; a duplicate delivery with the same `event_id` is a no-op.

| Deleted target | Target tombstone retained | Ordinary unread | Target mention | Thread unread | Root `reply_count` | Replies under target/root | Reactions on target |
|---|:---:|---|---|---|---|---|---|
| live root | yes | remove root iff previously counted | deactivate | reply-derived values unchanged | unchanged | retained and accessible under root tombstone | cleared/hidden |
| live reply | yes | unchanged | deactivate | remove reply iff previously counted | decrement exactly 1 | sibling replies unchanged | cleared/hidden |
| already deleted, same event replay | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged |
| already deleted, distinct delete event | invalid event history | n/a | n/a | n/a | n/a | n/a | n/a |

`reply_count` is derived from distinct live replies rather than an unchecked increment/decrement counter. This makes duplicate delivery, rebuild, and deleting every reply converge to zero without a negative count.

## 9. Private read and attention command semantics

### 9.1 Join baselines

For a viewer join event at `J`, in the same transaction or an inseparable projection update:

```text
channel_read_event_seq := max(existing channel_read_event_seq, J)
effective TR(root)     := max(stored TR(root) or 0, J) for every root
```

No per-thread row must be materialized at join; `J` is a lazy floor. Counts immediately after join are zero for all messages at or before `J`, even with `history_mode = full`. Channel events after `J` are evaluated normally. Join never marks events after its transaction boundary read.

### 9.2 Channel and thread cursor updates

A cursor-advance command is authorized only for the active current epoch and a server-observed boundary no greater than the channel high watermark. The server atomically compares a candidate with stored state:

| candidate vs stored | command result | durable private record | final value |
|---|---|---|---|
| `<` | `409 READ_CURSOR_REGRESSION`; state unchanged | none | stored |
| `=` | idempotent success, `applied=false` | none | stored |
| `>` | success, `applied=true` | one record carrying merged value | candidate |

Concurrent device writes MUST be implemented as an atomic maximum (for example, `GREATEST` under a row lock/upsert). For any set of valid concurrent candidates, final state is their numeric maximum regardless of arrival order. This rule applies independently to `channel_read_event_seq` and each `thread_read_event_seq[root]`.

A channel cursor update affects roots and root mentions only. It MUST NOT mark replies or reply mentions read. A thread cursor update affects only replies and reply mentions under the named root. Reading a thread MUST NOT advance channel top-level state merely because both use channel event sequence values.

“Mark all read” captures a server boundary `H` and advances each explicitly scoped channel cursor to that channel's `H`. It does not include events committed after `H`, does not implicitly clear thread unread unless thread scope is explicitly included, and clears attention only through the compare-and-set rule below.

### 9.3 Non-monotonic attention register

Attention state is:

```ts
type AttentionState = {
  membership_epoch: string;
  attention_revision: PrivateRevision;
  root_message_id: string | null;
  floor_event_seq: Seq | null; // immutable created_event_seq of root
};
```

`attention.set(root)` requires a currently visible root (live at command time), assigns the next server private revision, and replaces the register even if the new floor is numerically lower than the old floor or both read cursors. It does not change any cursor.

`attention.cleared(expected_attention_revision)` succeeds only if the expected revision equals the current register revision. On success it writes a newer revision with null root/floor. A stale clear returns `409 ATTENTION_CHANGED` and cannot erase a marker set later by another device. Retrying the same idempotency key returns its stored result.

Attention records merge by greatest `attention_revision`, never by greatest/least `floor_event_seq`. Thus explicit mark-unread is non-monotonic while replication remains deterministic.

### 9.4 Multi-device merge table

| Private state | Merge rule | Can an older device roll it back? |
|---|---|---|
| channel read | numeric max | no |
| one thread read | numeric max per root | no |
| mention acknowledged generation | numeric max per mention item | no |
| attention marker | highest server `attention_revision`; clear is CAS | only a newly committed intentional set may move its floor backward |
| membership epoch | server-authoritative replacement on join/exit | no client merge |
| client `last_applied_cursor` | highest contiguous authorized application checkpoint, separately from human read | cannot change server read state |

Counts are never merged between devices. They are rederived from canonical events plus merged private state.

## 10. Notification intent semantics

Notifications are hints, not unread truth. The reference reducer emits idempotent **intents**; a delivery worker reauthorizes and evaluates current preferences immediately before provider delivery.

### 10.1 Intent keys and precedence

```text
activity key = (membership_epoch, principal_id, message_id, "created")
mention key  = (membership_epoch, principal_id, message_id, mention_generation)
```

For one principal and trigger event:

1. self-authored messages emit no intent;
2. an eligible direct/resolved mention emits one `mention` intent and suppresses the same event's `activity`/`thread_activity` intent;
3. an unmentioned root create may emit `activity`;
4. an unmentioned reply create may emit `thread_activity`;
5. a mention edit 0→1 emits one `mention` intent for the new generation;
6. edits without 0→1, reactions, deletes, read changes, attention changes, and membership events emit no new user-content intent;
7. mention removal, target deletion, context observation/acknowledgement, or access loss cancels matching **undelivered** intents;
8. duplicate event/intent delivery is suppressed by the stable key. A delivered provider notification is not retractable.

### 10.2 Delivery decision truth table

Inputs at delivery time include current authorization, message state, self/other author, effective conversation mode, explicit direct-mention suppression, foreground context, and quiet hours.

| Intent | Effective mode `all_activity` | `mentions_only` | `mute` | `mute` + explicit suppress-direct-mentions |
|---|---|---|---|---|
| `activity` root | eligible | suppress | suppress | suppress |
| `thread_activity` reply | eligible | suppress | suppress | suppress |
| `mention` create/edit-add | eligible | eligible | eligible | suppress |

For every “eligible” cell:

- inactive membership, invisible/deleted target, self-authorship, or already acknowledged/read context => cancel/suppress;
- target context currently foreground and visibly observed => suppress and record no unread side effect;
- quiet hours => delay until their end, then reauthorize/re-evaluate; do not mark read;
- provider/browser permission absent => suppress provider delivery only; unread/mention/thread projections are unchanged;
- duplicate stable key => at most one visible provider notification.

Attention set never creates a notification. Notification delivery/failure never changes cursor, attention, mention generation, or unread counts.

## 11. Access loss and cache purge protocol

A voluntary leave or administrative revoke transaction MUST atomically make membership inactive with its durable `channel.member_left`/`channel.member_revoked` event and authorization state. After commit:

1. new commands, history/delta/search/file reads, and subscriptions are denied;
2. gateway queues for the ended membership epoch are fenced and discarded;
3. the affected principal is not sent the public channel event;
4. a principal-scoped `access_revoked` control is attempted, with `action = purge_cached_scope`;
5. every affected client stops channel activity and deletes cached messages, replies, tombstones, mentions, counts, drafts whose privacy policy requires deletion, search results, file URLs/bytes, cursors, and queued channel events for the scope;
6. other authorized members may receive the durable membership event in channel order;
7. a missed control is repaired on reconnect or the next authorization denial, which carries the same purge instruction without disclosing whether an unauthorized private object exists.

The control is deliberately not an “authorized last channel event.” Its principal-scoped delivery remains safe after channel access ends because it contains only scope, ended epoch, reason code, and purge action.

## 12. Exact reference reducer contract

### 12.1 State

The minimum semantically complete state is:

```ts
type Seq = bigint;

type MessageState = {
  message_id: string;
  author_principal_id: string;
  thread_root_id: string | null;
  created_event_seq: Seq;
  version: number;
  deleted: boolean;
  resolved_mentions: Set<string>;
};

type MentionState = {
  mention_item_id: string;
  membership_epoch: string;
  message_id: string;
  context: "root" | "reply";
  root_message_id: string;
  active: boolean;
  generation: number;
  trigger_event_seq: Seq;
  acknowledged_generation: number;
};

type ReferenceState = {
  tenant_id: string;
  channel_id: string;
  viewer_principal_id: string;

  channel: {
    high_watermark_event_seq: Seq;
    seen_event_ids: Map<string, string>; // event_id -> canonical payload digest
    event_id_by_seq: Map<Seq, string>;
    messages: Map<string, MessageState>;
    reactions: Set<string>; // canonical tuple message/key/reactor
  };

  principal: {
    membership: {
      active: boolean;
      membership_epoch: string | null;
      joined_event_seq: Seq | null;
      exited_event_seq: Seq | null;
      history_mode: "full" | "since_join" | null;
    };
    channel_read_event_seq: Seq;
    thread_read_event_seq: Map<string, Seq>;
    private_high_revision: bigint;
    attention: {
      membership_epoch: string | null;
      attention_revision: bigint;
      root_message_id: string | null;
      floor_event_seq: Seq | null;
    };
    mentions: Map<string, MentionState>; // mention_item_id
  };
};
```

A production implementation may store derived indexes/counts, but they MUST equal this model. Content/audit/attachment fields may exist in canonical state; projection output for a tombstone MUST omit ordinary content and usable attachment references.

Zero state has sequence/revision/read values `0`, empty maps/sets, inactive membership, and null attention.

### 12.2 Input and normalization

```ts
type ReducerInput = {
  channel_events: ChannelEvent[];
  principal_records: PrincipalRecord[];
};

type ReducerResult = {
  state: ReferenceState;
  projection: ProjectionOutput;
  effects: ReducerEffects;
  errors: ReducerContractError[];
};
```

For a full rebuild:

1. Parse all sequence strings strictly as `Seq`; malformed/overflow values are contract errors.
2. Deduplicate byte-equivalent channel events by `event_id`. Same ID with a different canonical digest is `EVENT_ID_COLLISION`.
3. Reject two different event IDs with one `(channel_id, event_seq)` as `EVENT_SEQ_COLLISION`.
4. Sort channel events by numeric `event_seq` and apply §12.3. Sequence gaps do not fail reduction.
5. Deduplicate principal records by `record_id`; reject conflicting reuse.
6. Sort private records by numeric `private_revision`. Same revision with different records is `PRIVATE_REVISION_COLLISION`.
7. Apply only records for the viewer and the membership epoch to which they refer; records from ended epochs remain archival and cannot change the current epoch.
8. Compute output from state, never from stored count deltas.

An incremental reducer obeys the same canonical order. It may buffer physically out-of-order inputs; it MUST NOT guess through an unresolved ordering gap when its sync protocol says more retained events exist. Reapplying an already seen identical input yields the same state/output and no repeated effects.

### 12.3 Channel-event transition algorithm

For each normalized channel event `e`:

1. Validate tenant/channel and schema version. Record `event_id` and `event_seq`; set high watermark to `max(current, e.event_seq)`.
2. `message.created`:
   - reject duplicate `message_id`, nested/missing/cross-channel reply root, or `version != 1`;
   - insert immutable message facts and authoritative mention set;
   - if viewer is currently eligible and in the set, create its current-epoch mention item at generation 1 and trigger `e.event_seq`;
   - derive unread/reply counts; do not mutate read cursors.
3. `message.edited`:
   - require existing live target and exactly next version;
   - compare old/new authoritative mention sets and apply §7.2 for viewer;
   - replace set/version; never change author, context, creation sequence, ordinary unread, thread unread, or reply count.
4. `message.deleted`:
   - require existing live target and exactly next version;
   - mark deleted, update version, clear target reactions, deactivate viewer mention item;
   - retain identity/context. Derive all counts and first identities again; do not cascade from root.
5. `reaction.changed`:
   - require existing live visible-policy-capable target and `reactor_principal_id == actor.principal_id` unless actor kind is authorized `system`;
   - add/remove the canonical tuple idempotently. Change no unread/mention/thread/notification projection.
6. `channel.member_joined` for viewer:
   - require a new epoch and no currently active viewer epoch;
   - activate membership with `J=e.event_seq` and payload history mode;
   - set `channel_read_event_seq=max(existing,J)`; treat `J` as every thread's lazy floor;
   - ignore all prior-epoch attention/mentions. Do not backfill mention items or unread.
7. `channel.member_left`/`channel.member_revoked` for viewer:
   - require matching active epoch;
   - mark inactive/exited at `e.event_seq`, cancel desired pending intents, and emit exactly one idempotent `access_revoked` effect keyed by `(event_id, viewer)`;
   - projection becomes inaccessible/purge-required. Do not expose the public event to viewer.
8. Membership events for another principal may update an optional roster projection only; they change none of this viewer's counts/cursors.

A domain transaction should prevent invalid histories. The reference reducer reports them rather than inventing recovery state.

### 12.4 Principal-record transition algorithm

For each normalized private record `r`:

1. Require exact tenant/channel/viewer and a known epoch. Update `private_high_revision` only in revision order.
2. Records for an ended non-current epoch do not affect current output.
3. For a current active epoch:
   - `channel_read.advanced`: require merged value `>=` current and `<=` channel high watermark; assign it.
   - `thread_read.advanced`: require a valid visible root and merged value `>=` stored value and `<=` high watermark; assign it for that root.
   - `attention.set`: require a visible root that was live when committed; assign root, immutable creation floor, epoch, and this private revision.
   - `attention.cleared`: require its expected revision to match the prior attention revision represented by committed history; assign null root/floor and this revision.
   - `mention.acknowledged`: require matching stable item and generation not greater than current generation; assign `max(existing acknowledged_generation, supplied)`.
4. Recompute output. No principal record changes canonical messages/reactions or creates a channel event.

### 12.5 Output

```ts
type ProjectionOutput = {
  tenant_id: string;
  channel_id: string;
  principal_id: string;
  membership_epoch: string | null;
  accessible: boolean;
  cache_action: "keep" | "purge";
  high_watermark_event_seq: string;

  channel_read_event_seq: string | null;
  attention: null | {
    attention_revision: string;
    requested_root_message_id: string;
    effective_anchor_message_id: string | null;
    floor_event_seq: string;
  };

  ordinary_unread_count: number;
  has_unread: boolean;
  first_unread: null | {
    message_id: string;
    created_event_seq: string;
    source: "cursor" | "attention" | "both";
  };

  unread_mention_count: number;
  mention_inbox: Array<{
    mention_item_id: string;
    message_id: string;
    root_message_id: string;
    context: "root" | "reply";
    generation: number;
    trigger_event_seq: string;
    unread: boolean;
  }>;

  threads_with_unread_count: number;
  total_thread_unread_reply_count: number;
  threads: Array<{
    root_message_id: string;
    root_deleted: boolean;
    reply_count: number;
    latest_reply_id: string | null;
    thread_read_event_seq: string;
    unread_reply_count: number;
    first_unread_reply: null | {
      message_id: string;
      created_event_seq: string;
    };
  }>;
};

type ReducerEffects = {
  notification_intents_upsert: NotificationIntent[];
  notification_intent_keys_cancel: string[];
  principal_controls: AccessRevokedControl[];
};
```

When `accessible=false`, `cache_action` MUST be `purge`; all counts are zero, `first_unread`, attention output, and mention inbox are null/empty, and no message/thread rows may be returned. When accessible, ordering is deterministic:

- mention inbox: `(trigger_event_seq DESC, mention_item_id ASC)`;
- threads: `(root.created_event_seq ASC, root_message_id ASC)`;
- first/latest choices: event sequence, then stable message ID tie-break (the tie-break is defensive; valid creation events have unique sequences).

`ReducerEffects` is the idempotent set difference between desired effect state before and after the normalized input batch. Replaying an identical batch produces empty effects.

## 13. Property-test oracle tables and invariants

### 13.1 Minimal operation vectors

The following vectors are mandatory model cases. `ΔO`, `ΔM`, and `ΔT(r)` mean changes immediately after the operation, before a later read; predicates in parentheses control whether the delta occurs.

| ID | Operation/precondition | Expected projection/effect |
|---|---|---|
| P01 | other creates visible live root at `S > C`, no mention | `ΔO=+1`; first becomes it iff no earlier candidate; activity intent |
| P02 | viewer creates root at `S > C` | `ΔO=0`, no mention/thread unread, no notification |
| P03 | other creates visible reply at `S > TR(r)`, no mention | `ΔO=0`, `ΔT(r)=+1`, `reply_count(r)+1`, thread-activity intent |
| P04 | viewer creates reply | `ΔT=0`, `reply_count+1`, no notification to viewer |
| P05 | root/reply create directly mentions viewer | exactly one generation-1 mention item; mention intent replaces activity intent; root obeys O, reply obeys T independently |
| P06 | edit mention 0→1 on visible old root | `ΔO=0`; `ΔM=+1` iff context cursor `< edit seq`; new mention intent |
| P07 | edit mention 1→1 | generation/trigger/read state unchanged; no new intent |
| P08 | edit mention 1→0 | active item removed from count/inbox; cancel pending mention intent; O/T unchanged |
| P09 | edit mention 0→1 after prior removal | same item ID, generation +1, trigger=edit seq, at most one new mention intent |
| P10 | delete unread root | `ΔO=-1`; root tombstone; first recomputed; root reply count/T/reply mentions unchanged |
| P11 | delete read root | `ΔO=0`; root tombstone; replies unchanged |
| P12 | delete unread reply | `ΔT(r)=-1`, `reply_count(r)-1`; thread first recomputed; O unchanged |
| P13 | delete read or self reply | `ΔT=0`, `reply_count-1`; never negative |
| P14 | delete mentioned message | active mention removed; pending target intents cancelled; other messages/replies unaffected |
| P15 | reaction add/remove/replay | O/M/T/first/reply count/notification unchanged; canonical set converges |
| P16 | advance channel cursor `C→C'` | natural root candidates `<=C'` clear; top-level mentions with trigger `<=C'` read; replies unchanged; attention-range candidates remain |
| P17 | advance thread `TR(r)→T'` | reply candidates/mentions in `r` `<=T'` clear; channel and other threads unchanged |
| P18 | attempt cursor regression | `409`, no private record, byte-identical projection |
| P19 | set attention from old root below C | cursors unchanged; attention range recomputed; no notification |
| P20 | stale device clears newer attention revision | `409 ATTENTION_CHANGED`; marker/projection unchanged |
| P21 | valid attention clear | natural cursor unread remains; attention-only unread/anchor removed |
| P22 | join at J with full history | old retained messages visible but O/M/T all zero at J; no mention backfill |
| P23 | join at J with since-join history | pre-J roots/replies/events hidden; O/M/T zero at J |
| P24 | full-history member receives post-J edit adding mention on old visible message | one mention generation/intent; O remains zero |
| P25 | since-join member would be named by edit on hidden old message | no event/content/mention/count/notification leakage |
| P26 | leave/revoke viewer | inaccessible output, all counts zero, pending intents cancelled, one purge control; public exit event not delivered to viewer |
| P27 | rejoin with new epoch | old marker/mentions ignored; baseline=new J; stale old-device writes rejected |
| P28 | concurrent channel reads `{a,b,c}` | final cursor `max(a,b,c,initial,J)` and one rederived projection, independent of arrival order |
| P29 | duplicate physical event/private record | exactly same final state/output; no duplicate effect |
| P30 | root deleted while all replies subsequently deleted | root tombstone remains, `reply_count=0`, thread unread=0; no fabricated reply |

### 13.2 Required algebraic properties

Property tests MUST assert at least:

```text
1. Idempotence
   reduce(S, normalize(I ++ I)) == reduce(S, normalize(I))

2. Physical-order convergence
   for any permutation p of the same authorized deliveries,
   reduce(S, normalize(p(I))) == reduce(S, normalize(I))

3. Cursor monotonicity
   C_after >= C_before
   TR_after[root] >= TR_before[root]

4. Multi-device max
   mergeReadCandidates(X) == max(X ∪ {stored, join_baseline})

5. Count non-negativity and set equivalence
   ordinary_unread_count == |ordinaryUnreadSet|
   unread_mention_count == |unreadMentionItemSet|
   reply_count[root] == |liveVisibleReplySet(root)|
   unread_reply_count[root] == |threadUnreadSet(root)|

6. First identity consistency
   has_unread == false <=> first_unread == null
   first_unread == min(ordinaryUnreadSet ∪ attentionAnchor)
   first_unread_reply[root] == min(threadUnreadSet(root))

7. Self exclusion
   absent explicit attention, viewer-authored create changes O/M/T by zero

8. Edit locality
   message.edited changes no created_event_seq, O, T, reply_count, or thread root;
   only resolved-mention set transitions may change M/mention intents

9. Delete locality
   delete(root) never mutates reply identities/counts/unread/mentions;
   delete(reply) changes reply_count by exactly one iff it was live

10. Join baseline
    after join at J and before an event > J, O=M=T=0 for both history modes

11. Epoch isolation
    records/items from epoch E cannot affect output in later epoch E2

12. Authorization closure
    accessible=false => no content, counts, mention items, thread rows, file handles,
    or notification candidates are returned

13. Notification idempotence
    at most one desired intent per stable key; mention precedence yields no same-trigger
    activity+mention pair for one principal/message

14. Rebuild equivalence
    incremental projection at high watermark H == fresh reduction of the same canonical
    events/private state through H
```

### 13.3 Generated state-machine operations

The reference property suite SHOULD generate at least:

```text
root_create, reply_create, own_create, mention_create,
edit_no_mention_change, edit_add_mention, edit_remove_mention,
root_delete, reply_delete, reaction_set, reaction_unset,
channel_read_advance, channel_read_regression,
thread_read_advance, thread_read_regression,
attention_set_older, attention_set_newer, attention_clear_valid,
attention_clear_stale, mention_acknowledge,
join_full, join_since, leave, revoke, rejoin,
duplicate_delivery, reordered_delivery, reconnect/rebuild,
concurrent_device_read
```

Generation MUST preserve domain preconditions for ordinary cases and separately generate invalid-history cases to assert the contract errors in §12. Physical duplicates and transport reorder are normalized before semantic reduction; logical duplicate commands are expected to have been collapsed by command idempotency.

## 14. Implementation conformance checklist

An implementation conforms only if all are true:

- [ ] Public channel schemas contain exactly the v1 event-type semantics in §4, using decimal-string `event_seq`.
- [ ] No principal read/attention/mention-ack update is appended to or exposed from the shared channel stream.
- [ ] Root and reply read predicates use `channel_read_event_seq` and per-root `thread_read_event_seq` respectively.
- [ ] Mark unread uses the revisioned attention register and never decreases a read cursor.
- [ ] Edit mention 0→1, 1→1, 1→0, remove→re-add, delete, and self cases match §7.
- [ ] Root/reply tombstone and `reply_count` behavior matches §8.
- [ ] Join baseline, full/since-join visibility, leave/revoke, rejoin epoch, and no mention backfill match §3/§9.
- [ ] Concurrent device cursor writes converge by max; stale attention clears cannot erase newer markers.
- [ ] Access loss fences queued delivery and causes principal-scoped cache purge without sending an unauthorized “last public event.”
- [ ] Notification intents are idempotent hints and never mutate projection truth.
- [ ] Unit/property and PostgreSQL model tests use the exact state, output fields, vectors, and invariants in §§12–13 with zero mismatch.
