import { z } from "zod";

import { ActorV1, EventSeqV1, EventTypeV1, OpaqueIdV1, UtcTimestampV1 } from "./primitives.js";

export const ResolvedMentionItemV1 = z
  .object({
    principal_id: OpaqueIdV1,
    mention_item_id: OpaqueIdV1,
  })
  .strict();

export const VersionAfterCreateV1 = z.number().int().min(2).max(Number.MAX_SAFE_INTEGER);

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

const MentionMappingV1 = z
  .object({
    resolved_mention_principal_ids: z.array(OpaqueIdV1),
    resolved_mention_items: z.array(ResolvedMentionItemV1),
  })
  .strict();

type MentionPayload = z.infer<typeof MentionMappingV1>;

function validateMentionMapping(value: MentionPayload, context: z.RefinementCtx): void {
  const principalIds = value.resolved_mention_principal_ids;
  const itemPrincipalIds = value.resolved_mention_items.map((item) => item.principal_id);
  const mentionItemIds = value.resolved_mention_items.map((item) => item.mention_item_id);

  if (new Set(principalIds).size !== principalIds.length) {
    context.addIssue({
      code: "custom",
      message: "resolved mention principal IDs must be distinct",
      path: ["resolved_mention_principal_ids"],
    });
  }

  if (new Set(itemPrincipalIds).size !== itemPrincipalIds.length) {
    context.addIssue({
      code: "custom",
      message: "resolved mention item principal IDs must be distinct",
      path: ["resolved_mention_items"],
    });
  }

  if (new Set(mentionItemIds).size !== mentionItemIds.length) {
    context.addIssue({
      code: "custom",
      message: "resolved mention item IDs must be distinct",
      path: ["resolved_mention_items"],
    });
  }

  const principalSet = new Set(principalIds);
  const itemPrincipalSet = new Set(itemPrincipalIds);
  const setsMatch =
    principalSet.size === itemPrincipalSet.size &&
    [...principalSet].every((principalId) => itemPrincipalSet.has(principalId));

  if (!setsMatch) {
    context.addIssue({
      code: "custom",
      message: "resolved mention principal sets must match exactly",
      path: ["resolved_mention_items"],
    });
  }
}

const MessageCreatedPayloadV1 = z
  .object({
    message_id: OpaqueIdV1,
    thread_root_id: OpaqueIdV1.nullable(),
    version: z.literal(1),
    ...MentionMappingV1.shape,
  })
  .strict()
  .superRefine(validateMentionMapping);

const MessageEditedPayloadV1 = z
  .object({
    message_id: OpaqueIdV1,
    version: VersionAfterCreateV1,
    ...MentionMappingV1.shape,
  })
  .strict()
  .superRefine(validateMentionMapping);

const MessageDeletedPayloadV1 = z
  .object({
    message_id: OpaqueIdV1,
    version: VersionAfterCreateV1,
  })
  .strict();

const ReactionChangedPayloadV1 = z
  .object({
    message_id: OpaqueIdV1,
    reactor_principal_id: OpaqueIdV1,
    reaction_key: z.string(),
    present: z.boolean(),
  })
  .strict();

const ChannelMemberJoinedPayloadV1 = z
  .object({
    principal_id: OpaqueIdV1,
    membership_epoch: OpaqueIdV1,
    history_mode: z.enum(["full", "since_join"]),
  })
  .strict();

const ChannelMemberLeftPayloadV1 = z
  .object({
    principal_id: OpaqueIdV1,
    membership_epoch: OpaqueIdV1,
    reason_code: z.string().min(1),
  })
  .strict();

const ChannelMemberRevokedPayloadV1 = z
  .object({
    principal_id: OpaqueIdV1,
    membership_epoch: OpaqueIdV1,
    reason_code: z.string().min(1),
  })
  .strict();

export const MessageCreatedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("message.created"),
  payload: MessageCreatedPayloadV1,
}).strict();

export const MessageEditedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("message.edited"),
  payload: MessageEditedPayloadV1,
}).strict();

export const MessageDeletedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("message.deleted"),
  payload: MessageDeletedPayloadV1,
}).strict();

export const ReactionChangedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("reaction.changed"),
  payload: ReactionChangedPayloadV1,
})
  .strict()
  .superRefine((event, context) => {
    if (
      event.actor.kind !== "system" &&
      event.actor.principal_id !== event.payload.reactor_principal_id
    ) {
      context.addIssue({
        code: "custom",
        message: "non-system actor principal must equal reactor principal",
        path: ["payload", "reactor_principal_id"],
      });
    }
  });

export const ChannelMemberJoinedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("channel.member_joined"),
  payload: ChannelMemberJoinedPayloadV1,
}).strict();

export const ChannelMemberLeftV1 = EventEnvelopeV1.extend({
  event_type: z.literal("channel.member_left"),
  payload: ChannelMemberLeftPayloadV1,
}).strict();

export const ChannelMemberRevokedV1 = EventEnvelopeV1.extend({
  event_type: z.literal("channel.member_revoked"),
  payload: ChannelMemberRevokedPayloadV1,
}).strict();

export const DurableEventV1 = z.discriminatedUnion("event_type", [
  MessageCreatedV1,
  MessageEditedV1,
  MessageDeletedV1,
  ReactionChangedV1,
  ChannelMemberJoinedV1,
  ChannelMemberLeftV1,
  ChannelMemberRevokedV1,
]);
