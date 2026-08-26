import type { ChannelEventTransaction } from "@agent-workspace/chat-core";
import { DurableEventV1 } from "@agent-workspace/contracts";

const MAX_PG_BIGINT = 9_223_372_036_854_775_807n;
const NONNEGATIVE_PG_BIGINT_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/;
const CANONICAL_UTC_MICROSECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

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

type ChannelEventJournalErrorCode =
  | "CHANNEL_ACTOR_INVALID"
  | "CHANNEL_ACTOR_NOT_FOUND"
  | "CHANNEL_ACTOR_KIND_MISMATCH"
  | "CHANNEL_EVENT_INVALID"
  | "CHANNEL_STREAM_STATE_MISSING"
  | "CHANNEL_STREAM_EXHAUSTED"
  | "CHANNEL_STREAM_ALLOCATION_FAILED"
  | "CHANNEL_EVENT_INSERT_FAILED";

const ERROR_MESSAGES = {
  CHANNEL_ACTOR_INVALID: "Channel actor is invalid.",
  CHANNEL_ACTOR_NOT_FOUND: "Channel actor was not found.",
  CHANNEL_ACTOR_KIND_MISMATCH: "Channel actor kind does not match.",
  CHANNEL_EVENT_INVALID: "Channel event is invalid.",
  CHANNEL_STREAM_STATE_MISSING: "Channel stream state is missing.",
  CHANNEL_STREAM_EXHAUSTED: "Channel stream is exhausted.",
  CHANNEL_STREAM_ALLOCATION_FAILED: "Channel stream sequence allocation failed.",
  CHANNEL_EVENT_INSERT_FAILED: "Channel event insert failed.",
} as const satisfies Readonly<Record<ChannelEventJournalErrorCode, string>>;

type QueryRow = Readonly<Record<string, unknown>>;
type QueryResult = Readonly<{
  rows: readonly QueryRow[];
  rowCount: number;
}>;
type ActorSnapshot = Readonly<{
  kind: "human" | "service" | "system";
  principalId: string;
}>;
type IntentSnapshot = Readonly<{
  eventType: unknown;
  payload: unknown;
}>;
type InputSnapshot = Readonly<{
  tenantId: unknown;
  channelId: unknown;
  actor: ActorSnapshot;
  intent: IntentSnapshot;
}>;
type SnapshotErrorCode = "CHANNEL_ACTOR_INVALID" | "CHANNEL_EVENT_INVALID";
type LockedSequenceState =
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "value"; text: string; value: bigint }>;
type DurableEvent = ReturnType<typeof DurableEventV1.parse>;

export interface ChannelEventJournalTransactionClient {
  query(statement: string, values: readonly unknown[]): Promise<QueryResult>;
}

export class PostgresChannelEventJournalError extends Error {
  readonly code: ChannelEventJournalErrorCode;

  constructor(code: ChannelEventJournalErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PostgresChannelEventJournalError";
    this.code = code;
  }
}

function journalError(code: ChannelEventJournalErrorCode): PostgresChannelEventJournalError {
  return new PostgresChannelEventJournalError(code);
}

function reflectOrSnapshotError<Value>(
  operation: () => Value,
  errorCode: SnapshotErrorCode,
): Value {
  try {
    return operation();
  } catch {
    throw journalError(errorCode);
  }
}

function getOwnDataDescriptor(
  record: object,
  key: PropertyKey,
  errorCode: SnapshotErrorCode,
): unknown {
  const descriptor = reflectOrSnapshotError(
    () => Object.getOwnPropertyDescriptor(record, key),
    errorCode,
  );
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    "get" in descriptor ||
    "set" in descriptor
  ) {
    throw journalError(errorCode);
  }
  return descriptor.value;
}

function getOwnEnumerableDataDescriptor(
  record: object,
  key: PropertyKey,
  errorCode: SnapshotErrorCode,
): unknown {
  const descriptor = reflectOrSnapshotError(
    () => Object.getOwnPropertyDescriptor(record, key),
    errorCode,
  );
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    "get" in descriptor ||
    "set" in descriptor ||
    descriptor.enumerable !== true
  ) {
    throw journalError(errorCode);
  }
  return descriptor.value;
}

function hasExactStringKeys(
  keys: readonly PropertyKey[],
  expectedKeys: readonly string[],
): boolean {
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string")) {
    return false;
  }
  const keySet = new Set(keys);
  return expectedKeys.every((key) => keySet.has(key));
}

function readActor(value: unknown): ActorSnapshot {
  if (
    typeof value !== "object" ||
    value === null ||
    reflectOrSnapshotError(() => Array.isArray(value), "CHANNEL_ACTOR_INVALID")
  ) {
    throw journalError("CHANNEL_ACTOR_INVALID");
  }

  const prototype = reflectOrSnapshotError(
    () => Object.getPrototypeOf(value),
    "CHANNEL_ACTOR_INVALID",
  );
  if (prototype !== Object.prototype && prototype !== null) {
    throw journalError("CHANNEL_ACTOR_INVALID");
  }
  const keys = reflectOrSnapshotError(() => Reflect.ownKeys(value), "CHANNEL_ACTOR_INVALID");
  if (!hasExactStringKeys(keys, ["kind", "principalId"])) {
    throw journalError("CHANNEL_ACTOR_INVALID");
  }

  const kind = getOwnDataDescriptor(value, "kind", "CHANNEL_ACTOR_INVALID");
  const principalId = getOwnDataDescriptor(value, "principalId", "CHANNEL_ACTOR_INVALID");
  if (typeof principalId !== "string") {
    throw journalError("CHANNEL_ACTOR_INVALID");
  }

  if (kind === "human" || kind === "service") {
    return { kind, principalId };
  }
  if (kind === "system" && principalId === "system:channel-lifecycle") {
    return { kind: "system", principalId: "system:channel-lifecycle" };
  }
  throw journalError("CHANNEL_ACTOR_INVALID");
}

function snapshotPayloadArray(value: readonly unknown[], stack: Set<object>): unknown[] {
  const keys = reflectOrSnapshotError(() => Reflect.ownKeys(value), "CHANNEL_EVENT_INVALID");
  const length = getOwnDataDescriptor(value, "length", "CHANNEL_EVENT_INVALID");
  if (
    typeof length !== "number" ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > 4_294_967_295
  ) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  if (keys.length !== length + 1 || keys.some((key) => typeof key !== "string")) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }
  const keySet = new Set(keys);
  if (!keySet.has("length")) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }
  for (let index = 0; index < length; index += 1) {
    if (!keySet.has(String(index))) {
      throw journalError("CHANNEL_EVENT_INVALID");
    }
  }

  const snapshot = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const item = getOwnEnumerableDataDescriptor(value, key, "CHANNEL_EVENT_INVALID");
    Object.defineProperty(snapshot, key, {
      value: snapshotPayloadValue(item, stack),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return snapshot;
}

function snapshotPayloadRecord(value: object, stack: Set<object>): object {
  const prototype = reflectOrSnapshotError(
    () => Object.getPrototypeOf(value),
    "CHANNEL_EVENT_INVALID",
  );
  if (prototype !== Object.prototype && prototype !== null) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  const keys = reflectOrSnapshotError(() => Reflect.ownKeys(value), "CHANNEL_EVENT_INVALID");
  if (keys.some((key) => typeof key !== "string")) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  const snapshot = Object.create(null) as Record<PropertyKey, unknown>;
  for (const key of keys) {
    const item = getOwnEnumerableDataDescriptor(value, key, "CHANNEL_EVENT_INVALID");
    Object.defineProperty(snapshot, key, {
      value: snapshotPayloadValue(item, stack),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return snapshot;
}

function snapshotPayloadValue(value: unknown, stack: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }
    throw journalError("CHANNEL_EVENT_INVALID");
  }
  if (typeof value !== "object") {
    throw journalError("CHANNEL_EVENT_INVALID");
  }
  if (stack.has(value)) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  stack.add(value);
  try {
    return reflectOrSnapshotError(() => Array.isArray(value), "CHANNEL_EVENT_INVALID")
      ? snapshotPayloadArray(value as readonly unknown[], stack)
      : snapshotPayloadRecord(value, stack);
  } finally {
    stack.delete(value);
  }
}

function snapshotPayload(value: unknown): unknown {
  return snapshotPayloadValue(value, new Set<object>());
}

function snapshotIntent(value: unknown): IntentSnapshot {
  if (
    typeof value !== "object" ||
    value === null ||
    reflectOrSnapshotError(() => Array.isArray(value), "CHANNEL_EVENT_INVALID")
  ) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  const prototype = reflectOrSnapshotError(
    () => Object.getPrototypeOf(value),
    "CHANNEL_EVENT_INVALID",
  );
  if (prototype !== Object.prototype && prototype !== null) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }
  const keys = reflectOrSnapshotError(() => Reflect.ownKeys(value), "CHANNEL_EVENT_INVALID");
  if (!hasExactStringKeys(keys, ["eventType", "payload"])) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  const eventType = getOwnDataDescriptor(value, "eventType", "CHANNEL_EVENT_INVALID");
  const payload = getOwnDataDescriptor(value, "payload", "CHANNEL_EVENT_INVALID");
  return Object.freeze({ eventType, payload: snapshotPayload(payload) });
}

function snapshotInput(input: unknown): InputSnapshot {
  if (
    typeof input !== "object" ||
    input === null ||
    reflectOrSnapshotError(() => Array.isArray(input), "CHANNEL_EVENT_INVALID")
  ) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  const tenantId = getOwnDataDescriptor(input, "tenantId", "CHANNEL_EVENT_INVALID");
  const channelId = getOwnDataDescriptor(input, "channelId", "CHANNEL_EVENT_INVALID");
  const actorValue = getOwnDataDescriptor(input, "actor", "CHANNEL_ACTOR_INVALID");
  const intentValue = getOwnDataDescriptor(input, "intent", "CHANNEL_EVENT_INVALID");
  const actor = readActor(actorValue);
  const intent = snapshotIntent(intentValue);
  return Object.freeze({ tenantId, channelId, actor, intent });
}

async function validateActor(
  transaction: ChannelEventJournalTransactionClient,
  input: InputSnapshot,
): Promise<void> {
  if (input.actor.kind === "system") {
    return;
  }

  const result = await transaction.query(ACTOR_SQL, [input.tenantId, input.actor.principalId]);
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw journalError("CHANNEL_ACTOR_NOT_FOUND");
  }

  const actorRow = result.rows[0];
  if (actorRow?.principal_kind !== input.actor.kind) {
    throw journalError("CHANNEL_ACTOR_KIND_MISMATCH");
  }
}

function parseEvent(candidate: unknown): DurableEvent {
  try {
    return DurableEventV1.parse(candidate);
  } catch {
    throw journalError("CHANNEL_EVENT_INVALID");
  }
}

function prevalidateEvent(input: InputSnapshot, eventId: string, occurredAt: string): DurableEvent {
  if (!CANONICAL_UTC_MICROSECOND_PATTERN.test(occurredAt)) {
    throw journalError("CHANNEL_EVENT_INVALID");
  }

  const { eventType, payload } = input.intent;
  return parseEvent({
    schema_version: 1,
    event_id: eventId,
    tenant_id: input.tenantId,
    channel_id: input.channelId,
    event_seq: "1",
    event_type: eventType,
    actor: {
      principal_id: input.actor.principalId,
      kind: input.actor.kind,
    },
    occurred_at: occurredAt,
    payload,
  });
}

function parsePgBigint(value: unknown): Readonly<{ text: string; value: bigint }> | undefined {
  if (typeof value !== "string" || !NONNEGATIVE_PG_BIGINT_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = BigInt(value);
  if (parsed > MAX_PG_BIGINT) {
    return undefined;
  }
  return { text: value, value: parsed };
}

function classifyLockedSequence(result: QueryResult): LockedSequenceState {
  if (result.rowCount === 0 && result.rows.length === 0) {
    return { status: "missing" };
  }
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    return { status: "invalid" };
  }

  const parsed = parsePgBigint(result.rows[0]?.last_event_seq);
  return parsed === undefined
    ? { status: "invalid" }
    : { status: "value", text: parsed.text, value: parsed.value };
}

async function readLockedSequence(
  transaction: ChannelEventJournalTransactionClient,
  tenantId: string,
  channelId: string,
): Promise<LockedSequenceState> {
  const result = await transaction.query(STATE_SQL, [tenantId, channelId]);
  return classifyLockedSequence(result);
}

function throwInitialStateError(state: Exclude<LockedSequenceState, { status: "value" }>): never {
  if (state.status === "missing") {
    throw journalError("CHANNEL_STREAM_STATE_MISSING");
  }
  throw journalError("CHANNEL_STREAM_ALLOCATION_FAILED");
}

function throwStatusRereadError(state: LockedSequenceState): never {
  if (state.status === "missing") {
    throw journalError("CHANNEL_STREAM_STATE_MISSING");
  }
  if (state.status === "value" && state.value === MAX_PG_BIGINT) {
    throw journalError("CHANNEL_STREAM_EXHAUSTED");
  }
  throw journalError("CHANNEL_STREAM_ALLOCATION_FAILED");
}

async function allocateSequence(
  transaction: ChannelEventJournalTransactionClient,
  tenantId: string,
  channelId: string,
): Promise<Readonly<{ text: string; value: bigint }>> {
  const current = await readLockedSequence(transaction, tenantId, channelId);
  if (current.status !== "value") {
    throwInitialStateError(current);
  }
  if (current.value === MAX_PG_BIGINT) {
    throw journalError("CHANNEL_STREAM_EXHAUSTED");
  }

  const expectedValue = current.value + 1n;
  const expectedText = expectedValue.toString();
  const updateResult = await transaction.query(UPDATE_SQL, [tenantId, channelId, current.text]);
  const updateRow = updateResult.rows[0];
  const updateMatches =
    updateResult.rowCount === 1 &&
    updateResult.rows.length === 1 &&
    updateRow?.event_seq === expectedText;

  if (updateMatches) {
    return { text: expectedText, value: expectedValue };
  }
  if (updateResult.rowCount === 0 && updateResult.rows.length === 0) {
    const status = await readLockedSequence(transaction, tenantId, channelId);
    throwStatusRereadError(status);
  }
  throw journalError("CHANNEL_STREAM_ALLOCATION_FAILED");
}

function withActualSequence(dummyEvent: DurableEvent, eventSequence: string): DurableEvent {
  return parseEvent({
    schema_version: dummyEvent.schema_version,
    event_id: dummyEvent.event_id,
    tenant_id: dummyEvent.tenant_id,
    channel_id: dummyEvent.channel_id,
    event_seq: eventSequence,
    event_type: dummyEvent.event_type,
    actor: {
      principal_id: dummyEvent.actor.principal_id,
      kind: dummyEvent.actor.kind,
    },
    occurred_at: dummyEvent.occurred_at,
    payload: dummyEvent.payload,
  });
}

async function insertEvent(
  transaction: ChannelEventJournalTransactionClient,
  event: DurableEvent,
): Promise<string> {
  const result = await transaction.query(INSERT_SQL, [
    event.tenant_id,
    event.channel_id,
    event.event_seq,
    event.event_id,
    event.schema_version,
    event.event_type,
    event.actor.principal_id,
    event.actor.kind,
    event.occurred_at,
    JSON.stringify(event.payload),
  ]);
  const returnedRow = result.rows[0];
  if (
    result.rowCount !== 1 ||
    result.rows.length !== 1 ||
    returnedRow?.event_seq !== event.event_seq ||
    returnedRow.event_id !== event.event_id
  ) {
    throw journalError("CHANNEL_EVENT_INSERT_FAILED");
  }
  return returnedRow.event_id;
}

export function createPostgresChannelEventTransaction(
  dependencies: Readonly<{
    transaction: ChannelEventJournalTransactionClient;
    generateEventId: () => string;
    clock: () => string;
  }>,
): ChannelEventTransaction {
  const { transaction, generateEventId, clock } = dependencies;

  return {
    async append(input) {
      const snapshot = snapshotInput(input);
      await validateActor(transaction, snapshot);

      const eventId = generateEventId();
      const occurredAt = clock();
      const dummyEvent = prevalidateEvent(snapshot, eventId, occurredAt);
      const sequence = await allocateSequence(
        transaction,
        dummyEvent.tenant_id,
        dummyEvent.channel_id,
      );
      const event = withActualSequence(dummyEvent, sequence.text);
      const returnedEventId = await insertEvent(transaction, event);

      return {
        eventSeq: sequence.value,
        eventId: returnedEventId,
        occurredAt: event.occurred_at,
      };
    },
  };
}
