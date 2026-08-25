import { z } from "zod";

const MAX_PG_BIGINT = 9_223_372_036_854_775_807n;
const EVENT_SEQ_PATTERN = /^[1-9][0-9]{0,18}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export const OpaqueIdV1 = z.string().min(1).max(255);

export const CursorV1 = z.string().min(1).max(4096).brand<"ChannelCursorV1">();

export const EventSeqV1 = z
  .string()
  .regex(EVENT_SEQ_PATTERN)
  .refine(
    (value) => !EVENT_SEQ_PATTERN.test(value) || BigInt(value) <= MAX_PG_BIGINT,
    "event_seq exceeds BIGINT",
  );

export const UtcTimestampV1 = z.string().datetime({ offset: false }).regex(UTC_TIMESTAMP_PATTERN);

export const EventTypeV1 = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/);

export const ActorV1 = z
  .object({
    principal_id: OpaqueIdV1,
    kind: z.enum(["human", "service", "system"]),
  })
  .strict();
