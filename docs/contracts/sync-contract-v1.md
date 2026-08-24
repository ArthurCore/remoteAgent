# AW-006A — Normative Chat Sync Contract v1

- **Status:** Normative, implementation-blocking
- **Contract version:** `1.0.0`
- **Wire schema version:** `1`
- **Date:** 2026-08-24
- **Scope:** Milestone 1 durable per-channel synchronization over HTTP and Socket.IO
- **Owner:** Chat Core architecture

This document is the single normative Chat Sync v1 contract. It resolves foundation-review finding C-01. Where an earlier foundation document uses `seq`, `type`, `created_at`, `high_watermark`, `snapshot_cursor` without the semantics below, “highest contiguous ACK,” or a fetch-then-subscribe sketch, this contract controls.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

## 1. Scope and invariants

This contract covers:

- the canonical durable event envelope;
- per-channel ordering and opaque cursors;
- initial snapshot and reconnect/resume;
- the HTTP fixed-range delta API;
- the Socket.IO subscription, barrier, bounded buffer, and live-delivery protocol;
- client deduplication, out-of-order handling, application checkpointing, retry, cursor expiry, overflow, and access revocation;
- deterministic conformance scenarios for every handoff boundary.

Domain payload schemas and the projection meaning of each `event_type` are separate versioned contracts. They MUST be registered under the envelope rules in §3. Typing and presence are ephemeral and MUST NOT use this durable protocol.

The following invariants are non-negotiable:

1. PostgreSQL committed channel events are the durable sync truth. Socket state, a transport ACK, an outbox notification, and a client cache are not truth.
2. Ordering exists only within one `(tenant_id, channel_id)`. There is no cross-channel ordering promise.
3. Delivery is at least once. Clients MUST make application idempotent.
4. A socket is an optimization. A client can reconstruct from an authenticated snapshot and authenticated deltas.
5. Every snapshot, delta request, subscription, and reconnect independently authorizes the authenticated principal. A cursor never grants access.
6. No snapshot/live handoff may have a gap. The server begins buffering before it captures the subscription barrier and reconciles the buffer against the durable journal before entering live mode.
7. All queues are bounded. Overflow is explicit and resumable; silently dropping a durable event is forbidden.
8. The canonical event envelope has exactly the nine top-level fields listed in §3. Transport metadata and control messages are wrappers, not durable event fields.

## 2. Normative vocabulary: sequence, cursor, checkpoint, and ACK

These terms are distinct and MUST NOT be used as synonyms.

| Term | Owner and representation | Exact meaning | It is not |
|---|---|---|---|
| `event_seq` | Server; canonical positive decimal string in each durable event | The event's unique, monotonically increasing position in one channel's durable event order. Compare as an arbitrary-precision integer. Gaps are legal. | A cursor, an ACK, a timestamp, or a global order. |
| `cursor` | Server; opaque string bound to one tenant/channel stream | An inclusive resume boundary: the server has accounted for the authorized channel stream through this position. It may internally encode an event position, version, and retention metadata. | Client-constructible, numerically comparable, authorization, or an alias for `event_seq`. |
| `snapshot_cursor` | Server; a cursor | The boundary through which a returned snapshot is complete. No durable event after this boundary is reflected in that snapshot. | A live subscription or proof that later events are buffered. |
| `barrier_cursor` | Server; a cursor created after subscription buffering starts | The fixed inclusive upper bound of the first delta range. The server guarantees delta coverage through it while holding later events. | A client checkpoint or transport receipt. |
| `last_applied_cursor` | Client application; persisted per tenant/channel replica | The greatest cursor boundary through which every authorized item has been validated and successfully reduced into the local projection. The projection, dedupe record, and this cursor advance MUST commit atomically. | The last packet received, the largest observed `event_seq`, a transport ACK, or a server durability record. |
| transport ACK | Socket.IO callback for one `sync.delivery` packet | Confirms that the client validated the delivery wrapper and admitted it to its bounded local processing queue. | Command acceptance, event application, a barrier response, `last_applied_cursor`, or permission to delete canonical events. |
| `event_id` | Server; opaque globally unique string | Stable logical event identity used for deduplication. Every physical redelivery of one event has the same ID and semantic envelope. | Ordering or a cursor. |

### 2.1 Cursor rules

A v1 cursor MUST satisfy all of the following:

- It is a non-empty opaque string of at most 4,096 UTF-8 bytes. Clients MAY store, return, and test it for byte-for-byte equality; they MUST NOT parse, decode, increment, sort, or synthesize it.
- It is cryptographically integrity-protected or resolved through server-side opaque state so mutation/forgery is rejected.
- It is bound to the authenticated tenant and requested channel. A cursor issued for channel A MUST NOT succeed against channel B, even if both channels currently have the same internal sequence.
- Authorization is re-evaluated separately. Possession of a valid cursor never proves current membership.
- Within one active handshake lease, cursor chaining is byte-stable: the first `before_cursor` returned for a range equals the submitted `after` cursor, and each subsequent boundary is the exact prior returned boundary.
- A cursor identifies a position after all authorized events through that boundary. The client never assumes that `event_seq + 1` exists.
- Cursor retention and message-history retention are separate policies. Expiry behavior is specified in §11.

Servers SHOULD return the same cursor bytes for the same channel position during an active lease, but clients rely only on the explicit chaining guarantees above.

### 2.2 Application checkpoint rule

For each channel replica, the client MUST persist at least:

```text
(tenant_id, channel_id, last_applied_cursor, projection_state, dedupe_state)
```

The projection mutation, durable dedupe mark, and `last_applied_cursor` update MUST be one local transaction (for example, one IndexedDB transaction). If that transaction cannot be made atomic, the client MUST prefer replaying an event over advancing the cursor early.

Receiving or transport-ACKing a frame MUST NOT advance `last_applied_cursor`. The only v1 wire messages carrying the client checkpoint are:

- `sync.subscribe.after_cursor` when starting/restarting a subscription; and
- `sync.barrier.applied.last_applied_cursor` after the fixed delta range has been applied.

There is no “highest contiguous transport ACK” in v1.

## 3. Canonical durable event envelope

Every durable channel event on HTTP or Socket.IO MUST use this exact top-level envelope:

```json
{
  "schema_version": 1,
  "event_id": "evt_opaque",
  "tenant_id": "ten_opaque",
  "channel_id": "chn_opaque",
  "event_seq": "9007199254740993",
  "event_type": "message.created",
  "actor": {
    "principal_id": "prn_opaque",
    "kind": "human"
  },
  "occurred_at": "2026-08-24T12:34:56.789Z",
  "payload": {}
}
```

The nine required and only top-level fields are, in canonical documentation order:

```text
schema_version,event_id,tenant_id,channel_id,event_seq,event_type,actor,occurred_at,payload
```

Normative field rules:

- `schema_version` MUST be the JSON number `1` for this contract. It is not the document semver.
- `event_id`, `tenant_id`, and `channel_id` are opaque non-empty strings. Clients MUST NOT infer tenancy or authorization from their shape.
- `event_seq` MUST be a canonical base-10 positive integer string with no sign, whitespace, decimal point, exponent, or leading zero. V1 values fit PostgreSQL signed `BIGINT`: `1` through `9223372036854775807`. It MUST never be parsed through JavaScript `Number`.
- `event_type` MUST be a registered lowercase dotted name. The concrete durable-event schema MUST be a discriminated union over registered `event_type` values and their payload schemas. Unknown event types under `schema_version: 1` are a protocol incompatibility, not silently ignored state.
- `actor` MUST be server-derived and immutable. It has exactly `principal_id` and `kind`; v1 `kind` is `human`, `service`, or `system`. Milestone 1 normally emits `human` or `system`; reserving `service` does not activate Agent scope.
- `occurred_at` MUST be an RFC 3339 UTC string ending in `Z`. It is display/audit time, never the ordering key.
- `payload` MUST be a JSON object validated by the registered schema for `event_type`. Each concrete payload schema MUST reject unknown fields unless that event's contract explicitly marks an extension map.
- Unknown top-level fields MUST be rejected. The legacy top-level names `seq`, `type`, and `created_at` MUST NOT be emitted or accepted as aliases.

The same `event_id` MUST always identify the same `tenant_id`, `channel_id`, `event_seq`, `event_type`, `actor`, `occurred_at`, and semantically equal payload. Reuse with different content is `EVENT_ID_CONFLICT` and requires fail-closed recovery.

## 4. Reference Zod contracts

The following is the normative TypeScript shape for `packages/contracts`. Implementations MAY split it across files, but generated JSON Schema/OpenAPI and runtime parsing MUST be equivalent. All server ingress and all client ingress MUST use strict parsing.

```ts
import { z } from "zod";

const MAX_PG_BIGINT = 9_223_372_036_854_775_807n;

export const OpaqueIdV1 = z.string().min(1).max(255);
export const CursorV1 = z.string().min(1).max(4096).brand<"ChannelCursorV1">();
export const EventSeqV1 = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= MAX_PG_BIGINT, "event_seq exceeds BIGINT");
export const UtcTimestampV1 = z.string().datetime({ offset: false });
export const EventTypeV1 = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);

export const ActorV1 = z
  .object({
    principal_id: OpaqueIdV1,
    kind: z.enum(["human", "service", "system"]),
  })
  .strict();

/** Base envelope only. Concrete event schemas refine event_type + payload. */
export const EventEnvelopeV1 = z
  .object({
    schema_version: z.literal(1),
    event_id: OpaqueIdV1,
    tenant_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    event_seq: EventSeqV1,
    event_type: EventTypeV1,
    actor: ActorV1,
    occurred_at: UtcTimestampV1,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const SyncItemV1 = z
  .object({
    before_cursor: CursorV1,
    cursor: CursorV1,
    event: EventEnvelopeV1,
  })
  .strict();

export const snapshotResponseV1 = <T extends z.ZodTypeAny>(state: T) =>
  z
    .object({
      schema_version: z.literal(1),
      tenant_id: OpaqueIdV1,
      channel_id: OpaqueIdV1,
      snapshot_id: OpaqueIdV1,
      snapshot_cursor: CursorV1,
      generated_at: UtcTimestampV1,
      state,
    })
    .strict();

export const DeltaResponseV1 = z
  .object({
    schema_version: z.literal(1),
    tenant_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    from_cursor: CursorV1,
    through_cursor: CursorV1,
    items: z.array(SyncItemV1).max(500),
    next_cursor: CursorV1,
    reached_barrier: z.boolean(),
  })
  .strict();

export const SyncLimitsV1 = z
  .object({
    max_buffered_events: z.number().int().positive(),
    max_buffered_bytes: z.number().int().positive(),
    catchup_timeout_ms: z.number().int().positive(),
    gap_timeout_ms: z.number().int().positive(),
  })
  .strict();

export const SyncSubscribeV1 = z
  .object({
    schema_version: z.literal(1),
    request_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    after_cursor: CursorV1,
  })
  .strict();

export const SyncSubscriptionReadyV1 = z
  .object({
    schema_version: z.literal(1),
    request_id: OpaqueIdV1,
    subscription_id: OpaqueIdV1,
    tenant_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    after_cursor: CursorV1,
    barrier_cursor: CursorV1,
    lease_expires_at: UtcTimestampV1,
    limits: SyncLimitsV1,
  })
  .strict();

export const SyncBarrierAppliedV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    barrier_cursor: CursorV1,
    last_applied_cursor: CursorV1,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.barrier_cursor !== value.last_applied_cursor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["last_applied_cursor"],
        message: "last_applied_cursor must equal barrier_cursor",
      });
    }
  });

export const SyncDeliveryV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    delivery_id: OpaqueIdV1,
    phase: z.enum(["buffered", "live"]),
    item: SyncItemV1,
  })
  .strict();

/** Socket.IO packet receipt only; never an application checkpoint. */
export const TransportAckV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    delivery_id: OpaqueIdV1,
    status: z.literal("received"),
  })
  .strict();

export const SyncLiveV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    live_cursor: CursorV1,
  })
  .strict();

export const SyncResyncRequiredV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    code: z.enum([
      "BUFFER_OVERFLOW",
      "HANDSHAKE_TIMEOUT",
      "SUBSCRIPTION_LOST",
      "PROTOCOL_GAP",
    ]),
    action: z.literal("resume"),
    retry_after_ms: z.number().int().nonnegative(),
  })
  .strict();

export const SyncRevokedV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    tenant_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    code: z.literal("ACCESS_REVOKED"),
    purge: z.literal(true),
    occurred_at: UtcTimestampV1,
  })
  .strict();

export const SyncErrorCodeV1 = z.enum([
  "AUTH_REQUIRED",
  "ACCESS_REVOKED",
  "CURSOR_INVALID",
  "CURSOR_EXPIRED",
  "CURSOR_RANGE_INVALID",
  "BARRIER_MISMATCH",
  "SUBSCRIPTION_NOT_FOUND",
  "UNSUPPORTED_SCHEMA_VERSION",
  "TEMPORARY_UNAVAILABLE",
]);

export const SyncErrorV1 = z
  .object({
    schema_version: z.literal(1),
    code: SyncErrorCodeV1,
    action: z.enum(["retry", "resume", "snapshot", "reauthorize", "update"]),
    retryable: z.boolean(),
    correlation_id: OpaqueIdV1,
    retry_after_ms: z.number().int().nonnegative().optional(),
  })
  .strict();

export const SubscribeResultV1 = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: SyncSubscriptionReadyV1 }).strict(),
  z.object({ ok: z.literal(false), error: SyncErrorV1 }).strict(),
]);

export const BarrierAppliedResultV1 = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          schema_version: z.literal(1),
          subscription_id: OpaqueIdV1,
          state: z.literal("flushing"),
        })
        .strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: SyncErrorV1 }).strict(),
]);
```

A concrete event registry MUST replace the base envelope's broad payload with a discriminated union. Example pattern:

```ts
const MessageCreatedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("message.created"),
  payload: z
    .object({
      message_id: OpaqueIdV1,
      version: z.number().int().positive(),
      body: z.string(),
    })
    .strict(),
}).strict();

export const DurableEventV1 = z.discriminatedUnion("event_type", [
  MessageCreatedV1,
  // Every other registered v1 event schema is listed explicitly.
]);
```

`SyncItemV1.event` MUST use `DurableEventV1` in production. The base schema exists only to define the common envelope.

## 5. HTTP/OpenAPI contract

### 5.1 Snapshot

```http
GET /api/v1/channels/{channel_id}/sync/snapshot
Authorization: <authenticated session>
```

The server MUST authorize the current principal, open one consistent database view, establish boundary H, materialize `state` from no later than H, and return `snapshot_cursor = H`. The snapshot MUST satisfy:

- every durable event at or before H that affects the snapshot projection is reflected;
- no durable event after H is reflected;
- state and H come from the same consistent view;
- `snapshot_id` is diagnostic identity, not a resume cursor;
- a client validates and installs the entire snapshot atomically before setting `last_applied_cursor = snapshot_cursor`;
- if snapshot state is internally paged, all pages MUST be frozen to the same `snapshot_id` and `snapshot_cursor`, and the client MUST NOT install a partial snapshot. A page token is query pagination metadata and MUST NOT be accepted as a channel cursor.

### 5.2 Fixed-range delta

```http
GET /api/v1/channels/{channel_id}/sync/events?after={cursor}&through={barrier_cursor}&limit=200
Authorization: <authenticated session>
```

`after` is exclusive. `through` is inclusive and REQUIRED during v1 catch-up. `limit` defaults to 200 and MUST be from 1 through 500.

For every successful page:

1. `from_cursor` is byte-for-byte equal to the request's `after` value.
2. `through_cursor` is byte-for-byte equal to the request's `through` value.
3. Returned items are in ascending channel order and lie in `(from_cursor, through_cursor]`.
4. The first item's `before_cursor` equals `from_cursor`; each later item's `before_cursor` equals the preceding item's `cursor` after accounting for any server-authorized no-op advance.
5. `next_cursor` is the inclusive boundary through which this page is complete. The client may persist it only after all page items have applied.
6. If `reached_barrier` is `true`, `next_cursor` equals `through_cursor`, and no later page is needed.
7. If `reached_barrier` is `false`, `next_cursor` MUST make progress and becomes the next request's `after` value.
8. No event committed after the barrier may leak into the fixed range, even if it is already in a fan-out buffer.
9. Duplicate physical rows/frames MAY be observed across retries, but one `event_id` never has two meanings.

A server that suppresses a non-visible internal event MAY advance `next_cursor` without returning an event. That cursor advance means only that the authenticated projection has accounted through the boundary. It is safe to persist only after all returned items have applied. Event visibility rules themselves belong to the projection contract.

### 5.3 OpenAPI 3.1 excerpt

This excerpt is directly usable as the sync portion of the generated OpenAPI document. `ChannelReplicaStateV1` MUST be replaced by the concrete strict projection schema.

```yaml
openapi: 3.1.0
info:
  title: Chat Sync API
  version: 1.0.0
paths:
  /api/v1/channels/{channel_id}/sync/snapshot:
    get:
      operationId: getChannelSyncSnapshotV1
      parameters:
        - $ref: '#/components/parameters/ChannelId'
      responses:
        '200':
          description: Consistent channel replica snapshot
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SnapshotResponseV1' }
        '401': { $ref: '#/components/responses/SyncErrorResponse' }
        '403': { $ref: '#/components/responses/SyncErrorResponse' }
  /api/v1/channels/{channel_id}/sync/events:
    get:
      operationId: getChannelSyncDeltaV1
      parameters:
        - $ref: '#/components/parameters/ChannelId'
        - name: after
          in: query
          required: true
          schema: { $ref: '#/components/schemas/CursorV1' }
        - name: through
          in: query
          required: true
          schema: { $ref: '#/components/schemas/CursorV1' }
        - name: limit
          in: query
          required: false
          schema: { type: integer, minimum: 1, maximum: 500, default: 200 }
      responses:
        '200':
          description: Ascending, fixed-bound delta page
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DeltaResponseV1' }
        '400': { $ref: '#/components/responses/SyncErrorResponse' }
        '401': { $ref: '#/components/responses/SyncErrorResponse' }
        '403': { $ref: '#/components/responses/SyncErrorResponse' }
        '410': { $ref: '#/components/responses/SyncErrorResponse' }
        '503': { $ref: '#/components/responses/SyncErrorResponse' }
components:
  parameters:
    ChannelId:
      name: channel_id
      in: path
      required: true
      schema: { $ref: '#/components/schemas/OpaqueIdV1' }
  responses:
    SyncErrorResponse:
      description: Machine-readable sync failure
      content:
        application/json:
          schema: { $ref: '#/components/schemas/SyncErrorV1' }
  schemas:
    OpaqueIdV1:
      type: string
      minLength: 1
      maxLength: 255
    CursorV1:
      type: string
      minLength: 1
      maxLength: 4096
      description: Opaque, integrity-protected, tenant/channel-bound cursor; never parse.
    EventSeqV1:
      type: string
      pattern: '^[1-9][0-9]{0,18}$'
      description: Canonical decimal string in 1..9223372036854775807; never a JSON number.
    ActorV1:
      type: object
      additionalProperties: false
      required: [principal_id, kind]
      properties:
        principal_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        kind: { type: string, enum: [human, service, system] }
    EventEnvelopeV1:
      type: object
      additionalProperties: false
      required:
        - schema_version
        - event_id
        - tenant_id
        - channel_id
        - event_seq
        - event_type
        - actor
        - occurred_at
        - payload
      properties:
        schema_version: { type: integer, const: 1 }
        event_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        tenant_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        channel_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        event_seq: { $ref: '#/components/schemas/EventSeqV1' }
        event_type:
          type: string
          pattern: '^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$'
        actor: { $ref: '#/components/schemas/ActorV1' }
        occurred_at:
          type: string
          format: date-time
          pattern: 'Z$'
        payload:
          type: object
          description: Replaced by the strict schema selected by event_type.
          additionalProperties: true
    SyncItemV1:
      type: object
      additionalProperties: false
      required: [before_cursor, cursor, event]
      properties:
        before_cursor: { $ref: '#/components/schemas/CursorV1' }
        cursor: { $ref: '#/components/schemas/CursorV1' }
        event: { $ref: '#/components/schemas/EventEnvelopeV1' }
    ChannelReplicaStateV1:
      type: object
      description: Placeholder; generated contract MUST replace this with the strict projection schema.
      additionalProperties: true
    SnapshotResponseV1:
      type: object
      additionalProperties: false
      required: [schema_version, tenant_id, channel_id, snapshot_id, snapshot_cursor, generated_at, state]
      properties:
        schema_version: { type: integer, const: 1 }
        tenant_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        channel_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        snapshot_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        snapshot_cursor: { $ref: '#/components/schemas/CursorV1' }
        generated_at: { type: string, format: date-time, pattern: 'Z$' }
        state: { $ref: '#/components/schemas/ChannelReplicaStateV1' }
    DeltaResponseV1:
      type: object
      additionalProperties: false
      required: [schema_version, tenant_id, channel_id, from_cursor, through_cursor, items, next_cursor, reached_barrier]
      properties:
        schema_version: { type: integer, const: 1 }
        tenant_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        channel_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        from_cursor: { $ref: '#/components/schemas/CursorV1' }
        through_cursor: { $ref: '#/components/schemas/CursorV1' }
        items:
          type: array
          maxItems: 500
          items: { $ref: '#/components/schemas/SyncItemV1' }
        next_cursor: { $ref: '#/components/schemas/CursorV1' }
        reached_barrier: { type: boolean }
    SyncErrorV1:
      type: object
      additionalProperties: false
      required: [schema_version, code, action, retryable, correlation_id]
      properties:
        schema_version: { type: integer, const: 1 }
        code:
          type: string
          enum: [AUTH_REQUIRED, ACCESS_REVOKED, CURSOR_INVALID, CURSOR_EXPIRED, CURSOR_RANGE_INVALID, BARRIER_MISMATCH, SUBSCRIPTION_NOT_FOUND, UNSUPPORTED_SCHEMA_VERSION, TEMPORARY_UNAVAILABLE]
        action: { type: string, enum: [retry, resume, snapshot, reauthorize, update] }
        retryable: { type: boolean }
        correlation_id: { $ref: '#/components/schemas/OpaqueIdV1' }
        retry_after_ms: { type: integer, minimum: 0 }
```

Cross-field conditions such as cursor binding, range order, and `reached_barrier => next_cursor == through_cursor` MUST be enforced in application validation and contract tests because OpenAPI cannot express all of them portably.

## 6. Socket.IO contract

Socket.IO is only the carrier. All payloads are parsed with the Zod schemas in §4. Socket.IO room names, packet IDs, reconnection IDs, and callback mechanics MUST NOT leak into the durable event envelope.

```ts
export interface ClientToServerEventsV1 {
  "sync.subscribe": (
    request: z.infer<typeof SyncSubscribeV1>,
    respond: (result: z.infer<typeof SubscribeResultV1>) => void,
  ) => void;

  "sync.barrier.applied": (
    request: z.infer<typeof SyncBarrierAppliedV1>,
    respond: (result: z.infer<typeof BarrierAppliedResultV1>) => void,
  ) => void;

  "sync.unsubscribe": (
    request: {
      schema_version: 1;
      subscription_id: string;
      channel_id: string;
    },
  ) => void;
}

export interface ServerToClientEventsV1 {
  "sync.delivery": (
    delivery: z.infer<typeof SyncDeliveryV1>,
    transportAck: (ack: z.infer<typeof TransportAckV1>) => void,
  ) => void;

  "sync.live": (message: z.infer<typeof SyncLiveV1>) => void;
  "sync.resync_required": (message: z.infer<typeof SyncResyncRequiredV1>) => void;
  "sync.revoked": (message: z.infer<typeof SyncRevokedV1>) => void;
}
```

The callback to `sync.subscribe` is an operation result that establishes a barrier. The callback to `sync.barrier.applied` is an operation result that starts flushing. Neither is called a transport ACK. Only the callback passed with `sync.delivery` is the transport ACK defined in §2.

A `delivery_id` identifies one physical packet attempt within one subscription. Retransmitting the packet MAY reuse its `delivery_id`; redelivery on a new subscription MAY use a new `delivery_id`. Application deduplication always uses `event_id`, never `delivery_id`.

The server MAY use transport ACKs to release a packet copy from its bounded send window or detect a stalled connection. It MUST NOT use them to:

- advance an application cursor;
- infer that a reducer succeeded;
- make a command durable or return command acceptance;
- delete a canonical channel event;
- skip that event on a future resume.

If a transport ACK times out, the server MAY retransmit the identical delivery or terminate the subscription with `SUBSCRIPTION_LOST`. Both paths are at least once.

## 7. Race-free snapshot → subscription → barrier → delta → buffer → live handshake

The following state machine is REQUIRED. A shortcut is conformant only if its externally observable guarantees are identical.

### 7.1 State names

Server subscription states:

```text
BUFFERING_BEFORE_BARRIER
WAITING_FOR_BARRIER_APPLIED
FLUSHING_BUFFER
LIVE
TERMINATED
```

Client channel states:

```text
INSTALLING_SNAPSHOT
SUBSCRIBING
DRAINING_FIXED_DELTA
APPLYING_BUFFER
LIVE
RESYNC_REQUIRED
REVOKED
```

Only one active synchronization attempt per client replica/channel is allowed. Starting a new attempt MUST cancel old delta requests and unsubscribe/ignore the old `subscription_id`.

### 7.2 Step 1 — Obtain and atomically install snapshot H

1. The client calls the snapshot endpoint.
2. The server creates a consistent state at `snapshot_cursor = H` as defined in §5.1.
3. The client strictly validates identifiers, schema version, state, and cursor.
4. In one local transaction, the client replaces the channel projection, resets dedupe/pending state as appropriate, and stores `last_applied_cursor = H`.
5. Only after that transaction commits may it subscribe with `after_cursor = H`.

If the client crashes before step 4 commits, it discards the partial snapshot and fetches again. If it crashes after commit, it resumes from H; it does not need to reinstall the same snapshot.

### 7.3 Step 2 — Start server buffering, then capture barrier B

The client emits `sync.subscribe` with `after_cursor = last_applied_cursor`.

The server MUST linearize a successful subscribe in this exact order:

1. Authenticate the socket; derive the tenant from authentication; authorize current channel membership; validate schema and cursor binding/retention.
2. Create the subscription in `BUFFERING_BEFORE_BARRIER`, bind it to the socket, authenticated tenant, channel, and `after_cursor`, and make its bounded candidate buffer visible to the channel's fan-out ingress and durable-journal reconciler.
3. Record **buffering start S**. This is the instant the subscription state from step 2 becomes visible. S MUST occur before B is read.
4. Only after S, read the current committed durable channel boundary from PostgreSQL and mint `barrier_cursor = B`.
5. Attach a lease that keeps the fixed range `(H, B]` readable until `lease_expires_at`, unless access is revoked.
6. Reclassify buffered candidates at or before B as fixed-delta-owned (they may be discarded from the live buffer after durable reconciliation) and candidates after B as buffer-owned.
7. Enter `WAITING_FOR_BARRIER_APPLIED` and return `SyncSubscriptionReadyV1`. Do not transmit durable deliveries yet.

This order is the critical race closure. Events committed:

- after H but before S are in the authoritative delta `(H, B]` if committed by B;
- after S but at or before B may appear as both a fan-out candidate and delta row, but delta owns them and `event_id` dedupe makes any duplicate harmless;
- after B are held for the buffer/live path.

A lossy notification mechanism is insufficient for step 2. The subscription's later flush MUST reconcile against PostgreSQL as specified in §7.5, so a delayed/lost outbox wakeup cannot create a gap.

### 7.4 Step 3 — Drain the fixed delta `(H, B]`

While the server remains in `WAITING_FOR_BARRIER_APPLIED`, the client pages the delta endpoint:

```text
after = current last_applied_cursor
through = B
```

The client validates and applies each page in order. Events committed after B MUST NOT appear in these pages; they remain buffered. After all returned items have committed locally, the client advances to the page's `next_cursor`. It repeats until `reached_barrier = true`, then atomically records `last_applied_cursor = B`.

The client MUST NOT infer completion from an empty page, the largest seen `event_seq`, a transport ACK, or current wall-clock time. Only `reached_barrier: true` with `next_cursor = B` completes this stage.

### 7.5 Step 4 — Prove barrier application, reconcile and flush buffer through F

The client emits `sync.barrier.applied` with both `barrier_cursor = B` and `last_applied_cursor = B`. Equality is required. This message is an application-level handoff signal, not a transport ACK.

On acceptance, the server:

1. verifies the subscription is still authorized, unexpired, and in `WAITING_FOR_BARRIER_APPLIED`;
2. verifies both supplied cursors exactly equal its B;
3. remains in bounded buffering and captures a new durable **flush cut F** from PostgreSQL;
4. reads the authoritative journal range `(B, F]`, merges it with buffered fan-out candidates, deduplicates by `event_id`, validates envelope identity, and orders by `event_seq` using arbitrary-precision comparison;
5. under the subscription's serialization lock, queues all authorized `sync.delivery` frames through F with `phase: "buffered"` and a valid cursor chain;
6. queues exactly one `sync.live` marker with `live_cursor = F` after those frames;
7. queues already-held post-F candidates after that marker, switches atomically to `LIVE`, and then appends later live candidates to the same serialized channel queue.

New events continue entering the bounded candidate buffer during steps 3–5. Capturing F, partitioning candidates, enqueuing the live marker, and changing state MUST be serialized so an event cannot fall between the buffer and live paths.

The PostgreSQL reconciliation in step 4 is mandatory even if every outbox notification normally arrives. It closes delayed notification and candidate-order races. Events after F remain subject to the durable outbox/gateway polling guarantee and at-least-once delivery; a later gap triggers §9 recovery.

### 7.6 Step 5 — Apply buffer, then enter live

The client serially applies `sync.delivery` frames. It sends a transport ACK only after strict validation and admission to its bounded local queue; application may occur later.

When `sync.live` arrives, the client MUST process it in the same per-subscription serial lane as deliveries. It enters client state `LIVE` only after:

- all prior buffered delivery items are applied or deduplicated;
- its local projection is complete through `live_cursor`; and
- `last_applied_cursor` is atomically advanced to `live_cursor`.

`sync.live` may advance the cursor over server-authorized no-op/filtered internal positions after all visible items through F are applied. It does not assert that the channel will never receive another event.

Any delivery queued before the live marker has `phase: "buffered"`; any delivery queued after it has `phase: "live"`. Phase is diagnostic and MUST NOT affect event semantics or dedupe.

### 7.7 Handshake ownership table

| Durable event commit point | Required ownership |
|---|---|
| At/before snapshot H | Reflected in snapshot; not re-required as post-H delta. |
| After H, before server buffering start S | Fixed delta if at/before B. |
| After S, at/before B | Fixed delta owns it; a candidate duplicate is discarded/deduped. |
| After B, before barrier-applied signal | Bounded server buffer. |
| During fixed delta page reads | It is after B and therefore remains in the buffer. |
| After barrier-applied, at/before flush cut F | Authoritative `(B, F]` reconciliation and buffered delivery. |
| After F but before live marker is enqueued | Held post-F and enqueued after the marker under the same lock. |
| After live marker | Serialized live delivery, at least once. |

## 8. Barrier semantics

A successful subscribe response with barrier B is a server promise with all of these parts:

1. **Buffer-before-barrier:** buffering start S happened before B was captured.
2. **Fixed range:** the authoritative delta API can return every authorized event in `(after_cursor, B]`, pinned until the advertised lease expires.
3. **No contamination:** fixed delta pages never include events after B.
4. **Later-event custody:** events after B are held in a bounded buffer/candidate path while the fixed range drains.
5. **Durable reconciliation:** before live transition, the server reconciles `(B, F]` from PostgreSQL; correctness does not depend on notification delivery.
6. **Serialized transition:** deliveries through F, the live marker, held post-F events, and the switch to live are one ordered queue transition.
7. **No application claim:** B says nothing about what the client has applied. Only the client's successful `sync.barrier.applied` signal states that its local checkpoint reached B.

A server MUST NOT return B and begin buffering afterward. “Subscribe after H” without the ordering and reconciliation above is non-conformant.

The subscription callback itself can be physically retried. Repeating the same `request_id` on the same authenticated socket SHOULD return the same active subscription result when still valid; otherwise it MUST return an explicit error. The client MUST still identify the active attempt by `subscription_id` and ignore frames from superseded attempts.

## 9. Client dedupe, ordering, and gap recovery

### 9.1 Decimal order

Clients MUST compare `event_seq` without precision loss. Conformant choices are:

```ts
const compareEventSeq = (a: string, b: string): number =>
  a.length === b.length ? (a < b ? -1 : a > b ? 1 : 0) : a.length - b.length;

// BigInt(a) comparison is also valid. Number(a) is forbidden.
```

The sequence orders events, but cursor chaining decides resume continuity. Clients MUST NOT request a cursor constructed from a sequence or assume the next event has `event_seq + 1`.

### 9.2 Reference application algorithm

For each channel, the client uses one serial reducer lane and a bounded pending map. The following pseudocode is normative behavior:

```ts
function admitDelivery(frame: SyncDeliveryV1, sendTransportAck: () => void) {
  strictlyValidate(frame);
  assertCurrentSubscription(frame.subscription_id);
  assertTenantAndChannel(frame.item.event);

  if (!localQueue.tryAdd(frame)) {
    // Do not claim receipt that cannot be retained locally.
    terminateAndResume("LOCAL_BUFFER_OVERFLOW");
    return;
  }

  sendTransportAck(); // receipt/admission only; no cursor change
  runSerialReducer();
}

function reduceItem(item: SyncItemV1) {
  const known = dedupe.get(item.event.event_id);
  if (known) {
    if (known.fingerprint !== canonicalFingerprint(item.event)) {
      failClosedAndFetchFreshSnapshot("EVENT_ID_CONFLICT");
      return;
    }
    // Physical duplicate: no projection mutation and no second logical apply.
    pending.remove(item.event.event_id);
    return;
  }

  if (item.before_cursor !== replica.last_applied_cursor) {
    pending.addByBeforeCursor(item); // never apply ahead of a gap
    startGapTimerIfNeeded();
    return;
  }

  localTransaction(() => {
    applyRegisteredReducer(item.event);
    dedupe.put(item.event.event_id, canonicalFingerprint(item.event));
    replica.last_applied_cursor = item.cursor;
    replica.last_applied_event_seq = item.event.event_seq;
  });

  drainItemsWhoseBeforeCursorEquals(replica.last_applied_cursor);
}
```

Additional rules:

- Applying one `event_id` more than once is forbidden even if it arrived through HTTP and Socket.IO with different `delivery_id` values.
- An event with an already-seen `event_id` and different content is fatal protocol corruption.
- A previously accounted event with an older/equal sequence MAY be discarded as stale after identity checks; it MUST never roll back state or the cursor.
- An event whose `before_cursor` is not the current checkpoint is ahead, stale, or from a superseded chain. It MUST NOT be applied speculatively.
- Pending out-of-order data is bounded by the lower of client configuration and the server-advertised event/byte limits.
- If the predecessor arrives before `gap_timeout_ms`, the client drains the chain. If the timer expires, the pending buffer reaches its bound, a cursor chain forks, or event sequence decreases within a claimed forward chain, the client terminates that subscription and restarts the handshake from its persisted `last_applied_cursor`.
- The client MUST ignore late frames for an old `subscription_id` after retry, revoke, or unsubscribe.
- Reducers SHOULD also use aggregate versions/idempotency identities from concrete payloads, but those do not replace event-level dedupe.

### 9.3 Delta pages

HTTP pages use the same validation and reducer logic but have no transport ACK. The client processes all items, then may advance from the last item cursor to the page's `next_cursor` for server-authorized no-op positions. That final page advance is committed atomically with completion metadata. It never skips an unapplied returned item.

## 10. Bounded buffering and backpressure

The server advertises effective limits in `SyncSubscriptionReadyV1.limits`. The Milestone 1 release defaults are:

```text
max_buffered_events = 1000
max_buffered_bytes  = 5242880  (5 MiB)
```

The first bound reached terminates buffering. Byte accounting is the UTF-8 size of encoded pending `sync.delivery` payloads plus fixed queue metadata; implementations MUST document and test the exact accounting function. Candidate duplicates count until deduplicated. Queued and in-flight unacknowledged durable deliveries count toward the bound.

The server MUST also enforce a finite `catchup_timeout_ms` and advertise the absolute `lease_expires_at`. It MAY choose deployment-specific values, but it MUST NOT silently extend an abandoned subscription forever.

On server overflow or catch-up timeout:

1. atomically transition the subscription to `TERMINATED`;
2. stop and discard its data queue;
3. emit one `sync.resync_required` control message on a reserved constant-size control lane if transport remains writable, with `action: "resume"`;
4. close/unsubscribe that channel subscription with a resumable reason;
5. send no later `sync.delivery` for that `subscription_id`.

Control messages MUST NOT sit behind the full data queue. If the control message cannot be sent, the server closes the subscription; reconnect/resume remains authoritative.

The client keeps its already committed projection and retries from its own `last_applied_cursor`. It MUST NOT reset to H merely because the server overflowed. If that cursor has expired, the next attempt follows §11 and fetches a fresh snapshot.

A client-side pending/local queue overflow follows the same resume rule. Silent oldest/newest-event eviction is forbidden on both sides.

## 11. Cursor invalidity, expiry, and lease

### 11.1 HTTP behavior

| Condition | HTTP / code | Action | Retry rule |
|---|---|---|---|
| Malformed, forged, future, wrong-version, or wrong-channel cursor | `400 CURSOR_INVALID` | `update` or operator/client bug handling | Do not retry the same cursor automatically. Do not reveal which binding check failed. |
| Valid cursor older than retained channel journal | `410 CURSOR_EXPIRED` | `snapshot` | Fetch and atomically install a fresh snapshot; never guess a replacement cursor. |
| `through` is before `after`, not the subscription's B, or otherwise invalid | `400 CURSOR_RANGE_INVALID` | `resume` | Abort that attempt and create a new subscription from the current checkpoint. |
| Authentication missing/expired | `401 AUTH_REQUIRED` | `reauthorize` | Refresh/re-authenticate, then restart from the checkpoint if still authorized. |
| Current channel access absent | `403 ACCESS_REVOKED` | `reauthorize` | Purge as in §12; no automatic data retry. |
| Temporary server failure | `503 TEMPORARY_UNAVAILABLE` | `retry` | Use §13 backoff from the same committed checkpoint. |

A wrong-tenant/channel cursor MUST NOT produce a distinguishable success or leak cursor metadata. Servers MAY map it to the same non-disclosing `404` policy used for private channels, but successful cross-channel reuse is always forbidden.

### 11.2 Active handshake lease

When subscribe succeeds, the server guarantees that both `after_cursor` and B remain usable for the fixed delta until `lease_expires_at`, unless authorization is revoked. The implementation MUST pin required journal retention or provide equivalent stable range storage. Ordinary background retention MUST NOT make the cursor expire mid-lease.

If the client exceeds the catch-up/lease deadline, the server terminates with `HANDSHAKE_TIMEOUT`; a later HTTP call may return `CURSOR_EXPIRED`. The client resumes from its last committed checkpoint, falling back to a fresh snapshot only on `CURSOR_EXPIRED`.

A fresh snapshot is a replacement boundary, not a merge hint. Installing it clears obsolete pending items, obsolete subscription IDs, and dedupe state no longer needed by the new projection.

## 12. Authorization revoke and cache purge

Access revocation is a control-plane fence, not a durable event delivered to a principal after access has been removed.

When channel/workspace/session access is revoked, the server MUST:

1. establish a revocation fence for affected subscriptions;
2. atomically mark each subscription `TERMINATED` and purge every unsent durable frame in its queue;
3. stop channel fan-out and reject new subscribe, snapshot, delta, history, search, and file access;
4. emit `sync.revoked` with `purge: true` on the reserved control lane when possible, then remove the subscription; otherwise close the socket/subscription;
5. never send a durable envelope for that subscription after the revocation control fence.

Socket.IO's ordered connection ensures frames already written before the fence precede the revoke control. No frame may be queued after it for that subscription.

On `sync.revoked`, or on an equivalent `403 ACCESS_REVOKED` discovered during reconnect, the client MUST:

- cancel snapshot/delta requests and ignore all later frames for the subscription;
- purge channel messages, files/previews, search snippets, derived counts, cursors, dedupe records, pending out-of-order events, and sensitive notification content from local caches;
- mark locally queued commands as authorization failures and stop automatic retries;
- show a non-disclosing access-changed state;
- require explicit successful reauthorization before fetching the channel again.

The client MUST NOT treat `sync.revoked` as a canonical durable envelope: it has no `event_seq`, is not resumable channel history, and exists precisely because access to that history is gone.

A membership event for still-authorized recipients MAY remain a normal durable channel event under the separate projection/visibility contract. It does not replace the revoked principal's control message.

## 13. Retry and reconnect policy

Every retry starts from the last locally committed `last_applied_cursor`, never from the last packet received or transport-ACKed.

The client MUST:

1. allow at most one active attempt per channel replica;
2. cancel/ignore the old `subscription_id` before starting another attempt;
3. use full-jitter exponential backoff for retryable network, `TEMPORARY_UNAVAILABLE`, overflow, timeout, and subscription-loss failures:

```text
cap(attempt) = min(30000 ms, 250 ms * 2^attempt), attempt starting at 0
delay        = uniform integer in [0, cap(attempt)]
```

4. honor a server `retry_after_ms` by using at least that delay, capped at 60 seconds for automatic retries;
5. reset the attempt counter only after the channel has remained `LIVE` for 30 seconds;
6. refresh authentication before retrying `AUTH_REQUIRED`;
7. fetch a fresh snapshot only for `CURSOR_EXPIRED`, no usable local checkpoint, explicit local corruption, or `EVENT_ID_CONFLICT`/unsupported replica state;
8. never automatically retry `ACCESS_REVOKED`, `CURSOR_INVALID`, or `UNSUPPORTED_SCHEMA_VERSION` with the same inputs.

Retrying a subscribe operation creates a new `subscription_id` unless the server idempotently returns the still-active one for the same request. Retrying transport delivery does not create a new logical event. Retrying an HTTP command remains governed by the command's idempotency key and is independent of sync ACK/checkpoint state.

Reconnect order is:

```text
reauthenticate if needed
→ start subscription from last_applied_cursor
→ receive B
→ drain fixed delta through B
→ prove B applied
→ consume buffered range and live marker
→ resume queued commands only after authoritative catch-up policy permits
```

A reconnect MUST NOT send queued commands before the channel's authorization and authoritative state have been re-established if doing so could violate expected-version or permission behavior.

## 14. Protocol errors and fail-closed behavior

The following are protocol violations:

- unknown `schema_version` or unknown registered `event_type`;
- unknown top-level event-envelope fields;
- event identity conflict;
- tenant/channel mismatch between wrapper, envelope, authenticated context, or requested channel;
- non-canonical/unsafe `event_seq`;
- a forward cursor chain with decreasing/equal new event sequence;
- forked cursor chain (two different new events claiming the same `before_cursor` in one authorized stream);
- `sync.live` before the server has accepted barrier application;
- a live marker whose prior deliveries do not account through its cursor;
- a durable delivery after revoke/termination for the same subscription.

The client MUST stop applying that subscription, preserve diagnostics without sensitive payloads, and resume or fetch a fresh snapshot according to error class. It MUST NOT “best effort” ignore an unknown durable mutation, because that could make the local projection silently diverge.

## 15. Deterministic conformance suite

Conformance tests MUST use controllable latches/hooks, database transactions, a fake clock, and seeded delivery permutation. Tests MUST NOT use sleeps to guess that a boundary was crossed.

### 15.1 Required test hooks

A test implementation MUST be able to pause immediately after these linearization points:

```text
T0 snapshot consistent view and H captured
T1 snapshot response emitted
T2 subscription buffer installed (S)
T3 barrier B captured
T4 subscription-ready response emitted
T5 each delta page query view opened
T6 final reached_barrier response emitted
T7 barrier-applied request accepted
T8 flush cut F captured
T9 authoritative (B,F] reconciliation completed
T10 live marker enqueued / server state switched LIVE
T11 each delivery admitted to client queue
T12 each event+checkpoint local transaction committed
T13 transport ACK emitted
T14 revoke fence committed
```

A test-only hook need not exist in production binaries, but the same linearization points MUST be observable through an integration harness.

### 15.2 Canonical fixture

Use one tenant/channel with deterministic events `E0` through `E12`, stable IDs, and event sequences spanning the JavaScript-safe boundary, for example:

```text
9007199254740991
9007199254740992
9007199254740993
9007199254741000  # intentional legal gap
```

A fresh server snapshot at final boundary Z is the oracle. After quiescence, the incremental client at Z MUST have the same projection checksum. Each authorized `event_id` after the installed snapshot is logically applied exactly once and in ascending `event_seq`. Physical delivery count may be greater than one.

### 15.3 Boundary-race scenarios

| ID | Deterministic injection | Required result |
|---|---|---|
| `SYNC-B01` | Commit E0 before T0, then capture H. | E0 is reflected in snapshot H. It is not required as post-H delta. |
| `SYNC-B02` | Commit E1 after T1 but before T2 (snapshot returned, subscription not installed). | E1 is in fixed delta `(H,B]`; no miss. |
| `SYNC-B03` | Pause at T2, commit E2, deliver its outbox candidate, then allow T3. | E2 is owned by fixed delta because it is at/before B. A candidate duplicate is dropped or client-deduped; one logical apply. |
| `SYNC-B04` | Capture B at T3, commit E3 before T4. | E3 is absent from fixed delta and retained in the bounded buffer. |
| `SYNC-B05` | Use at least three delta pages; commit E4, E5, E6 at T5 for page 1, page 2, and final page. | All are after B, absent from every fixed page, and later delivered from reconciliation/buffer. |
| `SYNC-B06` | Commit E7 after T6 but before T7. | E7 remains buffered and is delivered after B; barrier completion does not drop it. |
| `SYNC-B07` | Accept barrier at T7, commit E8 before T8. | E8 is at/before F and appears in authoritative `(B,F]` reconciliation. |
| `SYNC-B08` | Capture F at T8, commit E9 during T9 before T10. | E9 is held as post-F and queued after `sync.live`; it is not lost between flush and live. |
| `SYNC-B09` | Commit E10 immediately before T10 and E11 immediately after T10. | Both arrive at least once in channel order after the live marker boundary rules; neither is omitted or applied twice. |
| `SYNC-B10` | Deliver E2 through delta and candidate buffer; retransmit E8 twice with two delivery IDs. | Physical duplicates are ACKed/admitted as applicable; each event mutates projection once by `event_id`. |
| `SYNC-B11` | Deliver live E11 before E10, then deliver E10 before `gap_timeout_ms`. | E11 is held, not applied; E10 applies first, then E11 drains. Final cursor/order is correct. |
| `SYNC-B12` | Deliver E11 without E10 until the gap timer expires. | Client terminates that subscription and resumes from its unchanged checkpoint; authoritative delta recovers both. |
| `SYNC-B13` | Crash client (a) after T11 before T12, (b) after T12 before T13, and (c) after T13 before T12 using separate runs. | (a) replay and apply once; (b) resume after committed cursor and do not reapply; (c) transport ACK did not advance cursor, so replay and apply once. |
| `SYNC-B14` | Overflow server at exactly `max_buffered_events + 1`, and separately exceed bytes first. | No data is silently evicted; terminal `BUFFER_OVERFLOW`/close occurs; retry from client checkpoint converges. Queue samples never exceed the configured bound. |
| `SYNC-B15` | Fill the client pending queue or local delivery queue to its bound. | Client does not send receipt for data it cannot retain, terminates, resumes, and converges. |
| `SYNC-B16` | Commit revoke at T14 separately during snapshot, before T3, each delta page, buffer flush, and live mode. | Snapshot/delta/subscription fails or terminates; unsent queue is purged; `sync.revoked`/close occurs; no post-fence durable delivery; client cache/cursor is purged. |
| `SYNC-B17` | Use a valid cursor after retention expiry; expire ordinary retention while an active handshake lease is still valid. | First case returns `410 CURSOR_EXPIRED` and fresh snapshot recovery. Second case continues through B; active lease prevents mid-handshake expiry. |
| `SYNC-B18` | Submit malformed, bit-flipped, future, other-channel, and other-tenant cursors. | Every attempt fails without data or binding disclosure; none succeeds by matching an internal sequence. |
| `SYNC-B19` | Lose outbox notifications for E7/E8 but keep journal rows; allow T9 reconciliation. | Both are recovered from PostgreSQL and delivered; notification loss creates no handoff gap. |
| `SYNC-B20` | Reuse one `event_id` with altered payload/sequence. | Client fails closed with `EVENT_ID_CONFLICT`; no second mutation; fresh snapshot/incident path is invoked. |
| `SYNC-B21` | Return an empty intermediate page and an empty final page under authorized no-op cursor advancement. | Client advances only to server `next_cursor` after processing the page; final completion requires `reached_barrier` and exact B. |
| `SYNC-B22` | Force retryable failures for attempts 0..n with a seeded RNG. | Delays fall within the exact full-jitter caps, only one active attempt exists, and the source is the committed checkpoint rather than a transport receipt. |
| `SYNC-B23` | Send a stale delivery from the superseded subscription after a new subscription starts. | Client ignores it by `subscription_id`; it cannot mutate projection or checkpoint. |
| `SYNC-B24` | Send unknown event type, extra envelope field, JSON-number sequence, and decimal sequence over `2^53`. | Invalid forms are rejected; the valid decimal string over `2^53` orders correctly without precision loss. |

### 15.4 Required assertions and artifacts

Every conformance run MUST assert and retain:

```text
final_incremental_checksum == fresh_snapshot_checksum_at_same_cursor
logical_apply_count(event_id) == 1 for every authorized event after H
applied_event_seq is strictly increasing under arbitrary-precision comparison
last_applied_cursor advances only with successful local projection commits or an authenticated no-op boundary
transport_ack_count has no effect on application checkpoint or command durability
server_buffer_events <= advertised max and server_buffer_bytes <= advertised max
post_revoke_delivery_count == 0
unauthorized_body_or_event_count == 0
active_subscription_count_per_client_channel <= 1
```

Artifacts include the seed, event/envelope schema version, exact latch schedule, H/B/F/Z cursors as opaque values, event IDs/sequences, physical deliveries, transport ACK timestamps, local-apply transaction timestamps, cursor transitions, queue depth/bytes, revoke fence, and retry delays. Payload bodies that contain user content MUST be redacted from logs.

## 16. Implementation checklist

AW-008/AW-011 implementations conform only when all items are true:

- [ ] Generated Zod, JSON Schema, and OpenAPI expose the exact canonical envelope and reject legacy aliases/unknown top-level fields.
- [ ] `event_seq` is a decimal string and tests include values above JavaScript's safe integer range plus legal gaps.
- [ ] Cursors are opaque, integrity-protected, tenant/channel-bound, independently authorized, and never constructed by clients.
- [ ] Snapshot state and `snapshot_cursor` come from one consistent view and install atomically with the local checkpoint.
- [ ] Server buffering is installed before B is captured.
- [ ] Fixed delta is bounded by explicit `through=B`, paged, stable, and pinned for the active lease.
- [ ] Server reconciles `(B,F]` from the durable journal before the serialized live marker.
- [ ] Overflow, timeout, gap, retry, cursor expiry, and revoke each have explicit machine-readable behavior.
- [ ] Transport ACK, barrier operation result, command acceptance, and `last_applied_cursor` are separate code paths and types.
- [ ] Client reducer/checkpoint/dedupe persistence is atomic and out-of-order application is blocked until continuity is restored.
- [ ] Revoke uses a control fence and local cache purge, not an unauthorized durable channel event.
- [ ] `SYNC-B01` through `SYNC-B24` pass deterministically without sleep-based race assumptions.

A plain “fetch snapshot, then subscribe after its high watermark” implementation, a server that starts buffering after returning B, an unbounded queue, or a client that resumes from transport ACK state is not Chat Sync Contract v1 compliant.
