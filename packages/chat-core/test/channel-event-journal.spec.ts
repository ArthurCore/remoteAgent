import { DurableEventV1 } from "@agent-workspace/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as channelEventJournalModule from "../src/modules/messaging/channel-event-journal.js";
import type {
  AppendChannelEventInput,
  AppendChannelEventResult,
  ChannelEventIntent,
  ChannelEventTransaction,
  TrustedChannelActor,
} from "../src/modules/messaging/channel-event-journal.js";

type DurableEvent = ReturnType<typeof DurableEventV1.parse>;
type EventType = DurableEvent["event_type"];
type ContractPayload<Event extends EventType> = Extract<
  DurableEvent,
  { event_type: Event }
>["payload"];
type IntentFor<Event extends EventType> = Extract<ChannelEventIntent, { eventType: Event }>;
type DeepReadonlyForTest<Value> = Value extends object
  ? { readonly [Key in keyof Value]: DeepReadonlyForTest<Value[Key]> }
  : Value;
type TestChannelActor =
  | Readonly<{ kind: "human" | "service"; principalId: string }>
  | Readonly<{ kind: "system"; principalId: "system:channel-lifecycle" }>;

function assertTrustedChannelActorForTest<const Actor extends TestChannelActor>(
  actor: Actor,
): Actor & TrustedChannelActor {
  return actor as Actor & TrustedChannelActor;
}

function expectIntent(intent: ChannelEventIntent, eventType: EventType): void {
  expect(intent.eventType).toBe(eventType);
  expect(Object.keys(intent)).toEqual(["eventType", "payload"]);
}

const joinedIntent = {
  eventType: "channel.member_joined",
  payload: {
    principal_id: "prn_404",
    membership_epoch: "mep_505",
    history_mode: "since_join",
  },
} satisfies ChannelEventIntent;

const callerInput = {
  tenantId: "ten_1",
  channelId: "chn_1",
  actor: assertTrustedChannelActorForTest({ kind: "human", principalId: "prn_303" }),
  intent: joinedIntent,
} satisfies AppendChannelEventInput;

function assertCompilerNegativeCoverage(transaction: ChannelEventTransaction): void {
  const deletedPayload = {
    message_id: "msg_negative",
    version: 2,
  } satisfies ContractPayload<"message.deleted">;
  const reactionPayload = {
    message_id: "msg_negative",
    reactor_principal_id: "prn_negative",
    reaction_key: "wave",
    present: true,
  } satisfies ContractPayload<"reaction.changed">;

  const badCreated: IntentFor<"message.created"> = {
    eventType: "message.created",
    // @ts-expect-error message.created cannot carry a member-joined payload
    payload: joinedIntent.payload,
  };
  const badEdited: IntentFor<"message.edited"> = {
    eventType: "message.edited",
    // @ts-expect-error message.edited cannot carry a member-joined payload
    payload: joinedIntent.payload,
  };
  const badDeleted: IntentFor<"message.deleted"> = {
    eventType: "message.deleted",
    // @ts-expect-error message.deleted cannot carry a member-joined payload
    payload: joinedIntent.payload,
  };
  const badReaction: IntentFor<"reaction.changed"> = {
    eventType: "reaction.changed",
    // @ts-expect-error reaction.changed cannot carry a member-joined payload
    payload: joinedIntent.payload,
  };
  const badJoined: IntentFor<"channel.member_joined"> = {
    eventType: "channel.member_joined",
    // @ts-expect-error channel.member_joined cannot carry a message-deleted payload
    payload: deletedPayload,
  };
  const badLeft: IntentFor<"channel.member_left"> = {
    eventType: "channel.member_left",
    // @ts-expect-error channel.member_left cannot carry a reaction-changed payload
    payload: reactionPayload,
  };
  const badRevoked: IntentFor<"channel.member_revoked"> = {
    eventType: "channel.member_revoked",
    // @ts-expect-error channel.member_revoked cannot carry a reaction-changed payload
    payload: reactionPayload,
  };
  void [badCreated, badEdited, badDeleted, badReaction, badJoined, badLeft, badRevoked];

  const humanLiteral = { kind: "human", principalId: "prn_forged" } as const;
  const serviceLiteral = { kind: "service", principalId: "svc_forged" } as const;
  const systemLiteral = {
    kind: "system",
    principalId: "system:channel-lifecycle",
  } as const;
  // @ts-expect-error an ordinary human literal lacks authenticated provenance
  const forgedHuman: TrustedChannelActor = humanLiteral;
  // @ts-expect-error an ordinary service literal lacks authenticated provenance
  const forgedService: TrustedChannelActor = serviceLiteral;
  // @ts-expect-error an ordinary system literal lacks authenticated provenance
  const forgedSystem: TrustedChannelActor = systemLiteral;
  void [forgedHuman, forgedService, forgedSystem];

  const trustedHuman = assertTrustedChannelActorForTest(humanLiteral);
  const trustedSystem = assertTrustedChannelActorForTest(systemLiteral);
  const unsupportedKind = { ...trustedHuman, kind: "bot" as const };
  const unsupportedSystem = { ...trustedSystem, principalId: "system:root" as const };
  // @ts-expect-error branded actors still cannot use an unsupported actor kind
  const badKind: TrustedChannelActor = unsupportedKind;
  // @ts-expect-error branded system actors still cannot use another principal
  const badSystem: TrustedChannelActor = unsupportedSystem;
  void [badKind, badSystem];

  const numericSequence = 1;
  // @ts-expect-error event sequences must remain bigint values
  const badSequence: AppendChannelEventResult["eventSeq"] = numericSequence;
  void badSequence;

  const widerInputWithServerEnvelope = {
    ...callerInput,
    schemaVersion: 1,
    eventSeq: 1n,
    eventId: "evt_caller_owned",
    occurredAt: "2026-08-25T12:34:56Z",
  };
  // @ts-expect-error append rejects wider variables containing server-owned envelope fields
  void transaction.append(widerInputWithServerEnvelope);

  const readonlyIntent: IntentFor<"message.created"> = {
    eventType: "message.created",
    payload: {
      message_id: "msg_readonly",
      thread_root_id: null,
      version: 1,
      resolved_mention_principal_ids: ["prn_readonly"],
      resolved_mention_items: [{ principal_id: "prn_readonly", mention_item_id: "mit_readonly" }],
    },
  };
  // @ts-expect-error payload object properties are recursively readonly
  readonlyIntent.payload.message_id = "msg_mutated";
  // @ts-expect-error nested payload arrays are readonly
  readonlyIntent.payload.resolved_mention_principal_ids.push("prn_mutated");
  const [readonlyMentionItem] = readonlyIntent.payload.resolved_mention_items;
  if (readonlyMentionItem) {
    // @ts-expect-error nested payload array items are recursively readonly
    readonlyMentionItem.principal_id = "prn_mutated";
  }
}

void assertCompilerNegativeCoverage;

describe("AW010A-S1 correlated channel event journal port", () => {
  it("AW010A-S1 correlates message.created with its contract payload", () => {
    const intent = {
      eventType: "message.created",
      payload: {
        message_id: "msg_101",
        thread_root_id: null,
        version: 1,
        resolved_mention_principal_ids: ["prn_202"],
        resolved_mention_items: [{ principal_id: "prn_202", mention_item_id: "mit_202_101" }],
      },
    } satisfies ChannelEventIntent;

    expectTypeOf<IntentFor<"message.created">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"message.created">>
    >();
    expectIntent(intent, "message.created");
  });

  it("AW010A-S1 correlates message.edited with its contract payload", () => {
    const intent = {
      eventType: "message.edited",
      payload: {
        message_id: "msg_101",
        version: 2,
        resolved_mention_principal_ids: ["prn_202"],
        resolved_mention_items: [{ principal_id: "prn_202", mention_item_id: "mit_202_101" }],
      },
    } satisfies ChannelEventIntent;

    expectTypeOf<IntentFor<"message.edited">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"message.edited">>
    >();
    expectIntent(intent, "message.edited");
  });

  it("AW010A-S1 correlates message.deleted with its contract payload", () => {
    const intent = {
      eventType: "message.deleted",
      payload: { message_id: "msg_101", version: 3 },
    } satisfies ChannelEventIntent;

    expectTypeOf<IntentFor<"message.deleted">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"message.deleted">>
    >();
    expectIntent(intent, "message.deleted");
  });

  it("AW010A-S1 correlates reaction.changed with its contract payload", () => {
    const intent = {
      eventType: "reaction.changed",
      payload: {
        message_id: "msg_202",
        reactor_principal_id: "prn_303",
        reaction_key: "thumbs_up",
        present: true,
      },
    } satisfies ChannelEventIntent;

    expectTypeOf<IntentFor<"reaction.changed">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"reaction.changed">>
    >();
    expectIntent(intent, "reaction.changed");
  });

  it("AW010A-S1 correlates channel.member_joined with its contract payload", () => {
    expectTypeOf<IntentFor<"channel.member_joined">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"channel.member_joined">>
    >();
    expectIntent(joinedIntent, "channel.member_joined");
  });

  it("AW010A-S1 correlates channel.member_left with its contract payload", () => {
    const intent = {
      eventType: "channel.member_left",
      payload: {
        principal_id: "prn_404",
        membership_epoch: "mep_505",
        reason_code: "left",
      },
    } satisfies ChannelEventIntent;

    expectTypeOf<IntentFor<"channel.member_left">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"channel.member_left">>
    >();
    expectIntent(intent, "channel.member_left");
  });

  it("AW010A-S1 correlates channel.member_revoked with its contract payload", () => {
    const intent = {
      eventType: "channel.member_revoked",
      payload: {
        principal_id: "prn_606",
        membership_epoch: "mep_707",
        reason_code: "policy_revoked",
      },
    } satisfies ChannelEventIntent;

    expectTypeOf<IntentFor<"channel.member_revoked">["payload"]>().toEqualTypeOf<
      DeepReadonlyForTest<ContractPayload<"channel.member_revoked">>
    >();
    expectIntent(intent, "channel.member_revoked");
  });

  it("AW010A-S1 permits human/service principals and only system:channel-lifecycle", () => {
    const actors = [
      assertTrustedChannelActorForTest({ kind: "human", principalId: "prn_303" }),
      assertTrustedChannelActorForTest({ kind: "service", principalId: "svc_404" }),
      assertTrustedChannelActorForTest({
        kind: "system",
        principalId: "system:channel-lifecycle",
      }),
    ] satisfies readonly TrustedChannelActor[];

    expectTypeOf<TrustedChannelActor>().toMatchTypeOf<TestChannelActor>();
    expectTypeOf<TestChannelActor>().not.toMatchTypeOf<TrustedChannelActor>();
    expect(actors).toEqual([
      { kind: "human", principalId: "prn_303" },
      { kind: "service", principalId: "svc_404" },
      { kind: "system", principalId: "system:channel-lifecycle" },
    ]);
  });

  it("AW010A-S1 excludes every client-owned envelope field from append input", () => {
    expectTypeOf<keyof AppendChannelEventInput>().toEqualTypeOf<
      "tenantId" | "channelId" | "actor" | "intent"
    >();
    expect(Object.keys(callerInput)).toEqual(["tenantId", "channelId", "actor", "intent"]);
    expect(Object.keys(callerInput)).not.toEqual(
      expect.arrayContaining([
        "schema_version",
        "tenant_id",
        "channel_id",
        "event_seq",
        "event_id",
        "event_type",
        "payload",
        "occurred_at",
      ]),
    );
  });

  it("AW010A-S1 returns a bigint sequence without number conversion", async () => {
    expectTypeOf<AppendChannelEventResult>().toEqualTypeOf<
      Readonly<{ eventSeq: bigint; eventId: string; occurredAt: string }>
    >();

    const expectedSequence = 9_007_199_254_740_993n;
    const transaction: ChannelEventTransaction = {
      append: async () => ({
        eventSeq: expectedSequence,
        eventId: "evt_bigint",
        occurredAt: "2026-08-25T12:34:56Z",
      }),
    };

    const result = await transaction.append(callerInput);
    expect(result.eventSeq).toBe(expectedSequence);
    expect(typeof result.eventSeq).toBe("bigint");
  });

  it("AW010A-S1 keeps injected event ID and clock results on the caller-owned transaction", async () => {
    const receivedInputs: AppendChannelEventInput[] = [];
    const generateEventId = () => "evt_injected";
    const clock = () => "2026-08-25T12:34:56.123456Z";
    const transaction: ChannelEventTransaction = {
      append: async (input) => {
        receivedInputs.push(input);
        return {
          eventSeq: 41n,
          eventId: generateEventId(),
          occurredAt: clock(),
        };
      },
    };

    await expect(transaction.append(callerInput)).resolves.toEqual({
      eventSeq: 41n,
      eventId: "evt_injected",
      occurredAt: "2026-08-25T12:34:56.123456Z",
    });
    expect(receivedInputs).toEqual([callerInput]);
  });

  it("AW010A-S1 exposes append without begin or commit methods", () => {
    const transaction = {
      append: async (): Promise<AppendChannelEventResult> => ({
        eventSeq: 1n,
        eventId: "evt_1",
        occurredAt: "2026-08-25T12:34:56Z",
      }),
    } satisfies ChannelEventTransaction;

    expectTypeOf<keyof ChannelEventTransaction>().toEqualTypeOf<"append">();
    expect(Object.keys(transaction)).toEqual(["append"]);
    expect("begin" in transaction).toBe(false);
    expect("commit" in transaction).toBe(false);
    expect(Object.keys(channelEventJournalModule)).toEqual([]);
  });
});
