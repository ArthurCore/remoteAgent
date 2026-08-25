import { DurableEventV1 } from "@agent-workspace/contracts";

type DurableEvent = ReturnType<typeof DurableEventV1.parse>;
type DurableEventType = DurableEvent["event_type"];

declare const trustedChannelActorBrand: unique symbol;

/**
 * An opaque actor capability resolved from authenticated, trusted context.
 *
 * Only authentication/actor-resolution code may mint this type. The brand is a
 * compile-time misuse barrier, not authorization proof: an adapter must recheck
 * the actor's tenant membership and allowed kind inside its database transaction.
 */
export type TrustedChannelActor = (
  | Readonly<{ kind: "human" | "service"; principalId: string }>
  | Readonly<{ kind: "system"; principalId: "system:channel-lifecycle" }>
) &
  Readonly<{ [trustedChannelActorBrand]: true }>;

type DeepReadonly<Value> = Value extends object
  ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
  : Value;

export type ChannelEventIntent = {
  [EventType in DurableEventType]: Readonly<{
    eventType: EventType;
    payload: DeepReadonly<Extract<DurableEvent, { event_type: EventType }>["payload"]>;
  }>;
}[DurableEventType];

/**
 * Trusted fields accepted by a channel-event adapter.
 *
 * Adapters must whitelist and copy exactly `tenantId`, `channelId`, `actor`, and
 * `intent`; they must never spread a caller object. They must construct the
 * persisted envelope with an adapter-owned schema version plus server-generated
 * event ID, clock value, and sequence.
 */
export type AppendChannelEventInput = Readonly<{
  tenantId: string;
  channelId: string;
  actor: TrustedChannelActor;
  intent: ChannelEventIntent;
}>;

type ExactAppendChannelEventInput<Input extends AppendChannelEventInput> = Input &
  Readonly<Record<Exclude<keyof Input, keyof AppendChannelEventInput>, never>>;

export type AppendChannelEventResult = Readonly<{
  eventSeq: bigint;
  eventId: string;
  occurredAt: string;
}>;

/**
 * A transaction-scoped append capability owned by the caller's transaction.
 *
 * It never begins, commits, or rolls back a transaction, and it must not be
 * retained or otherwise escape the caller-managed transaction scope.
 */
export interface ChannelEventTransaction {
  append<const Input extends AppendChannelEventInput>(
    input: ExactAppendChannelEventInput<Input>,
  ): Promise<AppendChannelEventResult>;
}
