import { describe, expect, it } from "vitest";

import {
  ChannelMemberJoinedV1,
  ChannelMemberLeftV1,
  ChannelMemberRevokedV1,
  DurableEventV1,
  EventEnvelopeV1,
  MessageCreatedV1,
  MessageDeletedV1,
  MessageEditedV1,
  ReactionChangedV1,
} from "../src/events.js";

type Actor = {
  principal_id: string;
  kind: "human" | "service" | "system";
};

type EnvelopeOverrides = {
  schema_version?: number;
  event_id?: string;
  tenant_id?: string;
  channel_id?: string;
  event_seq?: string;
  actor?: Actor;
  occurred_at?: string;
};

function envelope(
  eventType: string,
  payload: Record<string, unknown>,
  overrides: EnvelopeOverrides = {},
) {
  return {
    schema_version: 1,
    event_id: "evt_1",
    tenant_id: "ten_1",
    channel_id: "chn_1",
    event_seq: "1",
    event_type: eventType,
    actor: { principal_id: "prn_303", kind: "human" } satisfies Actor,
    occurred_at: "2026-08-25T12:34:56Z",
    payload,
    ...overrides,
  };
}

const positiveFixtures = [
  {
    name: "message.created",
    schema: MessageCreatedV1,
    event: envelope("message.created", {
      message_id: "msg_101",
      thread_root_id: null,
      version: 1,
      resolved_mention_principal_ids: ["prn_202"],
      resolved_mention_items: [{ principal_id: "prn_202", mention_item_id: "mit_202_101" }],
    }),
  },
  {
    name: "message.edited",
    schema: MessageEditedV1,
    event: envelope(
      "message.edited",
      {
        message_id: "msg_101",
        version: 2,
        resolved_mention_principal_ids: ["prn_202"],
        resolved_mention_items: [{ principal_id: "prn_202", mention_item_id: "mit_202_101" }],
      },
      { event_id: "evt_2", event_seq: "2" },
    ),
  },
  {
    name: "message.deleted",
    schema: MessageDeletedV1,
    event: envelope(
      "message.deleted",
      { message_id: "msg_101", version: 3 },
      { event_id: "evt_3", event_seq: "3" },
    ),
  },
  {
    name: "reaction.changed",
    schema: ReactionChangedV1,
    event: envelope(
      "reaction.changed",
      {
        message_id: "msg_202",
        reactor_principal_id: "prn_303",
        reaction_key: "thumbs_up",
        present: true,
      },
      { event_id: "evt_4", event_seq: "4" },
    ),
  },
  {
    name: "channel.member_joined",
    schema: ChannelMemberJoinedV1,
    event: envelope(
      "channel.member_joined",
      {
        principal_id: "prn_404",
        membership_epoch: "mep_505",
        history_mode: "since_join",
      },
      { event_id: "evt_5", event_seq: "5" },
    ),
  },
  {
    name: "channel.member_left",
    schema: ChannelMemberLeftV1,
    event: envelope(
      "channel.member_left",
      {
        principal_id: "prn_404",
        membership_epoch: "mep_505",
        reason_code: "left",
      },
      { event_id: "evt_6", event_seq: "6" },
    ),
  },
  {
    name: "channel.member_revoked",
    schema: ChannelMemberRevokedV1,
    event: envelope(
      "channel.member_revoked",
      {
        principal_id: "prn_606",
        membership_epoch: "mep_707",
        reason_code: "policy_revoked",
      },
      { event_id: "evt_7", event_seq: "7" },
    ),
  },
] as const;

describe("seven-event durable union", () => {
  it.each(positiveFixtures)("accepts the canonical $name A0 fixture", ({ schema, event }) => {
    expect(schema.safeParse(event).success).toBe(true);
    expect(DurableEventV1.safeParse(event).success).toBe(true);
  });

  it.each(positiveFixtures)("closes the $name envelope and payload", ({ schema, event }) => {
    expect(schema.safeParse({ ...event, extra: true }).success).toBe(false);
    expect(schema.safeParse({ ...event, payload: { ...event.payload, extra: true } }).success).toBe(
      false,
    );
  });

  it("keeps the base envelope broad and out of the production durable union", () => {
    const futureEvent = envelope("future.event", { arbitrary: { nested: true } });

    expect(EventEnvelopeV1.safeParse(futureEvent).success).toBe(true);
    expect(DurableEventV1.safeParse(futureEvent).success).toBe(false);
  });

  it("defines exactly nine strict base-envelope fields with an object-record payload", () => {
    const base = envelope("message.created", { arbitrary: true });
    const parsed = EventEnvelopeV1.parse(base);

    expect(Object.keys(parsed)).toEqual([
      "schema_version",
      "event_id",
      "tenant_id",
      "channel_id",
      "event_seq",
      "event_type",
      "actor",
      "occurred_at",
      "payload",
    ]);
    expect(EventEnvelopeV1.safeParse({ ...base, extra: true }).success).toBe(false);
    expect(EventEnvelopeV1.safeParse({ ...base, payload: [] }).success).toBe(false);
    expect(EventEnvelopeV1.safeParse({ ...base, payload: null }).success).toBe(false);
  });
});

const parseNegativeFixtures = [
  {
    name: "created version is not literal one",
    candidate: envelope("message.created", {
      message_id: "msg_1",
      thread_root_id: null,
      version: 2,
      resolved_mention_principal_ids: [],
      resolved_mention_items: [],
    }),
    expectedIssue: { code: "invalid_value", path: ["payload", "version"] },
  },
  {
    name: "edited version exceeds the safe integer maximum",
    candidate: envelope("message.edited", {
      message_id: "msg_1",
      version: 9_007_199_254_740_992,
      resolved_mention_principal_ids: [],
      resolved_mention_items: [],
    }),
    expectedIssue: { code: "too_big", path: ["payload", "version"] },
  },
  {
    name: "mention principal IDs are duplicated",
    candidate: envelope("message.edited", {
      message_id: "msg_1",
      version: 2,
      resolved_mention_principal_ids: ["prn_1", "prn_1"],
      resolved_mention_items: [{ principal_id: "prn_1", mention_item_id: "mit_1" }],
    }),
    expectedIssue: {
      code: "custom",
      message: "resolved mention principal IDs must be distinct",
      path: ["payload", "resolved_mention_principal_ids"],
    },
  },
  {
    name: "mention principal sets do not match",
    candidate: envelope("message.created", {
      message_id: "msg_1",
      thread_root_id: null,
      version: 1,
      resolved_mention_principal_ids: ["prn_1"],
      resolved_mention_items: [{ principal_id: "prn_2", mention_item_id: "mit_2" }],
    }),
    expectedIssue: {
      code: "custom",
      message: "resolved mention principal sets must match exactly",
      path: ["payload", "resolved_mention_items"],
    },
  },
  {
    name: "mention item IDs are duplicated",
    candidate: envelope("message.edited", {
      message_id: "msg_1",
      version: 2,
      resolved_mention_principal_ids: ["prn_1", "prn_2"],
      resolved_mention_items: [
        { principal_id: "prn_1", mention_item_id: "mit_1" },
        { principal_id: "prn_2", mention_item_id: "mit_1" },
      ],
    }),
    expectedIssue: {
      code: "custom",
      message: "resolved mention item IDs must be distinct",
      path: ["payload", "resolved_mention_items"],
    },
  },
  {
    name: "discriminant and payload mismatch",
    candidate: envelope("message.edited", { message_id: "msg_1", version: 2 }),
    expectedIssue: {
      code: "invalid_type",
      path: ["payload", "resolved_mention_principal_ids"],
    },
  },
  {
    name: "unknown payload field",
    candidate: envelope("message.deleted", { message_id: "msg_1", version: 2, extra: true }),
    expectedIssue: { code: "unrecognized_keys", path: ["payload"] },
  },
  {
    name: "human actor and reactor mismatch",
    candidate: envelope(
      "reaction.changed",
      {
        message_id: "msg_1",
        reactor_principal_id: "prn_2",
        reaction_key: "thumbs_up",
        present: true,
      },
      { actor: { principal_id: "prn_1", kind: "human" } },
    ),
    expectedIssue: {
      code: "custom",
      message: "non-system actor principal must equal reactor principal",
      path: ["payload", "reactor_principal_id"],
    },
  },
  {
    name: "unknown join history mode",
    candidate: envelope("channel.member_joined", {
      principal_id: "prn_1",
      membership_epoch: "mep_1",
      history_mode: "recent",
    }),
    expectedIssue: { code: "invalid_value", path: ["payload", "history_mode"] },
  },
  {
    name: "revoked reason code is missing",
    candidate: envelope("channel.member_revoked", {
      principal_id: "prn_1",
      membership_epoch: "mep_1",
    }),
    expectedIssue: { code: "invalid_type", path: ["payload", "reason_code"] },
  },
  {
    name: "event sequence is not canonical",
    candidate: envelope(
      "message.deleted",
      { message_id: "msg_1", version: 2 },
      { event_seq: "01" },
    ),
    expectedIssue: { code: "invalid_format", path: ["event_seq"] },
  },
] as const;

describe("canonical context-free parse negatives", () => {
  it("contains all eleven A0 parse-phase fixtures", () => {
    expect(parseNegativeFixtures).toHaveLength(11);
  });

  it.each(parseNegativeFixtures)(
    "rejects $name for the intended issue",
    ({ candidate, expectedIssue }) => {
      const result = DurableEventV1.safeParse(candidate);

      expect(result.success).toBe(false);
      if (result.success) {
        return;
      }

      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining(expectedIssue)]),
      );
    },
  );

  it("accepts a non-null thread root ID", () => {
    const candidate = envelope("message.created", {
      message_id: "msg_1",
      thread_root_id: "msg_root",
      version: 1,
      resolved_mention_principal_ids: [],
      resolved_mention_items: [],
    });

    expect(DurableEventV1.safeParse(candidate).success).toBe(true);
  });

  it("accepts equal mention mappings independent of array order", () => {
    const candidate = envelope("message.edited", {
      message_id: "msg_1",
      version: 2,
      resolved_mention_principal_ids: ["prn_1", "prn_2"],
      resolved_mention_items: [
        { principal_id: "prn_2", mention_item_id: "mit_2" },
        { principal_id: "prn_1", mention_item_id: "mit_1" },
      ],
    });

    expect(DurableEventV1.safeParse(candidate).success).toBe(true);
  });

  it("rejects a service actor reacting for another principal", () => {
    const candidate = envelope(
      "reaction.changed",
      {
        message_id: "msg_1",
        reactor_principal_id: "prn_2",
        reaction_key: "thumbs_up",
        present: true,
      },
      { actor: { principal_id: "svc_1", kind: "service" } },
    );
    const result = DurableEventV1.safeParse(candidate);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "custom",
          message: "non-system actor principal must equal reactor principal",
          path: ["payload", "reactor_principal_id"],
        }),
      ]),
    );
  });

  it("rejects duplicate principal IDs in mention items independently of item-ID uniqueness", () => {
    const candidate = envelope("message.edited", {
      message_id: "msg_1",
      version: 2,
      resolved_mention_principal_ids: ["prn_1"],
      resolved_mention_items: [
        { principal_id: "prn_1", mention_item_id: "mit_1" },
        { principal_id: "prn_1", mention_item_id: "mit_2" },
      ],
    });

    expect(DurableEventV1.safeParse(candidate).success).toBe(false);
  });

  it("allows a system actor to perform a reaction change for another principal", () => {
    const candidate = envelope(
      "reaction.changed",
      {
        message_id: "msg_1",
        reactor_principal_id: "prn_2",
        reaction_key: "thumbs_up",
        present: true,
      },
      { actor: { principal_id: "system", kind: "system" } },
    );

    expect(DurableEventV1.safeParse(candidate).success).toBe(true);
  });
});

const statefulOnlyFixtures = [
  {
    name: "edit version six despite a hypothetical prior version four",
    candidate: envelope("message.edited", {
      message_id: "msg_1",
      version: 6,
      resolved_mention_principal_ids: [],
      resolved_mention_items: [],
    }),
  },
  {
    name: "join shape despite a hypothetically already-active principal",
    candidate: envelope("channel.member_joined", {
      principal_id: "prn_active",
      membership_epoch: "mep_fresh",
      history_mode: "full",
    }),
  },
  {
    name: "leave shape with a hypothetically wrong active epoch",
    candidate: envelope("channel.member_left", {
      principal_id: "prn_1",
      membership_epoch: "mep_wrong",
      reason_code: "left",
    }),
  },
  {
    name: "message target shape despite hypothetical cross-channel state",
    candidate: envelope("message.deleted", {
      message_id: "msg_in_other_channel",
      version: 2,
    }),
  },
] as const;

describe("stateful history boundaries", () => {
  it.each(statefulOnlyFixtures)("keeps $name parser-valid", ({ candidate }) => {
    expect(DurableEventV1.safeParse(candidate).success).toBe(true);
  });
});
