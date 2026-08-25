import { z } from "zod";

import { DurableEventV1 } from "./events.js";
import { CursorV1, OpaqueIdV1, UtcTimestampV1 } from "./primitives.js";

export const SyncItemV1 = z
  .object({
    before_cursor: CursorV1,
    cursor: CursorV1,
    event: DurableEventV1,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.before_cursor === value.cursor) {
      context.addIssue({
        code: "custom",
        message: "cursor must differ from before_cursor",
        path: ["cursor"],
      });
    }
  });

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

const DeltaItemsV1 = z
  .unknown()
  .refine((value) => !Array.isArray(value) || value.length <= 500, {
    abort: true,
    message: "items must contain at most 500 entries",
  })
  // Keep the array max so the A2b artifact handoff retains its maxItems constraint.
  .pipe(z.array(SyncItemV1).max(500));

export const DeltaResponseV1 = z
  .object({
    schema_version: z.literal(1),
    tenant_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
    from_cursor: CursorV1,
    through_cursor: CursorV1,
    items: DeltaItemsV1,
    next_cursor: CursorV1,
    reached_barrier: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.from_cursor === value.through_cursor && value.items.length > 0) {
      context.addIssue({
        code: "custom",
        message: "items must be empty when from_cursor equals through_cursor",
        path: ["items"],
      });
    }

    if (value.reached_barrier && value.next_cursor !== value.through_cursor) {
      context.addIssue({
        code: "custom",
        message: "next_cursor must equal through_cursor when reached_barrier is true",
        path: ["next_cursor"],
      });
    }

    if (!value.reached_barrier && value.next_cursor === value.from_cursor) {
      context.addIssue({
        code: "custom",
        message: "next_cursor must differ from from_cursor when reached_barrier is false",
        path: ["next_cursor"],
      });
    }

    let previousEventSeq: bigint | undefined;
    value.items.forEach((item, index) => {
      // DurableEventV1 has already validated this as a bounded canonical decimal.
      const currentEventSeq = BigInt(item.event.event_seq);

      if (item.event.tenant_id !== value.tenant_id) {
        context.addIssue({
          code: "custom",
          message: "item event tenant_id must equal response tenant_id",
          path: ["items", index, "event", "tenant_id"],
        });
      }

      if (item.event.channel_id !== value.channel_id) {
        context.addIssue({
          code: "custom",
          message: "item event channel_id must equal response channel_id",
          path: ["items", index, "event", "channel_id"],
        });
      }

      if (index === 0) {
        if (item.before_cursor !== value.from_cursor) {
          context.addIssue({
            code: "custom",
            message: "first item before_cursor must equal from_cursor",
            path: ["items", index, "before_cursor"],
          });
        }
        previousEventSeq = currentEventSeq;
        return;
      }

      const previousItem = value.items[index - 1];
      if (previousItem === undefined) {
        return;
      }

      if (previousEventSeq !== undefined && currentEventSeq <= previousEventSeq) {
        context.addIssue({
          code: "custom",
          message: "item event_seq must be greater than previous item event_seq",
          path: ["items", index, "event", "event_seq"],
        });
      }
      previousEventSeq = currentEventSeq;

      if (item.before_cursor !== previousItem.cursor) {
        context.addIssue({
          code: "custom",
          message: "item before_cursor must equal previous item cursor",
          path: ["items", index, "before_cursor"],
        });
      }
    });
  });

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
  .superRefine((value, context) => {
    if (value.barrier_cursor !== value.last_applied_cursor) {
      context.addIssue({
        code: "custom",
        message: "last_applied_cursor must equal barrier_cursor",
        path: ["last_applied_cursor"],
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
    code: z.enum(["BUFFER_OVERFLOW", "HANDSHAKE_TIMEOUT", "SUBSCRIPTION_LOST", "PROTOCOL_GAP"]),
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

export const SyncUnsubscribeV1 = z
  .object({
    schema_version: z.literal(1),
    subscription_id: OpaqueIdV1,
    channel_id: OpaqueIdV1,
  })
  .strict();
