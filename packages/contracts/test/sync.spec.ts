import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  BarrierAppliedResultV1,
  DeltaResponseV1,
  snapshotResponseV1,
  SubscribeResultV1,
  SyncBarrierAppliedV1,
  SyncDeliveryV1,
  SyncErrorCodeV1,
  SyncErrorV1,
  SyncItemV1,
  SyncLimitsV1,
  SyncLiveV1,
  SyncResyncRequiredV1,
  SyncRevokedV1,
  SyncSubscribeV1,
  SyncSubscriptionReadyV1,
  SyncUnsubscribeV1,
  TransportAckV1,
} from "../src/sync.js";

const tenantId = "ten_1";
const channelId = "chn_1";
const occurredAt = "2026-08-25T12:34:56Z";

function durableEvent(
  sequence: number | string = 1,
  overrides: { tenant_id?: string; channel_id?: string } = {},
) {
  return {
    schema_version: 1,
    event_id: `evt_${sequence}`,
    tenant_id: tenantId,
    channel_id: channelId,
    event_seq: String(sequence),
    event_type: "message.deleted",
    actor: { principal_id: "prn_1", kind: "human" },
    occurred_at: occurredAt,
    payload: { message_id: `msg_${sequence}`, version: 2 },
    ...overrides,
  };
}

function syncItem(sequence: number | string = 1, beforeCursor = "cur_0", cursor = "cur_1") {
  return {
    before_cursor: beforeCursor,
    cursor,
    event: durableEvent(sequence),
  };
}

const limits = {
  max_buffered_events: 500,
  max_buffered_bytes: 1_048_576,
  catchup_timeout_ms: 30_000,
  gap_timeout_ms: 5_000,
};

const subscribe = {
  schema_version: 1,
  request_id: "req_1",
  channel_id: channelId,
  after_cursor: "cur_0",
};

const ready = {
  schema_version: 1,
  request_id: "req_1",
  subscription_id: "sub_1",
  tenant_id: tenantId,
  channel_id: channelId,
  after_cursor: "cur_0",
  barrier_cursor: "cur_2",
  lease_expires_at: "2026-08-25T12:39:56Z",
  limits,
};

const barrierApplied = {
  schema_version: 1,
  subscription_id: "sub_1",
  channel_id: channelId,
  barrier_cursor: "cur_2",
  last_applied_cursor: "cur_2",
};

const delivery = {
  schema_version: 1,
  subscription_id: "sub_1",
  delivery_id: "del_1",
  phase: "buffered",
  item: syncItem(),
};

const transportAck = {
  schema_version: 1,
  subscription_id: "sub_1",
  delivery_id: "del_1",
  status: "received",
};

const live = {
  schema_version: 1,
  subscription_id: "sub_1",
  channel_id: channelId,
  live_cursor: "cur_2",
};

const resyncRequired = {
  schema_version: 1,
  subscription_id: "sub_1",
  channel_id: channelId,
  code: "BUFFER_OVERFLOW",
  action: "resume",
  retry_after_ms: 0,
};

const revoked = {
  schema_version: 1,
  subscription_id: "sub_1",
  tenant_id: tenantId,
  channel_id: channelId,
  code: "ACCESS_REVOKED",
  purge: true,
  occurred_at: occurredAt,
};

const syncError = {
  schema_version: 1,
  code: "TEMPORARY_UNAVAILABLE",
  action: "retry",
  retryable: true,
  correlation_id: "cor_1",
};

const unsubscribe = {
  schema_version: 1,
  subscription_id: "sub_1",
  channel_id: channelId,
};

const delta = {
  schema_version: 1,
  tenant_id: tenantId,
  channel_id: channelId,
  from_cursor: "cur_0",
  through_cursor: "cur_2",
  items: [syncItem(1, "cur_0", "cur_1"), syncItem(2, "cur_1", "cur_2")],
  next_cursor: "cur_2",
  reached_barrier: true,
};

const snapshotState = z
  .object({
    messages: z.array(z.object({ message_id: z.string() }).strict()),
  })
  .strict();
const SnapshotResponseV1 = snapshotResponseV1(snapshotState);
const snapshot = {
  schema_version: 1,
  tenant_id: tenantId,
  channel_id: channelId,
  snapshot_id: "snp_1",
  snapshot_cursor: "cur_2",
  generated_at: occurredAt,
  state: { messages: [{ message_id: "msg_1" }] },
};

const subscribeSuccess = { ok: true, value: ready };
const subscribeFailure = { ok: false, error: syncError };
const barrierSuccess = {
  ok: true,
  value: { schema_version: 1, subscription_id: "sub_1", state: "flushing" },
};
const barrierFailure = { ok: false, error: syncError };

function addTopLevelAlias(
  value: Record<string, unknown>,
  canonical: string,
  alias: string,
): Record<string, unknown> {
  return { ...value, [alias]: value[canonical] };
}

function expectIssue(
  schema: z.ZodType,
  candidate: unknown,
  expectedIssue: { code?: string; message?: string; path: readonly PropertyKey[] },
): void {
  const result = schema.safeParse(candidate);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues).toEqual(
    expect.arrayContaining([expect.objectContaining(expectedIssue)]),
  );
}

function expectUnrecognizedKeys(
  schema: z.ZodType,
  candidate: unknown,
  keys: readonly string[],
  path: readonly PropertyKey[] = [],
): void {
  const result = schema.safeParse(candidate);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "unrecognized_keys", keys: [...keys], path }),
    ]),
  );
}

describe("sync v1 exported runtime surface", () => {
  const validObjectSchemas = [
    { name: "SyncItemV1", schema: SyncItemV1, candidate: syncItem() },
    { name: "snapshotResponseV1 factory", schema: SnapshotResponseV1, candidate: snapshot },
    { name: "DeltaResponseV1", schema: DeltaResponseV1, candidate: delta },
    { name: "SyncLimitsV1", schema: SyncLimitsV1, candidate: limits },
    { name: "SyncSubscribeV1", schema: SyncSubscribeV1, candidate: subscribe },
    { name: "SyncSubscriptionReadyV1", schema: SyncSubscriptionReadyV1, candidate: ready },
    { name: "SyncBarrierAppliedV1", schema: SyncBarrierAppliedV1, candidate: barrierApplied },
    { name: "SyncDeliveryV1", schema: SyncDeliveryV1, candidate: delivery },
    { name: "TransportAckV1", schema: TransportAckV1, candidate: transportAck },
    { name: "SyncLiveV1", schema: SyncLiveV1, candidate: live },
    { name: "SyncResyncRequiredV1", schema: SyncResyncRequiredV1, candidate: resyncRequired },
    { name: "SyncRevokedV1", schema: SyncRevokedV1, candidate: revoked },
    { name: "SyncErrorV1", schema: SyncErrorV1, candidate: syncError },
    { name: "SubscribeResultV1 success", schema: SubscribeResultV1, candidate: subscribeSuccess },
    { name: "SubscribeResultV1 failure", schema: SubscribeResultV1, candidate: subscribeFailure },
    {
      name: "BarrierAppliedResultV1 success",
      schema: BarrierAppliedResultV1,
      candidate: barrierSuccess,
    },
    {
      name: "BarrierAppliedResultV1 failure",
      schema: BarrierAppliedResultV1,
      candidate: barrierFailure,
    },
    { name: "SyncUnsubscribeV1", schema: SyncUnsubscribeV1, candidate: unsubscribe },
  ];

  it.each(validObjectSchemas)("strictly parses a valid $name value", ({ schema, candidate }) => {
    expect(schema.safeParse(candidate).success).toBe(true);
  });

  it.each(validObjectSchemas)("rejects a top-level extra on $name", ({ schema, candidate }) => {
    expect(schema.safeParse({ ...candidate, unexpected: true }).success).toBe(false);
  });

  const legacyAliasFixtures = [
    {
      name: "SyncItemV1.before_cursor",
      schema: SyncItemV1,
      candidate: addTopLevelAlias(syncItem(), "before_cursor", "before"),
      alias: "before",
    },
    {
      name: "snapshotResponseV1.snapshot_cursor",
      schema: SnapshotResponseV1,
      candidate: addTopLevelAlias(snapshot, "snapshot_cursor", "cursor"),
      alias: "cursor",
    },
    {
      name: "DeltaResponseV1.items",
      schema: DeltaResponseV1,
      candidate: addTopLevelAlias(delta, "items", "events"),
      alias: "events",
    },
    {
      name: "SyncLimitsV1.max_buffered_events",
      schema: SyncLimitsV1,
      candidate: addTopLevelAlias(limits, "max_buffered_events", "maxBufferedEvents"),
      alias: "maxBufferedEvents",
    },
    {
      name: "SyncSubscribeV1.after_cursor",
      schema: SyncSubscribeV1,
      candidate: addTopLevelAlias(subscribe, "after_cursor", "cursor"),
      alias: "cursor",
    },
    {
      name: "SyncSubscriptionReadyV1.barrier_cursor",
      schema: SyncSubscriptionReadyV1,
      candidate: addTopLevelAlias(ready, "barrier_cursor", "barrier"),
      alias: "barrier",
    },
    {
      name: "SyncBarrierAppliedV1.last_applied_cursor",
      schema: SyncBarrierAppliedV1,
      candidate: addTopLevelAlias(barrierApplied, "last_applied_cursor", "applied_cursor"),
      alias: "applied_cursor",
    },
    {
      name: "SyncDeliveryV1.item",
      schema: SyncDeliveryV1,
      candidate: addTopLevelAlias(delivery, "item", "event"),
      alias: "event",
    },
    {
      name: "TransportAckV1.status",
      schema: TransportAckV1,
      candidate: addTopLevelAlias(transportAck, "status", "ack"),
      alias: "ack",
    },
    {
      name: "SyncLiveV1.live_cursor",
      schema: SyncLiveV1,
      candidate: addTopLevelAlias(live, "live_cursor", "cursor"),
      alias: "cursor",
    },
    {
      name: "SyncResyncRequiredV1.code",
      schema: SyncResyncRequiredV1,
      candidate: addTopLevelAlias(resyncRequired, "code", "reason"),
      alias: "reason",
    },
    {
      name: "SyncRevokedV1.occurred_at",
      schema: SyncRevokedV1,
      candidate: addTopLevelAlias(revoked, "occurred_at", "revoked_at"),
      alias: "revoked_at",
    },
    {
      name: "SyncErrorV1.correlation_id",
      schema: SyncErrorV1,
      candidate: addTopLevelAlias(syncError, "correlation_id", "request_id"),
      alias: "request_id",
    },
    {
      name: "SubscribeResultV1.ok",
      schema: SubscribeResultV1,
      candidate: addTopLevelAlias(subscribeSuccess, "ok", "success"),
      alias: "success",
    },
    {
      name: "BarrierAppliedResultV1.ok",
      schema: BarrierAppliedResultV1,
      candidate: addTopLevelAlias(barrierSuccess, "ok", "success"),
      alias: "success",
    },
    {
      name: "SyncUnsubscribeV1.subscription_id",
      schema: SyncUnsubscribeV1,
      candidate: addTopLevelAlias(unsubscribe, "subscription_id", "subscriptionId"),
      alias: "subscriptionId",
    },
  ];

  it.each(legacyAliasFixtures)(
    "rejects the legacy alias for $name as an unrecognized key",
    ({ schema, candidate, alias }) => {
      expectUnrecognizedKeys(schema, candidate, [alias]);
    },
  );

  it("leaves snapshot state strictness to the caller-supplied schema", () => {
    const callerOpenState = snapshotResponseV1(z.object({ messages: z.array(z.string()) }));
    const callerStrictState = snapshotResponseV1(
      z.object({ messages: z.array(z.string()) }).strict(),
    );
    const candidate = {
      ...snapshot,
      state: { messages: ["msg_1"], caller_extension: true },
    };

    expect(callerOpenState.safeParse(candidate).success).toBe(true);
    expect(callerStrictState.safeParse(candidate).success).toBe(false);
  });

  it("preserves caller snapshot transform input and output types", () => {
    const transformedState = z.string().transform((value) => value.length);
    const TransformedSnapshotResponseV1 = snapshotResponseV1(transformedState);

    expectTypeOf<z.input<typeof TransformedSnapshotResponseV1>["state"]>().toEqualTypeOf<string>();
    expectTypeOf<z.output<typeof TransformedSnapshotResponseV1>["state"]>().toEqualTypeOf<number>();

    expect(TransformedSnapshotResponseV1.parse({ ...snapshot, state: "message" }).state).toBe(7);
  });
});

describe("SyncItemV1 production event and local invariants", () => {
  it("accepts an exact registered durable event", () => {
    expect(SyncItemV1.safeParse(syncItem()).success).toBe(true);
  });

  it("rejects an event accepted only by the broad base envelope", () => {
    const futureEvent = {
      ...durableEvent(),
      event_type: "future.event",
      payload: { arbitrary: { nested: true } },
    };

    expect(SyncItemV1.safeParse({ ...syncItem(), event: futureEvent }).success).toBe(false);
  });

  it("rejects identical before and after cursors at the cursor path", () => {
    expectIssue(SyncItemV1, syncItem(1, "same_cursor", "same_cursor"), {
      code: "custom",
      message: "cursor must differ from before_cursor",
      path: ["cursor"],
    });
  });
});

describe("snapshot and fixed-range delta parser-local invariants", () => {
  it("accepts exactly 500 chained items and rejects 501 at the items path", () => {
    const items500 = Array.from({ length: 500 }, (_, index) =>
      syncItem(index + 1, `cur_${index}`, `cur_${index + 1}`),
    );
    const atLimit = {
      ...delta,
      through_cursor: "cur_500",
      items: items500,
      next_cursor: "cur_500",
    };
    const overLimit = {
      ...atLimit,
      through_cursor: "cur_501",
      items: [...items500, syncItem(501, "cur_500", "cur_501")],
      next_cursor: "cur_501",
    };

    expect(DeltaResponseV1.safeParse(atLimit).success).toBe(true);
    expectIssue(DeltaResponseV1, overLimit, {
      code: "custom",
      message: "items must contain at most 500 entries",
      path: ["items"],
    });
  });

  it("rejects an oversized semantically invalid page before parsing child items", () => {
    const semanticallyInvalidItems = Array.from({ length: 5_000 }, (_, index) => ({
      ...syncItem(1, `disconnected_${index}`, `cursor_${index}`),
      event: durableEvent(1, { tenant_id: "ten_other", channel_id: "chn_other" }),
    }));
    const result = DeltaResponseV1.safeParse({ ...delta, items: semanticallyInvalidItems });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual([
      {
        code: "custom",
        message: "items must contain at most 500 entries",
        path: ["items"],
      },
    ]);
  });

  it("accepts ascending arbitrary-precision event sequences", () => {
    expect(
      DeltaResponseV1.safeParse({
        ...delta,
        items: [
          syncItem("9007199254740992", "cur_0", "cur_1"),
          syncItem("9007199254740993", "cur_1", "cur_2"),
        ],
      }).success,
    ).toBe(true);
  });

  const invalidDeltaFixtures = [
    {
      name: "a reached barrier whose next cursor is not the through cursor",
      candidate: { ...delta, next_cursor: "cur_other" },
      expectedIssue: {
        message: "next_cursor must equal through_cursor when reached_barrier is true",
        path: ["next_cursor"],
      },
    },
    {
      name: "a non-progressing partial page",
      candidate: { ...delta, reached_barrier: false, next_cursor: delta.from_cursor },
      expectedIssue: {
        message: "next_cursor must differ from from_cursor when reached_barrier is false",
        path: ["next_cursor"],
      },
    },
    {
      name: "an item from another tenant",
      candidate: {
        ...delta,
        items: [
          syncItem(1, "cur_0", "cur_1"),
          { ...syncItem(2, "cur_1", "cur_2"), event: durableEvent(2, { tenant_id: "ten_2" }) },
        ],
      },
      expectedIssue: {
        message: "item event tenant_id must equal response tenant_id",
        path: ["items", 1, "event", "tenant_id"],
      },
    },
    {
      name: "an item from another channel",
      candidate: {
        ...delta,
        items: [
          { ...syncItem(1), event: durableEvent(1, { channel_id: "chn_2" }) },
          syncItem(2, "cur_1", "cur_2"),
        ],
      },
      expectedIssue: {
        message: "item event channel_id must equal response channel_id",
        path: ["items", 0, "event", "channel_id"],
      },
    },
    {
      name: "a first item disconnected from from_cursor",
      candidate: {
        ...delta,
        items: [syncItem(1, "cur_wrong", "cur_1"), syncItem(2, "cur_1", "cur_2")],
      },
      expectedIssue: {
        message: "first item before_cursor must equal from_cursor",
        path: ["items", 0, "before_cursor"],
      },
    },
    {
      name: "a later item disconnected from the previous item cursor",
      candidate: {
        ...delta,
        items: [syncItem(1, "cur_0", "cur_1"), syncItem(2, "cur_wrong", "cur_2")],
      },
      expectedIssue: {
        message: "item before_cursor must equal previous item cursor",
        path: ["items", 1, "before_cursor"],
      },
    },
    {
      name: "equal adjacent event sequences",
      candidate: {
        ...delta,
        items: [syncItem(1, "cur_0", "cur_1"), syncItem(1, "cur_1", "cur_2")],
      },
      expectedIssue: {
        message: "item event_seq must be greater than previous item event_seq",
        path: ["items", 1, "event", "event_seq"],
      },
    },
    {
      name: "descending arbitrary-precision adjacent event sequences",
      candidate: {
        ...delta,
        items: [
          syncItem("9007199254740993", "cur_0", "cur_1"),
          syncItem("9007199254740992", "cur_1", "cur_2"),
        ],
      },
      expectedIssue: {
        message: "item event_seq must be greater than previous item event_seq",
        path: ["items", 1, "event", "event_seq"],
      },
    },
    {
      name: "an item in a byte-equal empty range",
      candidate: {
        ...delta,
        from_cursor: "same_cursor",
        through_cursor: "same_cursor",
        items: [syncItem(1, "same_cursor", "item_cursor")],
        next_cursor: "same_cursor",
      },
      expectedIssue: {
        message: "items must be empty when from_cursor equals through_cursor",
        path: ["items"],
      },
    },
  ] as const;

  it.each(invalidDeltaFixtures)(
    "rejects $name with the intended issue path",
    ({ candidate, expectedIssue }) => {
      expectIssue(DeltaResponseV1, candidate, { code: "custom", ...expectedIssue });
    },
  );

  it.each([
    {
      name: "empty trailing no-op partial page",
      candidate: {
        ...delta,
        from_cursor: "z_cursor",
        through_cursor: "a_cursor",
        items: [],
        next_cursor: "m_cursor",
        reached_barrier: false,
      },
    },
    {
      name: "one-item trailing no-op partial page",
      candidate: {
        ...delta,
        from_cursor: "z_cursor",
        through_cursor: "a_cursor",
        items: [syncItem(1, "z_cursor", "x_cursor")],
        next_cursor: "m_cursor",
        reached_barrier: false,
      },
    },
    {
      name: "empty completed range",
      candidate: {
        ...delta,
        from_cursor: "same_cursor",
        through_cursor: "same_cursor",
        items: [],
        next_cursor: "same_cursor",
        reached_barrier: true,
      },
    },
  ])("accepts an opaque-cursor $name", ({ candidate }) => {
    expect(DeltaResponseV1.safeParse(candidate).success).toBe(true);
  });
});

describe("barrier, delivery, and transport acknowledgement boundaries", () => {
  it("requires barrier_cursor to equal last_applied_cursor", () => {
    expectIssue(
      SyncBarrierAppliedV1,
      { ...barrierApplied, last_applied_cursor: "cur_1" },
      {
        code: "custom",
        message: "last_applied_cursor must equal barrier_cursor",
        path: ["last_applied_cursor"],
      },
    );
  });

  it.each(["buffered", "live"] as const)("accepts the %s delivery phase", (phase) => {
    expect(SyncDeliveryV1.safeParse({ ...delivery, phase }).success).toBe(true);
  });

  it("keeps transport receipt distinct from the application checkpoint", () => {
    expectUnrecognizedKeys(TransportAckV1, { ...transportAck, last_applied_cursor: "cur_1" }, [
      "last_applied_cursor",
    ]);
    expectUnrecognizedKeys(
      SyncBarrierAppliedV1,
      { ...barrierApplied, delivery_id: "del_1", status: "received" },
      ["delivery_id", "status"],
    );
  });
});

describe("limits, enums, errors, results, and unsubscribe", () => {
  it.each(Object.keys(limits))("requires %s to be a positive integer", (field) => {
    for (const invalid of [0, -1, 1.5]) {
      expect(SyncLimitsV1.safeParse({ ...limits, [field]: invalid }).success).toBe(false);
    }
  });

  it.each(["BUFFER_OVERFLOW", "HANDSHAKE_TIMEOUT", "SUBSCRIPTION_LOST", "PROTOCOL_GAP"] as const)(
    "accepts the %s resync code",
    (code) => {
      expect(SyncResyncRequiredV1.safeParse({ ...resyncRequired, code }).success).toBe(true);
    },
  );

  const errorCodes = [
    "AUTH_REQUIRED",
    "ACCESS_REVOKED",
    "CURSOR_INVALID",
    "CURSOR_EXPIRED",
    "CURSOR_RANGE_INVALID",
    "BARRIER_MISMATCH",
    "SUBSCRIPTION_NOT_FOUND",
    "UNSUPPORTED_SCHEMA_VERSION",
    "TEMPORARY_UNAVAILABLE",
  ] as const;

  it.each(errorCodes)("accepts the %s sync error code", (code) => {
    expect(SyncErrorCodeV1.safeParse(code).success).toBe(true);
    expect(SyncErrorV1.safeParse({ ...syncError, code }).success).toBe(true);
  });

  it.each(["retry", "resume", "snapshot", "reauthorize", "update"] as const)(
    "accepts the %s sync error action",
    (action) => {
      expect(SyncErrorV1.safeParse({ ...syncError, action }).success).toBe(true);
    },
  );

  it("supports an omitted or nonnegative retry_after_ms and rejects negative retry delay", () => {
    expect(SyncErrorV1.safeParse(syncError).success).toBe(true);
    expect(SyncErrorV1.safeParse({ ...syncError, retry_after_ms: 0 }).success).toBe(true);
    expect(SyncErrorV1.safeParse({ ...syncError, retry_after_ms: 1000 }).success).toBe(true);
    expect(SyncErrorV1.safeParse({ ...syncError, retry_after_ms: -1 }).success).toBe(false);
  });

  it("enforces subscribe result discriminants and branch shapes", () => {
    expect(SubscribeResultV1.safeParse(subscribeSuccess).success).toBe(true);
    expect(SubscribeResultV1.safeParse(subscribeFailure).success).toBe(true);
    expectUnrecognizedKeys(SubscribeResultV1, { ...subscribeSuccess, error: syncError }, ["error"]);
    expectUnrecognizedKeys(SubscribeResultV1, { ...subscribeFailure, value: ready }, ["value"]);
    expectUnrecognizedKeys(
      SubscribeResultV1,
      { ok: true, value: { ...ready, unexpected: true } },
      ["unexpected"],
      ["value"],
    );
  });

  it("enforces barrier-applied result discriminants and strict nested values", () => {
    expect(BarrierAppliedResultV1.safeParse(barrierSuccess).success).toBe(true);
    expect(BarrierAppliedResultV1.safeParse(barrierFailure).success).toBe(true);
    expectUnrecognizedKeys(BarrierAppliedResultV1, { ...barrierSuccess, error: syncError }, [
      "error",
    ]);
    expectUnrecognizedKeys(
      BarrierAppliedResultV1,
      { ...barrierFailure, value: barrierSuccess.value },
      ["value"],
    );
    expectUnrecognizedKeys(
      BarrierAppliedResultV1,
      { ok: true, value: { ...barrierSuccess.value, unexpected: true } },
      ["unexpected"],
      ["value"],
    );
  });

  it("keeps unsubscribe to exactly schema, subscription, and channel IDs", () => {
    expect(SyncUnsubscribeV1.parse(unsubscribe)).toEqual(unsubscribe);
    expect(SyncUnsubscribeV1.safeParse({ ...unsubscribe, extra: true }).success).toBe(false);
    expect(SyncUnsubscribeV1.safeParse({ ...unsubscribe, request_id: "req_1" }).success).toBe(
      false,
    );
  });
});
