import type {
  AppendChannelEventInput,
  ChannelEventIntent,
  TrustedChannelActor,
} from "@agent-workspace/chat-core";
import { describe, expect, it, vi } from "vitest";

import {
  PostgresChannelEventJournalError,
  createPostgresChannelEventTransaction,
  type ChannelEventJournalTransactionClient,
} from "../src/adapters/postgres/channel-event-journal.adapter.js";

const ACTOR_SQL = `SELECT principal_kind::text AS principal_kind
FROM public.principals
WHERE tenant_id = $1
  AND principal_id = $2
FOR SHARE`;

const STATE_SQL = `SELECT last_event_seq::text AS last_event_seq
FROM public.channel_event_sequences
WHERE tenant_id = $1
  AND channel_id = $2
FOR UPDATE`;

const UPDATE_SQL = `UPDATE public.channel_event_sequences
SET last_event_seq = last_event_seq + 1
WHERE tenant_id = $1
  AND channel_id = $2
  AND last_event_seq = $3::bigint
  AND last_event_seq < 9223372036854775807::bigint
RETURNING last_event_seq::text AS event_seq`;

const INSERT_SQL = `INSERT INTO public.channel_events (
  tenant_id,
  channel_id,
  event_seq,
  event_id,
  schema_version,
  event_type,
  actor_principal_id,
  actor_kind,
  occurred_at,
  payload
)
VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10::jsonb)
RETURNING event_seq::text AS event_seq, event_id`;

const TENANT_ID = "ten_s6";
const CHANNEL_ID = "chn_s6";
const PRINCIPAL_ID = "prn_s6";
const EVENT_ID = "evt_s6";
const OCCURRED_AT = "2026-08-25T12:34:56.123456Z";
const MAX_PG_BIGINT = "9223372036854775807";

type QueryRow = Readonly<Record<string, unknown>>;
type QueryResult = Readonly<{ rows: readonly QueryRow[]; rowCount: number }>;
type RecordedQuery = Readonly<{ statement: string; values: readonly unknown[] }>;
type ActorLiteral =
  | Readonly<{ kind: "human" | "service"; principalId: string }>
  | Readonly<{ kind: "system"; principalId: "system:channel-lifecycle" }>;

function trustedActor<const Actor extends ActorLiteral>(actor: Actor): Actor & TrustedChannelActor {
  return actor as Actor & TrustedChannelActor;
}

const HUMAN_ACTOR = trustedActor({ kind: "human", principalId: PRINCIPAL_ID });
const SYSTEM_ACTOR = trustedActor({
  kind: "system",
  principalId: "system:channel-lifecycle",
});

const CREATED_INTENT = {
  eventType: "message.created",
  payload: {
    message_id: "msg_s6",
    thread_root_id: null,
    version: 1,
    resolved_mention_principal_ids: ["prn_mentioned_s6"],
    resolved_mention_items: [{ principal_id: "prn_mentioned_s6", mention_item_id: "mit_s6" }],
  },
} satisfies ChannelEventIntent;

function queryResult(rows: readonly QueryRow[], rowCount = rows.length): QueryResult {
  return { rows, rowCount };
}

class FakeTransaction implements ChannelEventJournalTransactionClient {
  readonly queries: RecordedQuery[] = [];
  readonly #responses: QueryResult[];
  readonly #onQuery: ((statement: string) => void) | undefined;

  constructor(responses: readonly QueryResult[], onQuery?: (statement: string) => void) {
    this.#responses = [...responses];
    this.#onQuery = onQuery;
  }

  async query(statement: string, values: readonly unknown[]): Promise<QueryResult> {
    this.queries.push({ statement, values: [...values] });
    this.#onQuery?.(statement);
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error("FakeTransaction received an unexpected query");
    }
    return response;
  }

  get remainingResponses(): number {
    return this.#responses.length;
  }
}

function makeInput(
  options: Readonly<{
    tenantId?: string;
    channelId?: string;
    actor?: TrustedChannelActor;
    intent?: ChannelEventIntent;
  }> = {},
): AppendChannelEventInput {
  return {
    tenantId: options.tenantId ?? TENANT_ID,
    channelId: options.channelId ?? CHANNEL_ID,
    actor: options.actor ?? HUMAN_ACTOR,
    intent: options.intent ?? CREATED_INTENT,
  };
}

function successResponses(
  actorKind: "human" | "service" | null,
  currentSequence = "41",
  eventId = EVENT_ID,
): readonly QueryResult[] {
  const nextSequence = (BigInt(currentSequence) + 1n).toString();
  return [
    ...(actorKind === null ? [] : [queryResult([{ principal_kind: actorKind }])]),
    queryResult([{ last_event_seq: currentSequence }]),
    queryResult([{ event_seq: nextSequence }]),
    queryResult([{ event_seq: nextSequence, event_id: eventId }]),
  ];
}

function makeJournal(
  transaction: ChannelEventJournalTransactionClient,
  options: Readonly<{
    eventId?: string;
    occurredAt?: string;
    generateEventId?: () => string;
    clock?: () => string;
  }> = {},
) {
  const generateEventId = options.generateEventId ?? vi.fn(() => options.eventId ?? EVENT_ID);
  const clock = options.clock ?? vi.fn(() => options.occurredAt ?? OCCURRED_AT);
  return {
    journal: createPostgresChannelEventTransaction({
      transaction,
      generateEventId,
      clock,
    }),
    generateEventId,
    clock,
  };
}

async function captureJournalError(
  operation: Promise<unknown>,
): Promise<PostgresChannelEventJournalError> {
  let caught: unknown;
  try {
    await operation;
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PostgresChannelEventJournalError);
  return caught as PostgresChannelEventJournalError;
}

describe("frozen PostgreSQL channel event journal adapter", () => {
  it("AW010A-S6 validates tenant-leading human and service actors with FOR SHARE", async () => {
    for (const kind of ["human", "service"] as const) {
      const principalId = `${kind}_s6`;
      const actor = trustedActor({ kind, principalId });
      const transaction = new FakeTransaction(successResponses(kind));
      const { journal } = makeJournal(transaction);

      await expect(journal.append(makeInput({ actor }))).resolves.toEqual({
        eventSeq: 42n,
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
      });
      expect(transaction.queries[0]).toEqual({
        statement: ACTOR_SQL,
        values: [TENANT_ID, principalId],
      });
      expect(transaction.remainingResponses).toBe(0);
    }
  });

  it("AW010A-S6 rejects a missing same-tenant actor before generators or allocation", async () => {
    const transaction = new FakeTransaction([queryResult([])]);
    const generateEventId = vi.fn(() => EVENT_ID);
    const clock = vi.fn(() => OCCURRED_AT);
    const { journal } = makeJournal(transaction, { generateEventId, clock });

    const error = await captureJournalError(journal.append(makeInput()));

    expect(error.code).toBe("CHANNEL_ACTOR_NOT_FOUND");
    expect(transaction.queries).toEqual([
      { statement: ACTOR_SQL, values: [TENANT_ID, PRINCIPAL_ID] },
    ]);
    expect(generateEventId).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  it("AW010A-S6 rejects an actor kind mismatch before generators or allocation", async () => {
    const transaction = new FakeTransaction([queryResult([{ principal_kind: "service" }])]);
    const generateEventId = vi.fn(() => EVENT_ID);
    const clock = vi.fn(() => OCCURRED_AT);
    const { journal } = makeJournal(transaction, { generateEventId, clock });

    const error = await captureJournalError(journal.append(makeInput()));

    expect(error.code).toBe("CHANNEL_ACTOR_KIND_MISMATCH");
    expect(transaction.queries).toHaveLength(1);
    expect(generateEventId).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  it("AW010A-S6 lets the allowlisted lifecycle system actor skip principal lookup", async () => {
    const transaction = new FakeTransaction(successResponses(null));
    const { journal } = makeJournal(transaction);

    await expect(journal.append(makeInput({ actor: SYSTEM_ACTOR }))).resolves.toEqual({
      eventSeq: 42n,
      eventId: EVENT_ID,
      occurredAt: OCCURRED_AT,
    });
    expect(transaction.queries[0]).toEqual({
      statement: STATE_SQL,
      values: [TENANT_ID, CHANNEL_ID],
    });
    expect(transaction.queries.some(({ statement }) => statement === ACTOR_SQL)).toBe(false);
  });

  it("AW010A-S6 rejects every non-allowlisted system actor before any query", async () => {
    const changingKindGetter = vi.fn(() => "system").mockReturnValueOnce("human");
    const changingPrincipalIdGetter = vi
      .fn(() => "system:channel-lifecycle")
      .mockReturnValueOnce("system:root-s6");
    const throwingGetter = vi.fn(() => {
      throw new Error("actor-getter-secret-s6");
    });
    const ownKeysTrap = vi.fn(() => {
      throw new Error("actor-own-keys-secret-s6");
    });
    const descriptorTrap = vi.fn(() => {
      throw new Error("actor-descriptor-secret-s6");
    });
    const fixedErrorDescriptorTrap = vi.fn(() => {
      throw new PostgresChannelEventJournalError("CHANNEL_STREAM_EXHAUSTED");
    });
    const extraAccessor = vi.fn(() => {
      throw new Error("actor-extra-secret-s6");
    });
    const actorData = {
      kind: "human",
      principalId: "system:channel-lifecycle",
    };
    const actorCases: readonly Readonly<{
      actor: TrustedChannelActor;
      verifyReflection?: () => void;
    }>[] = [
      {
        actor: {
          kind: "system",
          principalId: "system:root-s6",
        } as unknown as TrustedChannelActor,
      },
      {
        actor: Object.defineProperties(
          {},
          {
            kind: { enumerable: true, get: changingKindGetter },
            principalId: {
              enumerable: true,
              value: "system:channel-lifecycle",
            },
          },
        ) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(changingKindGetter).not.toHaveBeenCalled(),
      },
      {
        actor: Object.defineProperties(
          {},
          {
            kind: { enumerable: true, value: "system" },
            principalId: {
              enumerable: true,
              get: changingPrincipalIdGetter,
            },
          },
        ) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(changingPrincipalIdGetter).not.toHaveBeenCalled(),
      },
      {
        actor: Object.defineProperties(
          {},
          {
            kind: { enumerable: true, get: throwingGetter },
            principalId: {
              enumerable: true,
              value: "system:channel-lifecycle",
            },
          },
        ) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(throwingGetter).not.toHaveBeenCalled(),
      },
      {
        actor: new Proxy(actorData, { ownKeys: ownKeysTrap }) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(ownKeysTrap).toHaveBeenCalledOnce(),
      },
      {
        actor: new Proxy(actorData, {
          getOwnPropertyDescriptor: descriptorTrap,
        }) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(descriptorTrap).toHaveBeenCalledOnce(),
      },
      {
        actor: new Proxy(actorData, {
          getOwnPropertyDescriptor: fixedErrorDescriptorTrap,
        }) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(fixedErrorDescriptorTrap).toHaveBeenCalledOnce(),
      },
      {
        actor: Object.assign(Object.create({ inherited: true }), actorData) as TrustedChannelActor,
      },
      {
        actor: Object.create({
          kind: "system",
          principalId: "system:channel-lifecycle",
        }) as TrustedChannelActor,
      },
      {
        actor: {
          ...actorData,
          [Symbol("actor-symbol-s6")]: true,
        } as unknown as TrustedChannelActor,
      },
      {
        actor: {
          ...actorData,
          extra: true,
        } as unknown as TrustedChannelActor,
      },
      {
        actor: Object.defineProperty({ ...actorData }, "extra", {
          enumerable: true,
          get: extraAccessor,
        }) as unknown as TrustedChannelActor,
        verifyReflection: () => expect(extraAccessor).not.toHaveBeenCalled(),
      },
    ];

    for (const testCase of actorCases) {
      const transaction = new FakeTransaction([]);
      const generateEventId = vi.fn(() => EVENT_ID);
      const clock = vi.fn(() => OCCURRED_AT);
      const { journal } = makeJournal(transaction, { generateEventId, clock });
      const error = await captureJournalError(journal.append(makeInput({ actor: testCase.actor })));

      expect(error).toMatchObject({
        name: "PostgresChannelEventJournalError",
        code: "CHANNEL_ACTOR_INVALID",
        message: "Channel actor is invalid.",
      });
      expect(Object.hasOwn(error, "cause")).toBe(false);
      expect(error.message).not.toMatch(/secret|getter|descriptor|proxy|input/i);
      expect(transaction.queries).toEqual([]);
      expect(generateEventId).not.toHaveBeenCalled();
      expect(clock).not.toHaveBeenCalled();
      testCase.verifyReflection?.();
    }
  });

  it("AW010A-S6 locks tenant-leading stream state with FOR UPDATE and text bigint", async () => {
    const transaction = new FakeTransaction(successResponses(null, "8"));
    const { journal } = makeJournal(transaction);

    await journal.append(makeInput({ actor: SYSTEM_ACTOR }));

    expect(transaction.queries[0]).toEqual({
      statement: STATE_SQL,
      values: [TENANT_ID, CHANNEL_ID],
    });
    expect(STATE_SQL).toContain("last_event_seq::text AS last_event_seq");
    expect(STATE_SQL.indexOf("tenant_id = $1")).toBeLessThan(STATE_SQL.indexOf("channel_id = $2"));
  });

  it("AW010A-S6 fails closed when channel stream state is missing", async () => {
    const transaction = new FakeTransaction([queryResult([])]);
    const generateEventId = vi.fn(() => EVENT_ID);
    const clock = vi.fn(() => OCCURRED_AT);
    const { journal } = makeJournal(transaction, { generateEventId, clock });

    const error = await captureJournalError(journal.append(makeInput({ actor: SYSTEM_ACTOR })));

    expect(error.code).toBe("CHANNEL_STREAM_STATE_MISSING");
    expect(transaction.queries).toEqual([
      { statement: STATE_SQL, values: [TENANT_ID, CHANNEL_ID] },
    ]);
    expect(generateEventId).toHaveBeenCalledOnce();
    expect(clock).toHaveBeenCalledOnce();
  });

  it("AW010A-S6 detects bigint-max exhaustion and rejects malformed locked state", async () => {
    const cases = [
      { value: MAX_PG_BIGINT, code: "CHANNEL_STREAM_EXHAUSTED" },
      { value: "01", code: "CHANNEL_STREAM_ALLOCATION_FAILED" },
      { value: "-1", code: "CHANNEL_STREAM_ALLOCATION_FAILED" },
      { value: "9223372036854775808", code: "CHANNEL_STREAM_ALLOCATION_FAILED" },
      { value: 7, code: "CHANNEL_STREAM_ALLOCATION_FAILED" },
    ] as const;

    for (const testCase of cases) {
      const transaction = new FakeTransaction([queryResult([{ last_event_seq: testCase.value }])]);
      const { journal } = makeJournal(transaction);
      const error = await captureJournalError(journal.append(makeInput({ actor: SYSTEM_ACTOR })));

      expect(error.code).toBe(testCase.code);
      expect(transaction.queries).toHaveLength(1);
    }
  });

  it("AW010A-S6 uses a guarded bigint update without lossy Number conversion", async () => {
    const currentSequence = "9007199254740993";
    const expectedSequence = 9_007_199_254_740_994n;
    const transaction = new FakeTransaction(successResponses(null, currentSequence));
    const { journal } = makeJournal(transaction);

    const result = await journal.append(makeInput({ actor: SYSTEM_ACTOR }));

    expect(transaction.queries[1]).toEqual({
      statement: UPDATE_SQL,
      values: [TENANT_ID, CHANNEL_ID, currentSequence],
    });
    expect(result.eventSeq).toBe(expectedSequence);
    expect(typeof result.eventSeq).toBe("bigint");
  });

  it("AW010A-S6 re-reads only zero-row updates to map status and otherwise fails closed", async () => {
    const zeroRowCases: readonly Readonly<{
      status: QueryResult;
      code:
        | "CHANNEL_STREAM_STATE_MISSING"
        | "CHANNEL_STREAM_EXHAUSTED"
        | "CHANNEL_STREAM_ALLOCATION_FAILED";
    }>[] = [
      {
        status: queryResult([]),
        code: "CHANNEL_STREAM_STATE_MISSING",
      },
      {
        status: queryResult([{ last_event_seq: MAX_PG_BIGINT }]),
        code: "CHANNEL_STREAM_EXHAUSTED",
      },
      {
        status: queryResult([{ last_event_seq: "5" }]),
        code: "CHANNEL_STREAM_ALLOCATION_FAILED",
      },
    ];

    for (const testCase of zeroRowCases) {
      const transaction = new FakeTransaction([
        queryResult([{ last_event_seq: "5" }]),
        queryResult([]),
        testCase.status,
      ]);
      const { journal } = makeJournal(transaction);
      const error = await captureJournalError(journal.append(makeInput({ actor: SYSTEM_ACTOR })));

      expect(error.code).toBe(testCase.code);
      expect(transaction.queries.map(({ statement }) => statement)).toEqual([
        STATE_SQL,
        UPDATE_SQL,
        STATE_SQL,
      ]);
      expect(transaction.queries).toHaveLength(3);
      expect(transaction.remainingResponses).toBe(0);
    }

    const malformedUpdates: readonly QueryResult[] = [
      queryResult([{ event_seq: "6" }], 0),
      queryResult([], 1),
      queryResult([{}]),
      queryResult([{ event_seq: "7" }]),
      queryResult([{ event_seq: "malformed-update-s6" }]),
      queryResult([{ event_seq: 6 }]),
      queryResult([{ event_seq: "6" }, { event_seq: "6" }], 1),
      queryResult([{ event_seq: "6" }], 2),
      { rows: [{ event_seq: "6" }], rowCount: null } as unknown as QueryResult,
    ];

    for (const update of malformedUpdates) {
      const transaction = new FakeTransaction([
        queryResult([{ last_event_seq: "5" }]),
        update,
        queryResult([{ last_event_seq: MAX_PG_BIGINT }]),
      ]);
      const { journal } = makeJournal(transaction);
      const error = await captureJournalError(journal.append(makeInput({ actor: SYSTEM_ACTOR })));

      expect(error.code).toBe("CHANNEL_STREAM_ALLOCATION_FAILED");
      expect(transaction.queries.map(({ statement }) => statement)).toEqual([
        STATE_SQL,
        UPDATE_SQL,
      ]);
      expect(transaction.queries).toHaveLength(2);
      expect(transaction.remainingResponses).toBe(1);
    }
  });

  it("AW010A-S6 ignores forged envelope fields and calls each server generator exactly once", async () => {
    const ignoredEnvelopeGetter = vi.fn(() => {
      throw new Error("ignored-envelope-secret-s6");
    });
    const forgedInput = {
      ...makeInput({ actor: SYSTEM_ACTOR }),
      schema_version: 99,
      event_id: "evt_forged_s6",
      event_seq: "999",
      event_type: "forged.event",
      occurred_at: "1900-01-01T00:00:00Z",
      tenant_id: "ten_forged_s6",
      channel_id: "chn_forged_s6",
      payload: { forged: true },
    } as unknown as AppendChannelEventInput;
    Object.defineProperty(forgedInput, "ignored_accessor_s6", {
      enumerable: true,
      get: ignoredEnvelopeGetter,
    });
    const transaction = new FakeTransaction(successResponses(null));
    const generateEventId = vi.fn(() => EVENT_ID);
    const clock = vi.fn(() => OCCURRED_AT);
    const { journal } = makeJournal(transaction, { generateEventId, clock });

    await expect(journal.append(forgedInput)).resolves.toEqual({
      eventSeq: 42n,
      eventId: EVENT_ID,
      occurredAt: OCCURRED_AT,
    });
    expect(generateEventId).toHaveBeenCalledOnce();
    expect(clock).toHaveBeenCalledOnce();
    expect(ignoredEnvelopeGetter).not.toHaveBeenCalled();
    expect(transaction.queries[2]?.values).toEqual([
      TENANT_ID,
      CHANNEL_ID,
      "42",
      EVENT_ID,
      1,
      "message.created",
      "system:channel-lifecycle",
      "system",
      OCCURRED_AT,
      JSON.stringify(CREATED_INTENT.payload),
    ]);
  });

  it("AW010A-S6 rejects forged correlation, payload, ID, actor relation, or timestamp before allocation", async () => {
    const mismatchedIntent = {
      eventType: "message.deleted",
      payload: CREATED_INTENT.payload,
    } as unknown as ChannelEventIntent;
    const extraPayloadIntent = {
      eventType: "message.deleted",
      payload: { message_id: "msg_s6", version: 2, injected_payload_s6: true },
    } as unknown as ChannelEventIntent;
    const reactionIntent = {
      eventType: "reaction.changed",
      payload: {
        message_id: "msg_s6",
        reactor_principal_id: "prn_someone_else_s6",
        reaction_key: "wave",
        present: true,
      },
    } satisfies ChannelEventIntent;
    const topLevelTenantGetter = vi.fn(() => TENANT_ID);
    const topLevelIntentGetter = vi.fn(() => CREATED_INTENT);
    const nestedPayloadGetter = vi.fn(() => "msg_s6");
    const payloadOwnKeysTrap = vi.fn(() => {
      throw new Error("payload-own-keys-secret-s6");
    });
    const payloadDescriptorTrap = vi.fn(() => {
      throw new Error("payload-descriptor-secret-s6");
    });
    const topLevelTenantAccessorInput = makeInput();
    Object.defineProperty(topLevelTenantAccessorInput, "tenantId", {
      enumerable: true,
      get: topLevelTenantGetter,
    });
    const topLevelIntentAccessorInput = makeInput();
    Object.defineProperty(topLevelIntentAccessorInput, "intent", {
      enumerable: true,
      get: topLevelIntentGetter,
    });
    const nestedAccessorIntent = {
      eventType: "message.created",
      payload: Object.defineProperty({ ...CREATED_INTENT.payload }, "message_id", {
        enumerable: true,
        get: nestedPayloadGetter,
      }),
    } as unknown as ChannelEventIntent;
    const cyclicPayload: Record<string, unknown> = { ...CREATED_INTENT.payload };
    cyclicPayload.cycle = cyclicPayload;
    const cyclicIntent = {
      eventType: "message.created",
      payload: cyclicPayload,
    } as unknown as ChannelEventIntent;
    const payloadOwnKeysProxyIntent = {
      eventType: "message.created",
      payload: new Proxy({ ...CREATED_INTENT.payload }, { ownKeys: payloadOwnKeysTrap }),
    } as unknown as ChannelEventIntent;
    const payloadDescriptorProxyIntent = {
      eventType: "message.created",
      payload: new Proxy(
        { ...CREATED_INTENT.payload },
        { getOwnPropertyDescriptor: payloadDescriptorTrap },
      ),
    } as unknown as ChannelEventIntent;
    const cases: readonly Readonly<{
      input: AppendChannelEventInput;
      eventId: string;
      occurredAt: string;
      responses: readonly QueryResult[];
      expectedQueries: number;
      expectedGeneratorCalls: 0 | 1;
      verifyReflection?: () => void;
    }>[] = [
      {
        input: makeInput({ actor: SYSTEM_ACTOR, intent: mismatchedIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 1,
      },
      {
        input: makeInput({ actor: SYSTEM_ACTOR, intent: extraPayloadIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 1,
      },
      {
        input: makeInput({ actor: SYSTEM_ACTOR }),
        eventId: "",
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 1,
      },
      {
        input: makeInput({ actor: SYSTEM_ACTOR }),
        eventId: EVENT_ID,
        occurredAt: "2026-08-25T12:34:56.1234567Z",
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 1,
      },
      {
        input: makeInput({ intent: reactionIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [queryResult([{ principal_kind: "human" }])],
        expectedQueries: 1,
        expectedGeneratorCalls: 1,
      },
      {
        input: topLevelTenantAccessorInput,
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 0,
        verifyReflection: () => expect(topLevelTenantGetter).not.toHaveBeenCalled(),
      },
      {
        input: topLevelIntentAccessorInput,
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 0,
        verifyReflection: () => expect(topLevelIntentGetter).not.toHaveBeenCalled(),
      },
      {
        input: makeInput({ intent: nestedAccessorIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 0,
        verifyReflection: () => expect(nestedPayloadGetter).not.toHaveBeenCalled(),
      },
      {
        input: makeInput({ intent: cyclicIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 0,
      },
      {
        input: makeInput({ intent: payloadOwnKeysProxyIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 0,
        verifyReflection: () => expect(payloadOwnKeysTrap).toHaveBeenCalledOnce(),
      },
      {
        input: makeInput({ intent: payloadDescriptorProxyIntent }),
        eventId: EVENT_ID,
        occurredAt: OCCURRED_AT,
        responses: [],
        expectedQueries: 0,
        expectedGeneratorCalls: 0,
        verifyReflection: () => expect(payloadDescriptorTrap).toHaveBeenCalledOnce(),
      },
    ];

    for (const testCase of cases) {
      const transaction = new FakeTransaction(testCase.responses);
      const generateEventId = vi.fn(() => testCase.eventId);
      const clock = vi.fn(() => testCase.occurredAt);
      const { journal } = makeJournal(transaction, { generateEventId, clock });
      const error = await captureJournalError(journal.append(testCase.input));

      expect(error.code).toBe("CHANNEL_EVENT_INVALID");
      expect(error.message).toBe("Channel event is invalid.");
      expect(Object.hasOwn(error, "cause")).toBe(false);
      expect(error.message).not.toMatch(/secret|getter|descriptor|proxy|input/i);
      expect(transaction.queries).toHaveLength(testCase.expectedQueries);
      expect(transaction.queries.some(({ statement }) => statement === STATE_SQL)).toBe(false);
      expect(generateEventId).toHaveBeenCalledTimes(testCase.expectedGeneratorCalls);
      expect(clock).toHaveBeenCalledTimes(testCase.expectedGeneratorCalls);
      testCase.verifyReflection?.();
    }
  });

  it("AW010A-S6 inserts exactly ten parameterized columns with explicit JSON payload", async () => {
    const transaction = new FakeTransaction(successResponses(null, "8"));
    const { journal } = makeJournal(transaction);

    await journal.append(makeInput({ actor: SYSTEM_ACTOR }));

    expect(transaction.queries[2]).toEqual({
      statement: INSERT_SQL,
      values: [
        TENANT_ID,
        CHANNEL_ID,
        "9",
        EVENT_ID,
        1,
        "message.created",
        "system:channel-lifecycle",
        "system",
        OCCURRED_AT,
        '{"message_id":"msg_s6","thread_root_id":null,"version":1,"resolved_mention_principal_ids":["prn_mentioned_s6"],"resolved_mention_items":[{"principal_id":"prn_mentioned_s6","mention_item_id":"mit_s6"}]}',
      ],
    });
    expect(INSERT_SQL).not.toContain("created_at");
  });

  it("AW010A-S6 rejects insert cardinality or identity mismatches and returns bigint identity", async () => {
    const failureRows: readonly QueryResult[] = [
      queryResult([]),
      queryResult(
        [
          { event_seq: "6", event_id: EVENT_ID },
          { event_seq: "6", event_id: EVENT_ID },
        ],
        1,
      ),
      queryResult([{ event_seq: "7", event_id: EVENT_ID }]),
      queryResult([{ event_seq: "6", event_id: "evt_wrong_s6" }]),
      queryResult([{ event_seq: "6", event_id: EVENT_ID }], 2),
    ];

    for (const insertResult of failureRows) {
      const transaction = new FakeTransaction([
        queryResult([{ last_event_seq: "5" }]),
        queryResult([{ event_seq: "6" }]),
        insertResult,
      ]);
      const { journal } = makeJournal(transaction);
      const error = await captureJournalError(journal.append(makeInput({ actor: SYSTEM_ACTOR })));
      expect(error.code).toBe("CHANNEL_EVENT_INSERT_FAILED");
    }

    const currentSequence = "9007199254740993";
    const transaction = new FakeTransaction(successResponses(null, currentSequence));
    const { journal } = makeJournal(transaction);
    await expect(journal.append(makeInput({ actor: SYSTEM_ACTOR }))).resolves.toEqual({
      eventSeq: 9_007_199_254_740_994n,
      eventId: EVENT_ID,
      occurredAt: OCCURRED_AT,
    });
  });

  it("AW010A-S6 keeps every custom error code and diagnostic fixed and row-free", async () => {
    const leakTokens = [
      "ten_secret_s6",
      "chn_secret_s6",
      "prn_secret_s6",
      "payload_secret_s6",
      "row_secret_s6",
      "evt_row_secret_s6",
    ];
    const secretInput = makeInput({
      tenantId: leakTokens[0],
      channelId: leakTokens[1],
      actor: trustedActor({ kind: "human", principalId: leakTokens[2] }),
    });
    const invalidPayload = {
      eventType: "message.deleted",
      payload: { message_id: leakTokens[3], version: 1 },
    } as unknown as ChannelEventIntent;
    const cases: readonly Readonly<{
      code:
        | "CHANNEL_ACTOR_INVALID"
        | "CHANNEL_ACTOR_NOT_FOUND"
        | "CHANNEL_ACTOR_KIND_MISMATCH"
        | "CHANNEL_EVENT_INVALID"
        | "CHANNEL_STREAM_STATE_MISSING"
        | "CHANNEL_STREAM_EXHAUSTED"
        | "CHANNEL_STREAM_ALLOCATION_FAILED"
        | "CHANNEL_EVENT_INSERT_FAILED";
      message: string;
      run: () => Promise<unknown>;
    }>[] = [
      {
        code: "CHANNEL_ACTOR_INVALID",
        message: "Channel actor is invalid.",
        run: () => {
          const actor = {
            kind: "system",
            principalId: leakTokens[2],
          } as unknown as TrustedChannelActor;
          return makeJournal(new FakeTransaction([])).journal.append(makeInput({ actor }));
        },
      },
      {
        code: "CHANNEL_ACTOR_NOT_FOUND",
        message: "Channel actor was not found.",
        run: () => makeJournal(new FakeTransaction([queryResult([])])).journal.append(secretInput),
      },
      {
        code: "CHANNEL_ACTOR_KIND_MISMATCH",
        message: "Channel actor kind does not match.",
        run: () =>
          makeJournal(
            new FakeTransaction([queryResult([{ principal_kind: "service" }])]),
          ).journal.append(secretInput),
      },
      {
        code: "CHANNEL_EVENT_INVALID",
        message: "Channel event is invalid.",
        run: () =>
          makeJournal(new FakeTransaction([])).journal.append(
            makeInput({ actor: SYSTEM_ACTOR, intent: invalidPayload }),
          ),
      },
      {
        code: "CHANNEL_STREAM_STATE_MISSING",
        message: "Channel stream state is missing.",
        run: () =>
          makeJournal(new FakeTransaction([queryResult([])])).journal.append(
            makeInput({ actor: SYSTEM_ACTOR }),
          ),
      },
      {
        code: "CHANNEL_STREAM_EXHAUSTED",
        message: "Channel stream is exhausted.",
        run: () =>
          makeJournal(
            new FakeTransaction([queryResult([{ last_event_seq: MAX_PG_BIGINT }])]),
          ).journal.append(makeInput({ actor: SYSTEM_ACTOR })),
      },
      {
        code: "CHANNEL_STREAM_ALLOCATION_FAILED",
        message: "Channel stream sequence allocation failed.",
        run: () =>
          makeJournal(
            new FakeTransaction([
              queryResult([{ last_event_seq: "5" }]),
              queryResult([]),
              queryResult([{ last_event_seq: leakTokens[4] }]),
            ]),
          ).journal.append(makeInput({ actor: SYSTEM_ACTOR })),
      },
      {
        code: "CHANNEL_EVENT_INSERT_FAILED",
        message: "Channel event insert failed.",
        run: () =>
          makeJournal(
            new FakeTransaction([
              queryResult([{ last_event_seq: "5" }]),
              queryResult([{ event_seq: "6" }]),
              queryResult([{ event_seq: "6", event_id: leakTokens[5], leaked: leakTokens[4] }]),
            ]),
          ).journal.append(makeInput({ actor: SYSTEM_ACTOR })),
      },
    ];

    for (const testCase of cases) {
      const error = await captureJournalError(testCase.run());
      expect(error).toMatchObject({
        name: "PostgresChannelEventJournalError",
        code: testCase.code,
        message: testCase.message,
      });
      expect(Object.hasOwn(error, "cause")).toBe(false);
      for (const leakToken of leakTokens) {
        expect(error.message).not.toContain(leakToken);
      }
      expect(error.message).not.toMatch(/zod|issue|input|row/i);
    }
  });

  it("AW010A-S6 preserves actor-prevalidation-lock-update-insert order without transaction control", async () => {
    const timeline: string[] = [];
    const transaction = new FakeTransaction(successResponses("human", "12"), (statement) => {
      const labels = new Map([
        [ACTOR_SQL, "actor-query"],
        [STATE_SQL, "state-query"],
        [UPDATE_SQL, "update-query"],
        [INSERT_SQL, "insert-query"],
      ]);
      timeline.push(labels.get(statement) ?? "unexpected-query");
    });
    const generateEventId = vi.fn(() => {
      timeline.push("generate-event-id");
      return EVENT_ID;
    });
    const clock = vi.fn(() => {
      timeline.push("clock");
      return OCCURRED_AT;
    });
    const { journal } = makeJournal(transaction, { generateEventId, clock });

    await journal.append(makeInput());

    expect(timeline).toEqual([
      "actor-query",
      "generate-event-id",
      "clock",
      "state-query",
      "update-query",
      "insert-query",
    ]);
    expect(transaction.queries.map(({ statement }) => statement)).toEqual([
      ACTOR_SQL,
      STATE_SQL,
      UPDATE_SQL,
      INSERT_SQL,
    ]);
    expect(
      transaction.queries.some(({ statement }) => /\b(?:begin|commit|rollback)\b/i.test(statement)),
    ).toBe(false);
    expect(Object.keys(journal)).toEqual(["append"]);
    expect("begin" in journal).toBe(false);
    expect("commit" in journal).toBe(false);
    expect("rollback" in journal).toBe(false);
  });
});
